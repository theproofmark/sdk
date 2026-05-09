package showad_test

import (
	"net/url"
	"strings"
	"testing"

	showad "github.com/proofmark/showad-go"
)

func TestBuildVideoAdRedirectURL(t *testing.T) {
	got := showad.BuildVideoAdRedirectURL("https://showad.proofmark.io", "abc", "https://pub.example/x?y=1")
	u, err := url.Parse(got)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if u.Path != "/c/abc" {
		t.Fatalf("path %q", u.Path)
	}
	if u.Query().Get("sdk") != "1" {
		t.Fatalf("missing sdk=1")
	}
	if u.Query().Get("return_url") != "https://pub.example/x?y=1" {
		t.Fatalf("bad return_url %q", u.Query().Get("return_url"))
	}
}

func TestBuildResourceRedirectURL(t *testing.T) {
	got := showad.BuildResourceRedirectURL("https://showad.proofmark.io", "c", "p", "r", "https://x")
	if !strings.Contains(got, "/c/c/p/r") {
		t.Fatalf("path missing: %s", got)
	}
}

func TestRemoveQueryParam(t *testing.T) {
	got := showad.RemoveQueryParam("https://x.test/path?a=1&redirect_ticket=zz&b=2", "redirect_ticket")
	u, _ := url.Parse(got)
	if u.Query().Get("redirect_ticket") != "" {
		t.Fatalf("ticket still present: %s", got)
	}
	if u.Query().Get("a") != "1" || u.Query().Get("b") != "2" {
		t.Fatalf("other params lost: %s", got)
	}
}
