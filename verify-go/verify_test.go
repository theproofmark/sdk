package proofmarkverify

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestVerify_EmptyToken(t *testing.T) {
	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"score":   0.9,
		})
	}))
	defer server.Close()

	client := New("test-secret", WithBaseURL(server.URL))

	result, err := client.Verify(context.Background(), "", "")
	if err != nil {
		t.Fatalf("expected no error for empty token, got: %v", err)
	}

	if result.Success {
		t.Error("expected Success=false for empty token")
	}

	if result.Score != 0 {
		t.Errorf("expected Score=0 for empty token, got: %f", result.Score)
	}

	if len(result.ErrorCodes) == 0 || result.ErrorCodes[0] != "missing-input-response" {
		t.Errorf("expected ErrorCodes=['missing-input-response'], got: %v", result.ErrorCodes)
	}

	if requestCount != 0 {
		t.Errorf("expected 0 HTTP requests for empty token, got: %d", requestCount)
	}
}

func TestVerify_Success(t *testing.T) {
	var capturedForm map[string]string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("expected POST, got: %s", r.Method)
		}

		if ct := r.Header.Get("Content-Type"); ct != "application/x-www-form-urlencoded" {
			t.Errorf("expected Content-Type application/x-www-form-urlencoded, got: %s", ct)
		}

		if err := r.ParseForm(); err != nil {
			t.Errorf("failed to parse form: %v", err)
		}

		capturedForm = map[string]string{
			"secret":   r.FormValue("secret"),
			"response": r.FormValue("response"),
			"remoteip": r.FormValue("remoteip"),
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":      true,
			"score":        0.9,
			"flags":        []string{},
			"credit":       true,
			"challenge_ts": "2026-06-25T10:30:00Z",
			"hostname":     "example.com",
			"action":       "signup",
		})
	}))
	defer server.Close()

	client := New("test-secret-123", WithBaseURL(server.URL))

	result, err := client.Verify(context.Background(), "test-token-456", "192.0.2.1")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	if !result.Success {
		t.Error("expected Success=true")
	}

	if result.Score != 0.9 {
		t.Errorf("expected Score=0.9, got: %f", result.Score)
	}

	if !result.Credit {
		t.Error("expected Credit=true")
	}

	if result.ChallengeTS != "2026-06-25T10:30:00Z" {
		t.Errorf("expected ChallengeTS='2026-06-25T10:30:00Z', got: %s", result.ChallengeTS)
	}

	if result.Hostname != "example.com" {
		t.Errorf("expected Hostname='example.com', got: %s", result.Hostname)
	}

	if result.Action != "signup" {
		t.Errorf("expected Action='signup', got: %s", result.Action)
	}

	if !result.IsHuman(0.5) {
		t.Error("expected IsHuman(0.5)=true with score 0.9")
	}

	// Verify form fields
	if capturedForm["secret"] != "test-secret-123" {
		t.Errorf("expected secret='test-secret-123', got: %s", capturedForm["secret"])
	}

	if capturedForm["response"] != "test-token-456" {
		t.Errorf("expected response='test-token-456', got: %s", capturedForm["response"])
	}

	if capturedForm["remoteip"] != "192.0.2.1" {
		t.Errorf("expected remoteip='192.0.2.1', got: %s", capturedForm["remoteip"])
	}
}

func TestVerify_LowScore(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"score":   0.3,
			"flags":   []string{"fast_completion"},
			"credit":  true,
		})
	}))
	defer server.Close()

	client := New("test-secret", WithBaseURL(server.URL))

	result, err := client.Verify(context.Background(), "test-token", "")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	if !result.Success {
		t.Error("expected Success=true")
	}

	if result.Score != 0.3 {
		t.Errorf("expected Score=0.3, got: %f", result.Score)
	}

	if result.IsHuman(0.5) {
		t.Error("expected IsHuman(0.5)=false with score 0.3")
	}

	if len(result.Flags) != 1 || result.Flags[0] != "fast_completion" {
		t.Errorf("expected Flags=['fast_completion'], got: %v", result.Flags)
	}
}

