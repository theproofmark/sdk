// Package showad implements a content-gating SDK for ProofMark ShowAd.
//
// The package exposes a small Client and an http.Handler middleware factory
// (Protect) that runs the standard ShowAd verification pipeline:
//
//  1. Path matching (protected/excluded globs)
//  2. Pre-protection access policy (verified crawlers, CIDR allowlist,
//     publisher-defined hooks)
//  3. Redirect-ticket claim (when ?redirect_ticket=… is present)
//  4. JWT validation against ShowAd cookies
//  5. Redirect to the video ad host on failure
//
// The wire protocol matches the Laravel and Next.js SDKs.
package showad

import (
	"net/http"
	"time"
)

// Default endpoints for the ShowAd platform.
const (
	DefaultAPIBaseURL   = "https://ad.proofmark.io"
	DefaultVideoAdURL   = "https://showad.proofmark.io"
	DefaultCookieMaxAge = 3600
)

// Config holds the publisher credentials and SDK endpoints.
type Config struct {
	// CreatorHash identifies the creator (required).
	CreatorHash string
	// APIKey authenticates server-to-server calls (required).
	APIKey string
	// RedirectSecret authenticates redirect-ticket claims (required when claiming).
	RedirectSecret string
	// APIBaseURL overrides the backend base URL.
	APIBaseURL string
	// VideoAdURL overrides the video ad frontend URL.
	VideoAdURL string
	// CookieMaxAge sets the lifetime of verification cookies in seconds.
	CookieMaxAge int
	// HTTPTimeout caps individual backend calls.
	HTTPTimeout time.Duration
	// HTTPClient lets callers inject a custom transport (test stubs, retries…).
	HTTPClient *http.Client
	// Debug enables stderr logging via the configured logger.
	Debug bool
	// Logger is invoked with debug messages when Debug is true.
	Logger func(format string, args ...any)
	// SecureCookies forces the Secure flag on cookies. When false, the value
	// is auto-detected from the request scheme.
	SecureCookies bool
}

// Validate ensures the Config has the minimum fields populated.
func (c Config) Validate() error {
	if c.CreatorHash == "" {
		return NewError(ErrCodeConfigError, "creator hash is required")
	}
	if c.APIKey == "" {
		return NewError(ErrCodeConfigError, "api key is required")
	}
	return nil
}

// Client is the entry point to the SDK. It is safe for concurrent use.
type Client struct {
	cfg        Config
	httpClient *http.Client
}

// NewClient applies defaults and returns a *Client.
func NewClient(cfg Config) (*Client, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	if cfg.APIBaseURL == "" {
		cfg.APIBaseURL = DefaultAPIBaseURL
	}
	if cfg.VideoAdURL == "" {
		cfg.VideoAdURL = DefaultVideoAdURL
	}
	if cfg.CookieMaxAge <= 0 {
		cfg.CookieMaxAge = DefaultCookieMaxAge
	}
	if cfg.HTTPTimeout <= 0 {
		cfg.HTTPTimeout = 10 * time.Second
	}

	hc := cfg.HTTPClient
	if hc == nil {
		hc = defaultHTTPClient(cfg.HTTPTimeout)
	}

	return &Client{cfg: cfg, httpClient: hc}, nil
}

// Config returns a copy of the client's configuration.
func (c *Client) Config() Config { return c.cfg }
