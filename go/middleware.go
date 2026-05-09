package showad

import (
	"net/http"
	"net/url"
	"strings"
)

// FailureReason classifies why a verification step failed.
type FailureReason string

const (
	ReasonNoFingerprint     FailureReason = "no_fingerprint"
	ReasonCreatorMismatch   FailureReason = "creator_mismatch"
	ReasonTicketClaimFailed FailureReason = "ticket_claim_failed"
	ReasonExpiredToken      FailureReason = "expired_token"
	ReasonInvalidToken      FailureReason = "invalid_token"
	ReasonNoVerification    FailureReason = "no_verification"
)

// MiddlewareOptions configures Protect.
type MiddlewareOptions struct {
	// ProtectedPaths lists globs that require verification.
	// When empty, all requests are protected (after exclude filtering).
	ProtectedPaths []string
	// ExcludePaths lists globs that bypass verification entirely.
	ExcludePaths []string
	// AccessPolicy runs before any cookie/token checks.
	AccessPolicy *AccessPolicy
	// OnVerificationFailed is invoked for diagnostic logging.
	OnVerificationFailed func(r *http.Request, reason FailureReason, err error)
}

// Protect builds an http.Handler middleware for the configured client.
//
// The middleware is safe for concurrent use.
func (c *Client) Protect(opts MiddlewareOptions) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c.serveProtect(w, r, next, opts)
		})
	}
}

func (c *Client) serveProtect(w http.ResponseWriter, r *http.Request, next http.Handler, opts MiddlewareOptions) {
	path := r.URL.Path

	if MatchAny(path, opts.ExcludePaths) {
		next.ServeHTTP(w, r)
		return
	}
	if len(opts.ProtectedPaths) > 0 && !MatchAny(path, opts.ProtectedPaths) {
		next.ServeHTTP(w, r)
		return
	}

	if opts.AccessPolicy != nil {
		decision := EvaluateAccessPolicy(r, *opts.AccessPolicy)
		switch decision.Action {
		case ActionAllow:
			c.debug("access policy allow: %s", decision.Reason)
			next.ServeHTTP(w, r)
			return
		case ActionRedirect:
			target := decision.RedirectURL
			if target == "" {
				target = BuildVideoAdRedirectURL(c.cfg.VideoAdURL, c.cfg.CreatorHash, currentURL(r))
			}
			http.Redirect(w, r, target, http.StatusFound)
			return
		}
	}

	fingerprint := CookieValue(r, CookieFingerprint)
	existingToken := CookieValue(r, CookieToken)
	storedCreator := CookieValue(r, CookieCreator)
	existingVerified := CookieValue(r, CookieVerified)
	existingExpires := CookieValue(r, CookieExpires)

	ticketID := r.URL.Query().Get("redirect_ticket")
	secure := isSecureRequest(r) || c.cfg.SecureCookies

	if ticketID != "" {
		if fingerprint == "" {
			c.failVerification(w, r, opts, ReasonNoFingerprint, nil)
			return
		}
		claim, err := c.ClaimRedirectTicket(r.Context(), ticketID)
		if err != nil {
			c.failVerification(w, r, opts, ReasonTicketClaimFailed, err)
			return
		}
		if claim.CreatorHash != c.cfg.CreatorHash {
			c.failVerification(w, r, opts, ReasonCreatorMismatch, nil)
			return
		}

		clean := RemoveQueryParam(currentURL(r), "redirect_ticket")
		SetVerificationCookies(w, secure, SetVerificationOptions{
			Token:       claim.Token,
			CreatorHash: claim.CreatorHash,
			TicketID:    claim.TicketID,
			MaxAge:      c.cfg.CookieMaxAge,
			Expiry:      GetTokenExpiry(claim.Token),
		})
		http.Redirect(w, r, clean, http.StatusFound)
		return
	}

	if existingToken != "" {
		if IsTokenExpired(existingToken) {
			c.failVerification(w, r, opts, ReasonExpiredToken, nil)
			return
		}
		v := ValidateTokenClaims(existingToken, c.cfg.CreatorHash, fingerprint)
		if !v.Valid {
			c.failVerification(w, r, opts, ReasonInvalidToken, nil)
			return
		}
		if _, err := c.ValidateToken(r.Context(), existingToken); err != nil {
			c.failVerification(w, r, opts, ReasonInvalidToken, err)
			return
		}

		expiry := GetTokenExpiry(existingToken)
		needsRefresh := existingVerified != "1" ||
			storedCreator != c.cfg.CreatorHash ||
			(expiry > 0 && existingExpires != formatInt64(expiry))
		if needsRefresh {
			SetVerificationCookies(w, secure, SetVerificationOptions{
				Token:       existingToken,
				CreatorHash: c.cfg.CreatorHash,
				TicketID:    CookieValue(r, CookieTicket),
				MaxAge:      c.cfg.CookieMaxAge,
				Expiry:      expiry,
			})
		}

		next.ServeHTTP(w, r)
		return
	}

	c.failVerification(w, r, opts, ReasonNoVerification, nil)
}

func (c *Client) failVerification(w http.ResponseWriter, r *http.Request, opts MiddlewareOptions, reason FailureReason, err error) {
	if opts.OnVerificationFailed != nil {
		opts.OnVerificationFailed(r, reason, err)
	}
	c.debug("verification failed: %s err=%v", reason, err)
	ClearVerificationCookies(w, isSecureRequest(r) || c.cfg.SecureCookies)
	target := BuildVideoAdRedirectURL(c.cfg.VideoAdURL, c.cfg.CreatorHash, currentURL(r))
	http.Redirect(w, r, target, http.StatusFound)
}

func (c *Client) debug(format string, args ...any) {
	if !c.cfg.Debug {
		return
	}
	if c.cfg.Logger != nil {
		c.cfg.Logger(format, args...)
	}
}

func currentURL(r *http.Request) string {
	scheme := "http"
	if isSecureRequest(r) {
		scheme = "https"
	}
	host := r.Host
	if r.URL.Host != "" {
		host = r.URL.Host
	}
	u := url.URL{Scheme: scheme, Host: host, Path: r.URL.Path, RawQuery: r.URL.RawQuery}
	return u.String()
}

func isSecureRequest(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	if proto := r.Header.Get("X-Forwarded-Proto"); strings.EqualFold(proto, "https") {
		return true
	}
	return false
}
