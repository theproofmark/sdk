package showad_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	showad "github.com/proofmark/showad-go"
)

func newClient(t *testing.T, backend *httptest.Server) *showad.Client {
	t.Helper()
	c, err := showad.NewClient(showad.Config{
		CreatorHash:    "creator-1",
		APIKey:         "key-1",
		RedirectSecret: "secret-1",
		APIBaseURL:     backend.URL,
		VideoAdURL:     "https://showad.test",
		CookieMaxAge:   3600,
	})
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	return c
}

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("OK"))
	})
}

func TestProtectAllowsOnValidToken(t *testing.T) {
	validateCalls := 0
	mux := http.NewServeMux()
	mux.HandleFunc("/api/sdk/validate", func(w http.ResponseWriter, r *http.Request) {
		validateCalls++
		if r.Header.Get("X-ShowAd-API-Key") != "key-1" || r.Header.Get("X-ShowAd-Creator-Hash") != "creator-1" {
			http.Error(w, "bad headers", http.StatusUnauthorized)
			return
		}
		var body struct {
			Token  string `json:"token"`
			SDKKey string `json:"sdk_key"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.Token == "" || body.SDKKey != "key-1" {
			http.Error(w, "bad body", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"valid":true,"message":"ok","creator_hash":"creator-1"}`))
	})
	backend := httptest.NewServer(mux)
	defer backend.Close()
	c := newClient(t, backend)

	token := makeToken(t, map[string]any{
		"creator_hash": "creator-1",
		"fingerprint":  "fp",
		"exp":          time.Now().Add(time.Hour).Unix(),
	})

	r := httptest.NewRequest(http.MethodGet, "https://pub.test/p", nil)
	r.AddCookie(&http.Cookie{Name: showad.CookieFingerprint, Value: "fp"})
	r.AddCookie(&http.Cookie{Name: showad.CookieToken, Value: token})
	r.AddCookie(&http.Cookie{Name: showad.CookieCreator, Value: "creator-1"})
	r.AddCookie(&http.Cookie{Name: showad.CookieVerified, Value: "1"})
	r.AddCookie(&http.Cookie{Name: showad.CookieExpires, Value: itoa(showad.GetTokenExpiry(token))})

	rec := httptest.NewRecorder()
	c.Protect(showad.MiddlewareOptions{ProtectedPaths: []string{"/p"}})(okHandler()).ServeHTTP(rec, r)

	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%q", rec.Code, rec.Body.String())
	}
	if validateCalls != 1 {
		t.Fatalf("validate calls=%d want 1", validateCalls)
	}
}

func TestProtectRejectsForgedTokenWhenBackendRejects(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/sdk/validate", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"valid":false,"message":"forged"}`))
	})
	backend := httptest.NewServer(mux)
	defer backend.Close()
	c := newClient(t, backend)

	token := makeToken(t, map[string]any{
		"creator_hash": "creator-1",
		"fingerprint":  "fp",
		"exp":          time.Now().Add(time.Hour).Unix(),
		"iss":          "showad-backend",
	})

	var reason showad.FailureReason
	r := httptest.NewRequest(http.MethodGet, "https://pub.test/p", nil)
	r.AddCookie(&http.Cookie{Name: showad.CookieFingerprint, Value: "fp"})
	r.AddCookie(&http.Cookie{Name: showad.CookieToken, Value: token})
	r.AddCookie(&http.Cookie{Name: showad.CookieCreator, Value: "creator-1"})
	r.AddCookie(&http.Cookie{Name: showad.CookieVerified, Value: "1"})
	r.AddCookie(&http.Cookie{Name: showad.CookieExpires, Value: itoa(showad.GetTokenExpiry(token))})

	rec := httptest.NewRecorder()
	c.Protect(showad.MiddlewareOptions{
		ProtectedPaths: []string{"/p"},
		OnVerificationFailed: func(_ *http.Request, fr showad.FailureReason, _ error) {
			reason = fr
		},
	})(okHandler()).ServeHTTP(rec, r)

	if rec.Code != http.StatusFound {
		t.Fatalf("expected redirect, got %d", rec.Code)
	}
	if reason != showad.ReasonInvalidToken {
		t.Fatalf("reason=%s", reason)
	}
}

