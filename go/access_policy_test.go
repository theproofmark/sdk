package showad_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	showad "github.com/proofmark/showad-go"
)

func TestEvaluateAccessPolicyUAOnlyDoesNotBypass(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set("User-Agent", "Mozilla/5.0 (compatible; Googlebot/2.1)")
	r.RemoteAddr = "1.2.3.4:1234"

	p := showad.AccessPolicy{
		Crawler: &showad.CrawlerPolicy{
			Enabled: true,
		},
	}
	d := showad.EvaluateAccessPolicy(r, p)
	if d.Action == showad.ActionAllow {
		t.Fatalf("UA alone should not allow, got %+v", d)
	}
}

func TestEvaluateAccessPolicyCIDRMatch(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "10.1.2.3:443"

	d := showad.EvaluateAccessPolicy(r, showad.AccessPolicy{
		AllowCIDRs: []string{"10.0.0.0/8"},
	})
	if d.Action != showad.ActionAllow || d.Reason != "cidr_allowlist" {
		t.Fatalf("expected cidr_allowlist allow, got %+v", d)
	}
}

func TestEvaluateAccessPolicyTrustedHeader(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "127.0.0.1:1234"
	r.Header.Set("CF-Connecting-IP", "10.0.0.5, 5.5.5.5")

	d := showad.EvaluateAccessPolicy(r, showad.AccessPolicy{
		TrustedIPHeaders: []string{"CF-Connecting-IP"},
		AllowCIDRs:       []string{"10.0.0.0/24"},
	})
	if d.Action != showad.ActionAllow {
		t.Fatalf("expected allow, got %+v", d)
	}
}

func TestEvaluateAccessPolicyFamilyCIDRMatch(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set("User-Agent", "Mozilla/5.0 (compatible; Googlebot/2.1)")
	r.RemoteAddr = "66.249.66.1:443"

	p := showad.AccessPolicy{
		Crawler: &showad.CrawlerPolicy{
			Enabled: true,
			FamilyCIDRs: map[showad.CrawlerFamily][]string{
				"google": {"66.249.64.0/19"},
			},
		},
	}
	d := showad.EvaluateAccessPolicy(r, p)
	if d.Action != showad.ActionAllow || d.Reason != "crawler:google" {
		t.Fatalf("expected google crawler allow, got %+v", d)
	}
}

func TestEvaluateAccessPolicyCloudflareVerifiedBot(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set("User-Agent", "Mozilla/5.0 (compatible; Googlebot/2.1)")
	r.Header.Set("CF-Verified-Bot", "1")
	r.RemoteAddr = "203.0.113.1:443"

	p := showad.AccessPolicy{
		Crawler: &showad.CrawlerPolicy{
			Enabled:                 true,
			AllowCloudflareVerified: true,
		},
	}
	d := showad.EvaluateAccessPolicy(r, p)
	if d.Action != showad.ActionAllow || d.Reason != "crawler:google" {
		t.Fatalf("expected cloudflare verified bot allow, got %+v", d)
	}
}

func TestEvaluateAccessPolicyBeforeProtectAllow(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "1.2.3.4:443"
	called := false
	d := showad.EvaluateAccessPolicy(r, showad.AccessPolicy{
		BeforeProtect: func(req *http.Request, ctx showad.AccessContext) showad.AccessDecision {
			called = true
			if ctx.ClientIP != "1.2.3.4" {
				t.Fatalf("ctx ip %q", ctx.ClientIP)
			}
			return showad.AccessDecision{Action: showad.ActionAllow, Reason: "premium"}
		},
	})
	if !called {
		t.Fatal("BeforeProtect not invoked")
	}
	if d.Action != showad.ActionAllow {
		t.Fatalf("expected allow, got %+v", d)
	}
}

func TestEvaluateAccessPolicyBeforeProtectDefaultsContinue(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "1.2.3.4:443"
	d := showad.EvaluateAccessPolicy(r, showad.AccessPolicy{
		BeforeProtect: func(req *http.Request, ctx showad.AccessContext) showad.AccessDecision {
			return showad.AccessDecision{}
		},
	})
	if d.Action != showad.ActionContinue {
		t.Fatalf("expected continue, got %+v", d)
	}
}

func TestIsIPInCIDRsIPv4AndIPv6(t *testing.T) {
	if !showad.IsIPInCIDRs("192.168.1.42", []string{"192.168.0.0/16"}) {
		t.Fatal("IPv4 CIDR mismatch")
	}
	if showad.IsIPInCIDRs("10.0.0.1", []string{"192.168.0.0/16"}) {
		t.Fatal("false positive IPv4")
	}
	if !showad.IsIPInCIDRs("2001:db8::1", []string{"2001:db8::/32"}) {
		t.Fatal("IPv6 CIDR mismatch")
	}
	if !showad.IsIPInCIDRs("1.2.3.4", []string{"1.2.3.4"}) {
		t.Fatal("bare IP exact match failed")
	}
	if showad.IsIPInCIDRs("garbage", []string{"10.0.0.0/8"}) {
		t.Fatal("garbage IP should not match")
	}
}

func TestGetClientIP(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "127.0.0.1:5555"
	r.Header.Set("X-Forwarded-For", "")
	r.Header.Set("X-Real-IP", "8.8.8.8")
	got := showad.GetClientIP(r, []string{"X-Forwarded-For", "X-Real-IP"})
	if got != "8.8.8.8" {
		t.Fatalf("got %q", got)
	}
	r2 := httptest.NewRequest(http.MethodGet, "/", nil)
	r2.RemoteAddr = "1.2.3.4:8080"
	if showad.GetClientIP(r2, nil) != "1.2.3.4" {
		t.Fatal("fallback to RemoteAddr failed")
	}
}
