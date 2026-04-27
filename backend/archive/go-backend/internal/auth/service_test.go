package auth

import (
	"context"
	"testing"
	"time"
)

type fakeProvider struct {
	authURL  string
	identity OIDCIdentity
	err      error
}

func (f fakeProvider) AuthorizationURL(state string) (string, error) {
	return f.authURL + "?state=" + state, nil
}

func (f fakeProvider) Exchange(context.Context, string) (OIDCIdentity, error) {
	return f.identity, f.err
}

type fakeStore struct {
	userID           string
	createdHash      string
	createdExpiresAt time.Time
	sessionIdentity  OIDCIdentity
	sessionOK        bool
	revokedHash      string
}

func (f *fakeStore) FindOrCreateUserByIdentity(_ context.Context, identity OIDCIdentity) (string, error) {
	f.sessionIdentity = identity
	return f.userID, nil
}

func (f *fakeStore) CreateSession(_ context.Context, userID string, tokenHash string, expiresAt time.Time) error {
	f.userID = userID
	f.createdHash = tokenHash
	f.createdExpiresAt = expiresAt
	return nil
}

func (f *fakeStore) FindIdentityBySessionHash(_ context.Context, tokenHash string, now time.Time) (OIDCIdentity, bool, error) {
	f.createdHash = tokenHash
	f.createdExpiresAt = now
	return f.sessionIdentity, f.sessionOK, nil
}

func (f *fakeStore) RevokeSession(_ context.Context, tokenHash string) error {
	f.revokedHash = tokenHash
	return nil
}

func TestServiceLoginURLReturnsProviderURLAndState(t *testing.T) {
	service := NewService(ServiceOptions{
		Provider: fakeProvider{authURL: "https://accounts.google.com/auth"},
		Store:    &fakeStore{},
		Now:      func() time.Time { return time.Unix(0, 0) },
	})

	loginURL, state, err := service.LoginURL(context.Background())
	if err != nil {
		t.Fatalf("expected login URL, got error: %v", err)
	}

	if state == "" {
		t.Fatal("expected generated state")
	}
	if loginURL != "https://accounts.google.com/auth?state="+state {
		t.Fatalf("expected state in login URL, got %q", loginURL)
	}
}

func TestServiceCompleteLoginStoresLinkedIdentityAndHashedSession(t *testing.T) {
	now := time.Date(2026, 4, 27, 12, 0, 0, 0, time.UTC)
	store := &fakeStore{userID: "user-id"}
	service := NewService(ServiceOptions{
		Provider: fakeProvider{identity: OIDCIdentity{Provider: "google", Subject: "subject", Email: "person@example.com"}},
		Store:    store,
		Now:      func() time.Time { return now },
	})

	identity, sessionToken, csrfToken, err := service.CompleteLogin(context.Background(), "code", "state")
	if err != nil {
		t.Fatalf("expected login completion, got error: %v", err)
	}

	if identity.Email != "person@example.com" {
		t.Fatalf("expected identity email, got %q", identity.Email)
	}
	if sessionToken == "" {
		t.Fatal("expected session token")
	}
	if csrfToken == "" {
		t.Fatal("expected csrf token")
	}
	if store.createdHash == "" || store.createdHash == sessionToken {
		t.Fatalf("expected hashed session token, got %q", store.createdHash)
	}
	if !store.createdExpiresAt.Equal(now.Add(DefaultSessionTTL)) {
		t.Fatalf("expected session expiry %s, got %s", now.Add(DefaultSessionTTL), store.createdExpiresAt)
	}
}

func TestServiceSessionValidatesHashedToken(t *testing.T) {
	store := &fakeStore{
		sessionIdentity: OIDCIdentity{Provider: "google", Subject: "subject", Email: "person@example.com"},
		sessionOK:       true,
	}
	service := NewService(ServiceOptions{
		Provider: fakeProvider{},
		Store:    store,
		Now:      func() time.Time { return time.Unix(0, 0) },
	})

	identity, ok := service.Session(context.Background(), "session-token")
	if !ok {
		t.Fatal("expected session to be valid")
	}
	if identity.Email != "person@example.com" {
		t.Fatalf("expected identity email, got %q", identity.Email)
	}
	if store.createdHash == "session-token" {
		t.Fatal("expected service to query by hashed token")
	}
}

func TestServiceLogoutRevokesHashedToken(t *testing.T) {
	store := &fakeStore{}
	service := NewService(ServiceOptions{
		Provider: fakeProvider{},
		Store:    store,
		Now:      func() time.Time { return time.Unix(0, 0) },
	})

	if err := service.Logout(context.Background(), "session-token"); err != nil {
		t.Fatalf("expected logout to succeed, got error: %v", err)
	}

	if store.revokedHash == "" {
		t.Fatal("expected session hash to be revoked")
	}
	if store.revokedHash == "session-token" {
		t.Fatal("expected logout to revoke hashed token")
	}
}
