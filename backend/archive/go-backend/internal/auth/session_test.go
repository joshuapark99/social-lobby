package auth

import (
	"testing"
	"time"
)

func TestNewSessionTokenReturnsDistinctOpaqueTokens(t *testing.T) {
	first, err := NewSessionToken()
	if err != nil {
		t.Fatalf("expected first token, got error: %v", err)
	}
	second, err := NewSessionToken()
	if err != nil {
		t.Fatalf("expected second token, got error: %v", err)
	}

	if first == "" {
		t.Fatal("expected first token to be non-empty")
	}
	if second == "" {
		t.Fatal("expected second token to be non-empty")
	}
	if first == second {
		t.Fatal("expected independently generated tokens to differ")
	}
}

func TestHashSessionTokenIsStableAndRejectsEmptyTokens(t *testing.T) {
	first, err := HashSessionToken("token-value")
	if err != nil {
		t.Fatalf("expected hash, got error: %v", err)
	}
	second, err := HashSessionToken("token-value")
	if err != nil {
		t.Fatalf("expected second hash, got error: %v", err)
	}

	if first != second {
		t.Fatalf("expected stable hash, got %q and %q", first, second)
	}
	if first == "token-value" {
		t.Fatal("expected hash not to store raw token value")
	}
	if _, err := HashSessionToken(""); err == nil {
		t.Fatal("expected empty token to be rejected")
	}
}

func TestSessionIsExpired(t *testing.T) {
	now := time.Date(2026, 4, 27, 12, 0, 0, 0, time.UTC)

	active := Session{ExpiresAt: now.Add(time.Minute)}
	if active.IsExpired(now) {
		t.Fatal("expected future expiry to be active")
	}

	expired := Session{ExpiresAt: now}
	if !expired.IsExpired(now) {
		t.Fatal("expected session expiring now to be expired")
	}
}
