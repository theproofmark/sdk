package showad

import (
	"crypto/subtle"
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

// ExpectedIssuer is the expected `iss` claim issued by the ShowAd backend.
const ExpectedIssuer = "showad-backend"

// DefaultLeewaySeconds is the default clock-skew tolerance applied to exp/nbf/iat.
const DefaultLeewaySeconds = int64(60)

// allowedAlgorithms enumerates the JWS algorithms the SDK accepts for local
// payload inspection. Tokens with other algorithms (including the dangerous
// `none` value) are rejected before any payload claims are read.
var allowedAlgorithms = map[string]struct{}{
	"HS256": {}, "HS384": {}, "HS512": {},
	"RS256": {}, "RS384": {}, "RS512": {},
	"ES256": {}, "ES384": {},
}

// ClaimValidationOptions tunes ValidateTokenClaims.
type ClaimValidationOptions struct {
	// LeewaySeconds applies clock-skew tolerance to exp/nbf/iat. Defaults to 60s.
	LeewaySeconds int64
	// RequireIssuer requires the `iss` claim to be present and equal to
	// ExpectedIssuer. Defaults to true.
	RequireIssuer *bool
}

func (o ClaimValidationOptions) leeway() int64 {
	if o.LeewaySeconds == 0 {
		return DefaultLeewaySeconds
	}
	return o.LeewaySeconds
}

func (o ClaimValidationOptions) requireIssuer() bool {
	if o.RequireIssuer == nil {
		return true
	}
	return *o.RequireIssuer
}

// DecodeToken decodes a JWT body without verifying its signature.
//
// Defense-in-depth: tokens whose header `alg` is `none` or outside the
// HS256/HS384/HS512/RS256/RS384/RS512/ES256/ES384 whitelist are rejected.
func DecodeToken(token string) (*Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, errors.New("showad: malformed token")
	}
	headerBytes, err := decodeBase64Segment(parts[0])
	if err != nil {
		return nil, errors.New("showad: cannot base64-decode header")
	}
	var header struct {
		Alg string `json:"alg"`
	}
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return nil, errors.New("showad: cannot json-decode header")
	}
	if _, ok := allowedAlgorithms[header.Alg]; !ok {
		return nil, errors.New("showad: disallowed jwt algorithm")
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

// IsTokenExpired reports whether the token's exp/nbf/iat claims indicate it is
// unusable now, allowing for clock skew tolerance.
func IsTokenExpired(token string) bool {
	return IsTokenExpiredWithLeeway(token, DefaultLeewaySeconds)
}

// IsTokenExpiredWithLeeway is the leeway-aware variant of IsTokenExpired.
func IsTokenExpiredWithLeeway(token string, leewaySeconds int64) bool {
	c, err := DecodeToken(token)
	if err != nil {
		return true
	}
	now := time.Now().Unix()
	if c.ExpiresAt != 0 && (c.ExpiresAt+leewaySeconds) < now {
		return true
	}
	if c.NotBefore != 0 && (c.NotBefore-leewaySeconds) > now {
		return true
	}
	if c.IssuedAt != 0 && (c.IssuedAt-leewaySeconds) > now {
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

// ValidateTokenClaims checks token freshness, creator_hash, fingerprint and
// issuer with default options (60s leeway, issuer required).
//
// fingerprint is optional: when empty, the fingerprint claim check is skipped.
func ValidateTokenClaims(token, expectedCreatorHash, fingerprint string) ValidationResult {
	return ValidateTokenClaimsWithOptions(token, expectedCreatorHash, fingerprint, ClaimValidationOptions{})
}

// ValidateTokenClaimsWithOptions is the options-aware variant.
func ValidateTokenClaimsWithOptions(token, expectedCreatorHash, fingerprint string, opts ClaimValidationOptions) ValidationResult {
	c, err := DecodeToken(token)
	if err != nil {
		return ValidationResult{Valid: false, Reason: "invalid_format"}
	}
	if IsTokenExpiredWithLeeway(token, opts.leeway()) {
		return ValidationResult{Valid: false, Reason: "expired", Claims: c}
	}
	if subtle.ConstantTimeCompare([]byte(c.CreatorHash), []byte(expectedCreatorHash)) != 1 {
		return ValidationResult{Valid: false, Reason: "creator_mismatch", Claims: c}
	}
	if fingerprint != "" {
		if subtle.ConstantTimeCompare([]byte(c.Fingerprint), []byte(fingerprint)) != 1 {
			return ValidationResult{Valid: false, Reason: "fingerprint_mismatch", Claims: c}
		}
	}
	if opts.requireIssuer() {
		if c.Issuer != ExpectedIssuer {
			return ValidationResult{Valid: false, Reason: "invalid_issuer", Claims: c}
		}
	} else if c.Issuer != "" && c.Issuer != ExpectedIssuer {
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
