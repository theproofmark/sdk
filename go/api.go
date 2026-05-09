package showad

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ClaimTicketResponse is the backend response from /api/redirect-ticket/:id/claim.
type ClaimTicketResponse struct {
	CreatorHash    string `json:"creator_hash"`
	TicketID       string `json:"ticket_id"`
	Token          string `json:"token"`
	HeaderName     string `json:"header_name"`
	Scheme         string `json:"scheme"`
	DestinationURL string `json:"destination_url"`
	RequireJWT     bool   `json:"require_jwt"`
}

// ValidateTokenResponse is the backend response from /api/sdk/validate.
type ValidateTokenResponse struct {
	Valid          bool   `json:"valid"`
	Message        string `json:"message"`
	CreatorHash    string `json:"creator_hash,omitempty"`
	ProjectHash    string `json:"project_hash,omitempty"`
	ResourceHash   string `json:"resource_hash,omitempty"`
	ResourceType   string `json:"resource_type,omitempty"`
	DestinationURL string `json:"destination_url,omitempty"`
	Fingerprint    string `json:"fingerprint,omitempty"`
	IPAddress      string `json:"ip_address,omitempty"`
}

// ClaimRedirectTicket calls the backend to exchange a redirect_ticket for a JWT.
func (c *Client) ClaimRedirectTicket(ctx context.Context, ticketID string) (*ClaimTicketResponse, error) {
	if ticketID == "" {
		return nil, NewError(ErrCodeConfigError, "ticket id is required")
	}
	url := strings.TrimRight(c.cfg.APIBaseURL, "/") + "/api/redirect-ticket/" + ticketID + "/claim"
	body, err := json.Marshal(map[string]string{"creator_hash": c.cfg.CreatorHash})
	if err != nil {
		return nil, NewError(ErrCodeConfigError, err.Error())
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, NewError(ErrCodeNetworkError, err.Error())
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Redirect-Ticket-Secret", c.cfg.RedirectSecret)
	req.Header.Set("X-ShowAd-API-Key", c.cfg.APIKey)
	req.Header.Set("X-ShowAd-Creator-Hash", c.cfg.CreatorHash)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, NewError(ErrCodeNetworkError, err.Error())
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	if resp.StatusCode != http.StatusOK {
		details := map[string]any{"ticket_id": ticketID}
		switch resp.StatusCode {
		case http.StatusGone:
			return nil, NewError(ErrCodeTicketNotFound, "redirect ticket not found or already consumed").WithStatus(resp.StatusCode).WithDetails(details)
		case http.StatusUnauthorized:
			return nil, NewError(ErrCodeTicketClaimFailed, "invalid redirect ticket secret").WithStatus(resp.StatusCode).WithDetails(details)
		case http.StatusForbidden:
			return nil, NewError(ErrCodeCreatorMismatch, "creator hash does not match ticket").WithStatus(resp.StatusCode).WithDetails(details)
		}
		return nil, NewError(ErrCodeTicketClaimFailed, fmt.Sprintf("ticket claim failed: HTTP %d: %s", resp.StatusCode, truncate(raw, 256))).WithStatus(resp.StatusCode).WithDetails(details)
	}

	var out ClaimTicketResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, NewError(ErrCodeTicketClaimFailed, "could not decode claim response: "+err.Error())
	}
	return &out, nil
}

// ValidateToken calls the backend to validate a JWT.
func (c *Client) ValidateToken(ctx context.Context, token string) (*ValidateTokenResponse, error) {
	if token == "" {
		return nil, NewError(ErrCodeTokenInvalid, "token is empty")
	}
	url := strings.TrimRight(c.cfg.APIBaseURL, "/") + "/api/sdk/validate"
	body, err := json.Marshal(map[string]string{"token": token, "sdk_key": c.cfg.APIKey})
	if err != nil {
		return nil, NewError(ErrCodeConfigError, err.Error())
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, NewError(ErrCodeNetworkError, err.Error())
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-ShowAd-API-Key", c.cfg.APIKey)
	req.Header.Set("X-ShowAd-Creator-Hash", c.cfg.CreatorHash)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, NewError(ErrCodeNetworkError, err.Error())
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	if resp.StatusCode != http.StatusOK {
		return nil, NewError(ErrCodeTokenInvalid, fmt.Sprintf("validate failed: HTTP %d", resp.StatusCode)).WithStatus(resp.StatusCode)
	}
	var out ValidateTokenResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, NewError(ErrCodeTokenInvalid, "could not decode validate response: "+err.Error())
	}
	if !out.Valid {
		return &out, NewError(ErrCodeTokenInvalid, fallback(out.Message, "token is invalid"))
	}
	return &out, nil
}

// CheckHealth pings the backend /health endpoint.
func (c *Client) CheckHealth(ctx context.Context) bool {
	url := strings.TrimRight(c.cfg.APIBaseURL, "/") + "/health"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return false
	}
	req.Header.Set("Accept", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return false
	}
	var body struct {
		Status string `json:"status"`
	}
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<14))
	if err := json.Unmarshal(raw, &body); err != nil {
		return false
	}
	return body.Status == "ok" || body.Status == "degraded"
}

func truncate(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n])
}

func fallback(s, fb string) string {
	if s != "" {
		return s
	}
	return fb
}

// defaultHTTPClient returns a sensibly-configured *http.Client used by NewClient.
func defaultHTTPClient(timeout time.Duration) *http.Client {
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	return &http.Client{Timeout: timeout}
}