func TestProtectRedirectsWhenNoToken(t *testing.T) {
	backend := httptest.NewServer(http.NewServeMux())
	defer backend.Close()
	c := newClient(t, backend)

	var failReason showad.FailureReason
	r := httptest.NewRequest(http.MethodGet, "https://pub.test/p", nil)
	rec := httptest.NewRecorder()

	c.Protect(showad.MiddlewareOptions{
		ProtectedPaths: []string{"/p"},
		OnVerificationFailed: func(_ *http.Request, reason showad.FailureReason, _ error) {
			failReason = reason
		},
	})(okHandler()).ServeHTTP(rec, r)

	if rec.Code != http.StatusFound {
		t.Fatalf("expected 302, got %d", rec.Code)
	}
	if failReason != showad.ReasonNoVerification {
		t.Fatalf("reason=%s", failReason)
	}
	loc := rec.Header().Get("Location")
	if !strings.HasPrefix(loc, "https://showad.test/c/creator-1") {
		t.Fatalf("bad redirect: %s", loc)
	}
}

func TestProtectClaimsRedirectTicket(t *testing.T) {
	token := makeToken(t, map[string]any{
		"creator_hash": "creator-1",
		"fingerprint":  "fp",
		"exp":          time.Now().Add(time.Hour).Unix(),
	})
	mux := http.NewServeMux()
	mux.HandleFunc("/api/redirect-ticket/", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Redirect-Ticket-Secret") != "secret-1" {
			http.Error(w, "bad secret", http.StatusUnauthorized)
			return
		}
		if r.Header.Get("X-ShowAd-API-Key") != "key-1" || r.Header.Get("X-ShowAd-Creator-Hash") != "creator-1" {
			http.Error(w, "bad headers", http.StatusUnauthorized)
			return
		}
		var body struct {
			CreatorHash string `json:"creator_hash"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.CreatorHash != "creator-1" {
			http.Error(w, "creator", http.StatusForbidden)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"creator_hash": "creator-1",
			"ticket_id":    "ticket-xyz",
			"token":        token,
		})
	})
	backend := httptest.NewServer(mux)
	defer backend.Close()

	c := newClient(t, backend)

	r := httptest.NewRequest(http.MethodGet, "https://pub.test/p?redirect_ticket=ticket-xyz&keep=1", nil)
	r.AddCookie(&http.Cookie{Name: showad.CookieFingerprint, Value: "fp"})
	rec := httptest.NewRecorder()

	c.Protect(showad.MiddlewareOptions{ProtectedPaths: []string{"/p"}})(okHandler()).ServeHTTP(rec, r)

	if rec.Code != http.StatusFound {
		t.Fatalf("expected redirect to clean URL, got %d", rec.Code)
	}
	loc := rec.Header().Get("Location")
	if strings.Contains(loc, "redirect_ticket") {
		t.Fatalf("redirect_ticket should be stripped: %s", loc)
	}
	if !strings.Contains(loc, "keep=1") {
		t.Fatalf("other params should be preserved: %s", loc)
	}

	resp := rec.Result()
	defer resp.Body.Close()
	cookies := resp.Cookies()
	if !hasCookie(cookies, showad.CookieToken, token) {
		t.Fatalf("missing token cookie: %+v", cookies)
	}
	if !hasCookie(cookies, showad.CookieVerified, "1") {
		t.Fatalf("missing verified cookie")
	}
}

func TestProtectRedirectsOnTicketClaimFailure(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/redirect-ticket/", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"gone"}`, http.StatusGone)
	})
	backend := httptest.NewServer(mux)
	defer backend.Close()
	c := newClient(t, backend)

	r := httptest.NewRequest(http.MethodGet, "https://pub.test/p?redirect_ticket=zz", nil)
	r.AddCookie(&http.Cookie{Name: showad.CookieFingerprint, Value: "fp"})
	rec := httptest.NewRecorder()

	var reason showad.FailureReason
	c.Protect(showad.MiddlewareOptions{
		ProtectedPaths:       []string{"/p"},
		OnVerificationFailed: func(_ *http.Request, fr showad.FailureReason, _ error) { reason = fr },
	})(okHandler()).ServeHTTP(rec, r)

	if rec.Code != http.StatusFound {
		t.Fatalf("status=%d", rec.Code)
	}
	if reason != showad.ReasonTicketClaimFailed {
		t.Fatalf("reason=%s", reason)
	}
}

func TestProtectExcludePaths(t *testing.T) {
	backend := httptest.NewServer(http.NewServeMux())
	defer backend.Close()
	c := newClient(t, backend)

	r := httptest.NewRequest(http.MethodGet, "https://pub.test/api/health", nil)
	rec := httptest.NewRecorder()
	c.Protect(showad.MiddlewareOptions{
		ProtectedPaths: []string{"/api/*"},
		ExcludePaths:   []string{"/api/health"},
	})(okHandler()).ServeHTTP(rec, r)
	if rec.Code != http.StatusOK {
		t.Fatalf("excluded path should pass, got %d", rec.Code)
	}
}