func TestVerify_HTTPError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		w.Write([]byte(`{"error":"invalid-secret"}`))
	}))
	defer server.Close()

	client := New("test-secret", WithBaseURL(server.URL))

	result, err := client.Verify(context.Background(), "test-token", "")
	if err == nil {
		t.Fatal("expected error for HTTP 403, got nil")
	}

	if result != nil {
		t.Errorf("expected nil result on HTTP error, got: %+v", result)
	}

	var verifyErr *VerifyError
	if !errors.As(err, &verifyErr) {
		t.Fatalf("expected *VerifyError, got: %T", err)
	}

	if verifyErr.Code != "PMV_HTTP_ERROR" {
		t.Errorf("expected Code='PMV_HTTP_ERROR', got: %s", verifyErr.Code)
	}

	if !strings.Contains(verifyErr.Message, "403") {
		t.Errorf("expected message to contain '403', got: %s", verifyErr.Message)
	}
}

func TestVerify_InvalidJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{invalid json`))
	}))
	defer server.Close()

	client := New("test-secret", WithBaseURL(server.URL))

	result, err := client.Verify(context.Background(), "test-token", "")
	if err == nil {
		t.Fatal("expected error for invalid JSON, got nil")
	}

	if result != nil {
		t.Errorf("expected nil result on parse error, got: %+v", result)
	}

	var verifyErr *VerifyError
	if !errors.As(err, &verifyErr) {
		t.Fatalf("expected *VerifyError, got: %T", err)
	}

	if verifyErr.Code != "PMV_INVALID_RESPONSE" {
		t.Errorf("expected Code='PMV_INVALID_RESPONSE', got: %s", verifyErr.Code)
	}

	if verifyErr.Err == nil {
		t.Error("expected Err to be set for parse error")
	}
}

func TestVerify_Timeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Simulate slow response
		time.Sleep(200 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "score": 0.9})
	}))
	defer server.Close()

	client := New("test-secret", WithBaseURL(server.URL), WithTimeout(50*time.Millisecond))

	result, err := client.Verify(context.Background(), "test-token", "")
	if err == nil {
		t.Fatal("expected timeout error, got nil")
	}

	if result != nil {
		t.Errorf("expected nil result on timeout, got: %+v", result)
	}

	var verifyErr *VerifyError
	if !errors.As(err, &verifyErr) {
		t.Fatalf("expected *VerifyError, got: %T", err)
	}

	if verifyErr.Code != "PMV_TIMEOUT" {
		t.Errorf("expected Code='PMV_TIMEOUT', got: %s", verifyErr.Code)
	}
}

func TestVerify_ContextTimeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(200 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "score": 0.9})
	}))
	defer server.Close()

	client := New("test-secret", WithBaseURL(server.URL))

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	result, err := client.Verify(ctx, "test-token", "")
	if err == nil {
		t.Fatal("expected context timeout error, got nil")
	}

	if result != nil {
		t.Errorf("expected nil result on timeout, got: %+v", result)
	}

	var verifyErr *VerifyError
	if !errors.As(err, &verifyErr) {
		t.Fatalf("expected *VerifyError, got: %T", err)
	}

	if verifyErr.Code != "PMV_TIMEOUT" {
		t.Errorf("expected Code='PMV_TIMEOUT', got: %s", verifyErr.Code)
	}
}

func TestVerify_EmptySecret(t *testing.T) {
	client := New("")

	result, err := client.Verify(context.Background(), "test-token", "")
	if err == nil {
		t.Fatal("expected config error for empty secret, got nil")
	}

	if result != nil {
		t.Errorf("expected nil result on config error, got: %+v", result)
	}

	var verifyErr *VerifyError
	if !errors.As(err, &verifyErr) {
		t.Fatalf("expected *VerifyError, got: %T", err)
	}

	if verifyErr.Code != "PMV_CONFIG" {
		t.Errorf("expected Code='PMV_CONFIG', got: %s", verifyErr.Code)
	}
}

func TestIsHuman_Thresholds(t *testing.T) {
	tests := []struct {
		name      string
		result    VerifyResult
		threshold float64
		want      bool
	}{
		{"success score 0.9, threshold 0.5", VerifyResult{Success: true, Score: 0.9}, 0.5, true},
		{"success score 0.5, threshold 0.5", VerifyResult{Success: true, Score: 0.5}, 0.5, true},
		{"success score 0.4, threshold 0.5", VerifyResult{Success: true, Score: 0.4}, 0.5, false},
		{"success score 0.3, threshold 0.3", VerifyResult{Success: true, Score: 0.3}, 0.3, true},
		{"fail score 0.9, threshold 0.5", VerifyResult{Success: false, Score: 0.9}, 0.5, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.result.IsHuman(tt.threshold)
			if got != tt.want {
				t.Errorf("IsHuman(%f) = %v, want %v", tt.threshold, got, tt.want)
			}
		})
	}
}
