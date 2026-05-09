package showad_test

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"

	showad "github.com/proofmark/showad-go"
)

func makeToken(t *testing.T, claims map[string]any) string {
	t.Helper()
	header := map[string]string{"alg": "HS256", "typ": "JWT"}
	enc := func(v any) string {
		b, err := json.Marshal(v)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		return base64.RawURLEncoding.EncodeToString(b)
	}
	return enc(header) + "." + enc(claims) + ".sig"
}

func TestDecodeToken(t *testing.T) {
	token := makeToken(t, map[string]any{
		"creator_hash": "creator-1",
		"fingerprint":  "fp-1",
		"exp":          time.Now().Add(time.Hour).Unix(),
		"iss":          "showad-backend",
	})
	c, err := showad.DecodeToken(token)
	if err != nil {
		t.Fatalf("DecodeToken: %v", err)
	}
	if c.CreatorHash != "creator-1" || c.Fingerprint != "fp-1" {
		t.Fatalf("bad claims: %+v", c)
	}
}

func TestDecodeTokenMalformed(t *testing.T) {
	if _, err := showad.DecodeToken("not-a-token"); err == nil {
		t.Fatal("expected error on malformed token")
	}
}

func TestIsTokenExpired(t *testing.T) {
	expired := makeToken(t, map[string]any{"exp": time.Now().Add(-time.Hour).Unix()})
	if !showad.IsTokenExpired(expired) {
		t.Fatal("expected expired=true")
	}
	fresh := makeToken(t, map[string]any{"exp": time.Now().Add(time.Hour).Unix()})
	if showad.IsTokenExpired(fresh) {
		t.Fatal("expected expired=false")
	}
	notYet := makeToken(t, map[string]any{
		"exp": time.Now().Add(time.Hour).Unix(),
		"nbf": time.Now().Add(time.Hour).Unix(),
	})
	if !showad.IsTokenExpired(notYet) {
		t.Fatal("nbf in future should be treated as expired")
	}
}

func TestValidateTokenClaims(t *testing.T) {
	now := time.Now()
	good := makeToken(t, map[string]any{
		"creator_hash": "c1",
		"fingerprint":  "fp",
		"exp":          now.Add(time.Hour).Unix(),
		"iss":          "showad-backend",
	})

	cases := []struct {
		name    string
		token   string
		creator string
		fp      string
		valid   bool
	}{
		{"ok", good, "c1", "fp", true},
		{"creator mismatch", good, "c2", "fp", false},
		{"fingerprint mismatch", good, "c1", "other", false},
		{"fingerprint optional", good, "c1", "", true},
		{"bad issuer", makeToken(t, map[string]any{
			"creator_hash": "c1",
			"exp":          now.Add(time.Hour).Unix(),
			"iss":          "evil",
		}), "c1", "", false},
		{"expired", makeToken(t, map[string]any{
			"creator_hash": "c1",
			"exp":          now.Add(-time.Hour).Unix(),
		}), "c1", "", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := showad.ValidateTokenClaims(tc.token, tc.creator, tc.fp)
			if r.Valid != tc.valid {
				t.Fatalf("valid=%v want %v reason=%s", r.Valid, tc.valid, r.Reason)
			}
		})
	}
}

func TestGetTokenExpiry(t *testing.T) {
	exp := time.Now().Add(time.Hour).Unix()
	tok := makeToken(t, map[string]any{"exp": exp})
	if got := showad.GetTokenExpiry(tok); got != exp {
		t.Fatalf("expiry got %d want %d", got, exp)
	}
	if showad.GetTokenExpiry("garbage") != 0 {
		t.Fatal("expected 0 on bad token")
	}
}

func TestPadBase64Decoding(t *testing.T) {
	claims := map[string]any{"creator_hash": "x"}
	b, _ := json.Marshal(claims)
	encoded := base64.URLEncoding.EncodeToString(b)
	if !strings.Contains(encoded, "=") {
		encoded += "==="
	}
	tok := "h." + encoded + ".s"
	if _, err := showad.DecodeToken(tok); err != nil {
		t.Fatalf("expected padded base64 to decode, got %v", err)
	}
}
