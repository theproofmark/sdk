package showad

import (
	"errors"
	"fmt"
)

// ErrorCode classifies a ShowAdError so callers can branch on it.
type ErrorCode string

const (
	ErrCodeFingerprintFailed ErrorCode = "FINGERPRINT_FAILED"
	ErrCodeTicketNotFound    ErrorCode = "TICKET_NOT_FOUND"
	ErrCodeTicketExpired     ErrorCode = "TICKET_EXPIRED"
	ErrCodeTicketClaimFailed ErrorCode = "TICKET_CLAIM_FAILED"
	ErrCodeTokenInvalid      ErrorCode = "TOKEN_INVALID"
	ErrCodeTokenExpired      ErrorCode = "TOKEN_EXPIRED"
	ErrCodeCreatorMismatch   ErrorCode = "CREATOR_MISMATCH"
	ErrCodeNetworkError      ErrorCode = "NETWORK_ERROR"
	ErrCodeConfigError       ErrorCode = "CONFIG_ERROR"
)

// Sentinel errors that can be matched with errors.Is.
var (
	ErrTicketNotFound    = errors.New("showad: redirect ticket not found")
	ErrTicketClaimFailed = errors.New("showad: redirect ticket claim failed")
	ErrCreatorMismatch   = errors.New("showad: creator hash mismatch")
	ErrTokenInvalid      = errors.New("showad: token invalid")
	ErrTokenExpired      = errors.New("showad: token expired")
	ErrNetwork           = errors.New("showad: network error")
	ErrConfig            = errors.New("showad: config error")
)

// ShowAdError wraps a sentinel error with a code, status, and structured detail.
type ShowAdError struct {
	Code    ErrorCode
	Message string
	Status  int
	Details map[string]any
	wrapped error
}

// NewError constructs a ShowAdError with the given code and message.
func NewError(code ErrorCode, message string) *ShowAdError {
	return &ShowAdError{Code: code, Message: message, wrapped: sentinelFor(code)}
}

// Error implements the error interface.
func (e *ShowAdError) Error() string {
	if e == nil {
		return ""
	}
	if e.Status != 0 {
		return fmt.Sprintf("showad: %s: %s (status=%d)", e.Code, e.Message, e.Status)
	}
	return fmt.Sprintf("showad: %s: %s", e.Code, e.Message)
}

// Unwrap returns the underlying sentinel error so errors.Is works.
func (e *ShowAdError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.wrapped
}

// WithStatus returns a copy of e with the HTTP status attached.
func (e *ShowAdError) WithStatus(status int) *ShowAdError {
	if e == nil {
		return nil
	}
	cp := *e
	cp.Status = status
	return &cp
}

// WithDetails returns a copy of e with details merged in.
func (e *ShowAdError) WithDetails(details map[string]any) *ShowAdError {
	if e == nil {
		return nil
	}
	cp := *e
	if cp.Details == nil {
		cp.Details = make(map[string]any, len(details))
	}
	for k, v := range details {
		cp.Details[k] = v
	}
	return &cp
}

func sentinelFor(code ErrorCode) error {
	switch code {
	case ErrCodeTicketNotFound, ErrCodeTicketExpired:
		return ErrTicketNotFound
	case ErrCodeTicketClaimFailed:
		return ErrTicketClaimFailed
	case ErrCodeCreatorMismatch:
		return ErrCreatorMismatch
	case ErrCodeTokenInvalid:
		return ErrTokenInvalid
	case ErrCodeTokenExpired:
		return ErrTokenExpired
	case ErrCodeNetworkError:
		return ErrNetwork
	case ErrCodeConfigError:
		return ErrConfig
	}
	return nil
}
