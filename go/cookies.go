package showad

import (
	"net/http"
	"time"
)

// Cookie name constants. They mirror the other ShowAd SDKs on the wire.
const (
	CookiePrefix      = "showad"
	CookieFingerprint = "showad_fingerprint"
	CookieToken       = "showad_token"
	CookieCreator     = "showad_creator"
	CookieTicket      = "showad_ticket"
	CookieVerified    = "showad_verified"
	CookieExpires     = "showad_expires"
)

// CookieOptions controls how verification cookies are written.
type CookieOptions struct {
	Path     string
	MaxAge   int
	Secure   bool
	HTTPOnly bool
	SameSite http.SameSite
	Domain   string
}

// SetCookie writes a single ShowAd cookie to the response.
func SetCookie(w http.ResponseWriter, name, value string, opts CookieOptions) {
	if opts.Path == "" {
		opts.Path = "/"
	}
	if opts.SameSite == 0 {
		opts.SameSite = http.SameSiteLaxMode
	}
	c := &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     opts.Path,
		Domain:   opts.Domain,
		MaxAge:   opts.MaxAge,
		Secure:   opts.Secure,
		HttpOnly: opts.HTTPOnly,
		SameSite: opts.SameSite,
	}
	if opts.MaxAge > 0 {
		c.Expires = time.Now().Add(time.Duration(opts.MaxAge) * time.Second)
	}
	http.SetCookie(w, c)
}

// ClearCookie expires a cookie by setting MaxAge=-1.
func ClearCookie(w http.ResponseWriter, name string, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
		Secure:   secure,
		HttpOnly: name == CookieToken,
		SameSite: http.SameSiteLaxMode,
	})
}

// CookieValue returns the value of cookie name, or "".
func CookieValue(r *http.Request, name string) string {
	c, err := r.Cookie(name)
	if err != nil || c == nil {
		return ""
	}
	return c.Value
}

// SetVerificationCookies writes the full verification cookie set.
func SetVerificationCookies(w http.ResponseWriter, secure bool, opts SetVerificationOptions) {
	base := CookieOptions{Path: "/", MaxAge: opts.MaxAge, Secure: secure, SameSite: http.SameSiteLaxMode}

	tokenOpts := base
	tokenOpts.HTTPOnly = true
	SetCookie(w, CookieToken, opts.Token, tokenOpts)

	SetCookie(w, CookieVerified, "1", base)
	SetCookie(w, CookieCreator, opts.CreatorHash, base)

	if opts.TicketID != "" {
		SetCookie(w, CookieTicket, opts.TicketID, base)
	}

	if opts.Expiry > 0 {
		SetCookie(w, CookieExpires, formatInt64(opts.Expiry), base)
	} else {
		zero := base
		zero.MaxAge = 0
		SetCookie(w, CookieExpires, "", zero)
	}
}

// ClearVerificationCookies removes all ShowAd verification cookies.
func ClearVerificationCookies(w http.ResponseWriter, secure bool) {
	for _, n := range []string{CookieToken, CookieVerified, CookieCreator, CookieTicket, CookieExpires} {
		ClearCookie(w, n, secure)
	}
}

// SetVerificationOptions describes the verification cookie payload.
type SetVerificationOptions struct {
	Token       string
	CreatorHash string
	TicketID    string
	MaxAge      int
	Expiry      int64
}
