// Package proofmarkverify provides server-side token verification for ProofMark Verify,
// a CAPTCHA replacement that pays you instead of charging you.
//
// Usage:
//
//	client := proofmarkverify.New(os.Getenv("PMV_SECRET_KEY"))
//	result, err := client.Verify(r.Context(), token, r.RemoteAddr)
//	if err != nil {
//	    // Network error, HTTP error, or invalid response
//	    log.Printf("verify error: %v", err)
//	    return
//	}
//	if result.IsHuman(0.5) {
//	    // User is human with score >= 0.5
//	    // proceed with request
//	}
package proofmarkverify

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	defaultBaseURL = "https://api.proofmark.com"
	defaultTimeout = 5 * time.Second
)

// VerifyResult is the response from the siteverify endpoint.
type VerifyResult struct {
	// Success indicates the token is valid, unredeemed, and matches your secret.
	Success bool `json:"success"`

	// Score is a confidence rating (0.0–1.0) where higher scores indicate more confident human detection.
	Score float64 `json:"score"`

	// Flags contains risk signals (e.g., "datacenter_ip", "fast_completion").
	Flags []string `json:"flags"`

	// Credit is true if this was a billable verification.
	Credit bool `json:"credit"`

	// ChallengeTS is the ISO timestamp when the challenge was solved.
	ChallengeTS string `json:"challenge_ts,omitempty"`

	// Hostname is where the challenge was presented.
	Hostname string `json:"hostname,omitempty"`

	// Action is the action label if set via the widget.
	Action string `json:"action,omitempty"`

	// ErrorCodes contains error codes when success is false.
	ErrorCodes []string `json:"error-codes,omitempty"`
}

// IsHuman returns true if the verification succeeded and the score meets or exceeds the given threshold.
// Recommended thresholds: 0.3 for newsletter signup, 0.5 for free trials, 0.6 for paid signups, 0.7 for sensitive actions.
func (r VerifyResult) IsHuman(minScore float64) bool {
	return r.Success && r.Score >= minScore
}

// VerifyError represents an error during verification.
// Code indicates the error category; Err contains the underlying error if any.
type VerifyError struct {
	// Code is one of: PMV_CONFIG, PMV_TIMEOUT, PMV_NETWORK_ERROR, PMV_HTTP_ERROR, PMV_INVALID_RESPONSE
	Code string

	// Message is a human-readable description.
	Message string

	// Err is the underlying error if any.
	Err error
}

// Error implements the error interface.
func (e *VerifyError) Error() string {
	if e.Message != "" {
		return fmt.Sprintf("proofmark verify [%s]: %s", e.Code, e.Message)
	}
	if e.Err != nil {
		return fmt.Sprintf("proofmark verify [%s]: %v", e.Code, e.Err)
	}
	return fmt.Sprintf("proofmark verify [%s]", e.Code)
}

// Unwrap implements error unwrapping for errors.Is and errors.As.
func (e *VerifyError) Unwrap() error {
	return e.Err
}

// Client is a ProofMark Verify client for server-side token verification.
type Client struct {
	secret     string
	baseURL    string
	httpClient *http.Client
}

// Option is a functional option for configuring a Client.
type Option func(*Client)

// WithBaseURL overrides the default base URL (https://api.proofmark.com).
// Useful for self-hosted deployments or local development.
func WithBaseURL(u string) Option {
	return func(c *Client) {
		c.baseURL = strings.TrimRight(u, "/")
	}
}

// WithTimeout sets the HTTP client timeout. Default is 5 seconds.
func WithTimeout(d time.Duration) Option {
	return func(c *Client) {
		c.httpClient.Timeout = d
	}
}

// WithHTTPClient sets a custom HTTP client (useful for testing or custom transport).
func WithHTTPClient(h *http.Client) Option {
	return func(c *Client) {
		c.httpClient = h
	}
}

// New creates a new ProofMark Verify client with the given secret key.
// The secret key must be non-empty (e.g., pmvs_live_xxxxxxxx or pmvs_test_always_pass).
// Use functional options to customize the base URL, timeout, or HTTP client.
func New(secret string, opts ...Option) *Client {
	c := &Client{
		secret:  secret,
		baseURL: defaultBaseURL,
		httpClient: &http.Client{
			Timeout: defaultTimeout,
		},
	}

	for _, opt := range opts {
		opt(c)
	}

	return c
}

// Verify verifies a ProofMark Verify token server-side.
// token is the "pm-verify-response" value from the client form submission.
// remoteip is the end-user's IP address (optional but recommended for better risk scoring).
//
// Returns a VerifyResult on success or typical verification failures (e.g., invalid token, low score).
// Returns a non-nil error only on network errors, timeouts, non-2xx HTTP responses, or invalid JSON.
//
// If the token is empty, returns a VerifyResult with Success=false and ErrorCodes=["missing-input-response"]
// without making an HTTP call.
func (c *Client) Verify(ctx context.Context, token string, remoteip string) (*VerifyResult, error) {
	// Configuration error: missing secret
	if c.secret == "" {
		return nil, &VerifyError{
			Code:    "PMV_CONFIG",
			Message: "secret key is required",
		}
	}

	// Empty token short-circuit (no HTTP call)
	if token == "" {
		return &VerifyResult{
			Success:    false,
			Score:      0,
			ErrorCodes: []string{"missing-input-response"},
			Flags:      []string{},
		}, nil
	}

	// Build form data
	form := url.Values{}
	form.Set("secret", c.secret)
	form.Set("response", token)
	if remoteip != "" {
		form.Set("remoteip", remoteip)
	}

	// Create request
	reqURL := c.baseURL + "/v1/verify/siteverify"
	req, err := http.NewRequestWithContext(ctx, "POST", reqURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, &VerifyError{
			Code:    "PMV_NETWORK_ERROR",
			Message: "failed to create request",
			Err:     err,
		}
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	// Execute request
	resp, err := c.httpClient.Do(req)
	if err != nil {
		// Check for timeout
		if errors.Is(err, context.DeadlineExceeded) {
			return nil, &VerifyError{
				Code:    "PMV_TIMEOUT",
				Message: "verification request timed out",
				Err:     err,
			}
		}
		// Check for net.Error with Timeout()
		var netErr interface{ Timeout() bool }
		if errors.As(err, &netErr) && netErr.Timeout() {
			return nil, &VerifyError{
				Code:    "PMV_TIMEOUT",
				Message: "verification request timed out",
				Err:     err,
			}
		}
		return nil, &VerifyError{
			Code:    "PMV_NETWORK_ERROR",
			Message: "verification request failed",
			Err:     err,
		}
	}
	defer resp.Body.Close()

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, &VerifyError{
			Code:    "PMV_NETWORK_ERROR",
			Message: "failed to read response body",
			Err:     err,
		}
	}

	// Check HTTP status
	if resp.StatusCode >= 400 {
		return nil, &VerifyError{
			Code:    "PMV_HTTP_ERROR",
			Message: fmt.Sprintf("siteverify returned HTTP %d", resp.StatusCode),
		}
	}

	// Parse JSON response
	var result VerifyResult
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, &VerifyError{
			Code:    "PMV_INVALID_RESPONSE",
			Message: "failed to parse JSON response",
			Err:     err,
		}
	}

	// Ensure Flags is never nil for cleaner caller code
	if result.Flags == nil {
		result.Flags = []string{}
	}

	return &result, nil
}
