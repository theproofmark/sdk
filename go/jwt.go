package showad

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// Claims represents the ShowAd JWT body.
type Claims struct {
	Fingerprint string `json:"fingerprint,omitempty"`
	IPAddress   string `json:"ip_address,omitempty"`
	CreatorHash string `json:"creator_hash,omitempty"`
	SessionHash string `json:"session_hash,omitempty"`
	IssuedAt    int64  `json:"iat,omitempty"`
	ExpiresAt   int64  `json:"exp,omitempty"`
	NotBefore   int64  `json:"nbf,omitempty"`
	Issuer      string `json:"iss,omitempty"`
}

// DecodeToken decodes a JWT body without verifying its signature.
func DecodeToken(token string) (*Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) < 2 {
		return nil, errors.New("showad: malformed token")
	}
	payload, err := decodeBase64Segment(parts[1])
	if err != nil {
		return nil, errors.New("showad: cannot base64-decode token")
	}
	var c Claims
	if err := json.Unmarshal(payload, &c); err != nil {
		return nil, errors.New("showad: cannot json-decode token")
	}
	return &c, nil
}

// IsTokenExpired reports whether the token's exp/nbf claims indicate it is unusable now.
func IsTokenExpired(token string) bool {
	c, err := DecodeToken(token)
	if err != nil {
		return true
	}
	now := time.Now().Unix()
	if c.ExpiresAt != 0 && c.ExpiresAt < now {
		return true
	}
	if c.NotBefore != 0 && c.NotBefore > now {
		return true
	}
	return false
}

// GetTokenExpiry returns exp in seconds (epoch) or 0 if unset.
func GetTokenExpiry(token string) int64 {
	c, err := DecodeToken(token)
	if err != nil {
		return 0
	}
	return c.ExpiresAt
}

// ValidationResult holds the outcome of ValidateTokenClaims.
type ValidationResult struct {
	Valid  bool
	Reason string
	Claims *Claims
}

// ValidateTokenClaims checks token freshness, creator_hash, fingerprint and issuer.
//
// fingerprint is optional: when empty, the fingerprint claim check is skipped.
func ValidateTokenClaims(token, expectedCreatorHash, fingerprint string) ValidationResult {
	c, err := DecodeToken(token)
	if err != nil {
		return ValidationResult{Valid: false, Reason: "invalid_format"}
	}
	if IsTokenExpired(token) {
		return ValidationResult{Valid: false, Reason: "expired", Claims: c}
	}
	if c.CreatorHash != expectedCreatorHash {
		return ValidationResult{Valid: false, Reason: "creator_mismatch", Claims: c}
	}
	if fingerprint != "" && c.Fingerprint != fingerprint {
		return ValidationResult{Valid: false, Reason: "fingerprint_mismatch", Claims: c}
	}
	if c.Issuer != "" && c.Issuer != "showad-backend" {
		return ValidationResult{Valid: false, Reason: "invalid_issuer", Claims: c}
	}
	return ValidationResult{Valid: true, Reason: "valid", Claims: c}
}

// decodeBase64Segment decodes a JWT segment that may use either RawURLEncoding
// (the JWT spec) or URLEncoding (with '=' padding emitted by some signers).
func decodeBase64Segment(s string) ([]byte, error) {
	s = strings.TrimRight(s, "=")
	return base64.RawURLEncoding.DecodeString(s)
}