func TestProtectAccessPolicyAllowSkipsTokenCheck(t *testing.T) {
	backend := httptest.NewServer(http.NewServeMux())
	defer backend.Close()
	c := newClient(t, backend)

	r := httptest.NewRequest(http.MethodGet, "https://pub.test/p", nil)
	r.RemoteAddr = "10.0.0.1:443"
	rec := httptest.NewRecorder()

	c.Protect(showad.MiddlewareOptions{
		ProtectedPaths: []string{"/p"},
		AccessPolicy: &showad.AccessPolicy{
			AllowCIDRs: []string{"10.0.0.0/8"},
		},
	})(okHandler()).ServeHTTP(rec, r)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected allow, got %d", rec.Code)
	}
}

func TestProtectAccessPolicyBeforeProtectRedirect(t *testing.T) {
	backend := httptest.NewServer(http.NewServeMux())
	defer backend.Close()
	c := newClient(t, backend)

	r := httptest.NewRequest(http.MethodGet, "https://pub.test/p", nil)
	r.RemoteAddr = "1.2.3.4:443"
	rec := httptest.NewRecorder()

	c.Protect(showad.MiddlewareOptions{
		ProtectedPaths: []string{"/p"},
		AccessPolicy: &showad.AccessPolicy{
			BeforeProtect: func(req *http.Request, ctx showad.AccessContext) showad.AccessDecision {
				return showad.AccessDecision{Action: showad.ActionRedirect, RedirectURL: "https://example.test/login"}
			},
		},
	})(okHandler()).ServeHTTP(rec, r)
	if rec.Code != http.StatusFound {
		t.Fatalf("expected redirect, got %d", rec.Code)
	}
	if got := rec.Header().Get("Location"); got != "https://example.test/login" {
		t.Fatalf("location %q", got)
	}
}

func TestProtectExpiredTokenRedirects(t *testing.T) {
	backend := httptest.NewServer(http.NewServeMux())
	defer backend.Close()
	c := newClient(t, backend)

	expired := makeToken(t, map[string]any{
		"creator_hash": "creator-1",
		"exp":          time.Now().Add(-time.Hour).Unix(),
	})
	r := httptest.NewRequest(http.MethodGet, "https://pub.test/p", nil)
	r.AddCookie(&http.Cookie{Name: showad.CookieToken, Value: expired})
	rec := httptest.NewRecorder()

	var reason showad.FailureReason
	c.Protect(showad.MiddlewareOptions{
		ProtectedPaths:       []string{"/p"},
		OnVerificationFailed: func(_ *http.Request, fr showad.FailureReason, _ error) { reason = fr },
	})(okHandler()).ServeHTTP(rec, r)

	if rec.Code != http.StatusFound {
		t.Fatalf("status=%d", rec.Code)
	}
	if reason != showad.ReasonExpiredToken {
		t.Fatalf("reason=%s", reason)
	}
}

func TestProtectGlobMatching(t *testing.T) {
	if !showad.MatchPath("/premium/article/1", "/premium/*") {
		t.Fatal("glob mismatch")
	}
	if showad.MatchPath("/public", "/premium/*") {
		t.Fatal("false glob match")
	}
}

func TestClientHealthCheck(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	backend := httptest.NewServer(mux)
	defer backend.Close()
	c := newClient(t, backend)
	if !c.CheckHealth(httptest.NewRequest(http.MethodGet, "/", nil).Context()) {
		t.Fatal("expected healthy")
	}
}

func TestClientValidateToken(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/sdk/validate", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-ShowAd-API-Key") != "key-1" {
			http.Error(w, "bad", http.StatusUnauthorized)
			return
		}
		_, _ = w.Write([]byte(`{"valid":true,"message":"ok","creator_hash":"creator-1"}`))
	})
	backend := httptest.NewServer(mux)
	defer backend.Close()
	c := newClient(t, backend)
	resp, err := c.ValidateToken(httptest.NewRequest(http.MethodGet, "/", nil).Context(), "tok")
	if err != nil {
		t.Fatalf("ValidateToken: %v", err)
	}
	if !resp.Valid || resp.CreatorHash != "creator-1" {
		t.Fatalf("bad response %+v", resp)
	}
}

func hasCookie(cookies []*http.Cookie, name, value string) bool {
	for _, c := range cookies {
		if c.Name == name && c.Value == value {
			return true
		}
	}
	return false
}

func itoa(v int64) string {
	return strings.TrimSpace(formatI64(v))
}

func formatI64(v int64) string {
	const digits = "0123456789"
	if v == 0 {
		return "0"
	}
	neg := false
	if v < 0 {
		neg = true
		v = -v
	}
	var b [20]byte
	i := len(b)
	for v > 0 {
		i--
		b[i] = digits[v%10]
		v /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}
