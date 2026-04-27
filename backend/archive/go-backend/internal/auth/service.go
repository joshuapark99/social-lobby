package auth

import (
	"context"
	"time"
)

const DefaultSessionTTL = 30 * 24 * time.Hour

type Provider interface {
	AuthorizationURL(state string) (string, error)
	Exchange(ctx context.Context, code string) (OIDCIdentity, error)
}

type Store interface {
	FindOrCreateUserByIdentity(ctx context.Context, identity OIDCIdentity) (string, error)
	CreateSession(ctx context.Context, userID string, tokenHash string, expiresAt time.Time) error
	FindIdentityBySessionHash(ctx context.Context, tokenHash string, now time.Time) (OIDCIdentity, bool, error)
	RevokeSession(ctx context.Context, tokenHash string) error
}

type ServiceOptions struct {
	Provider Provider
	Store    Store
	Now      func() time.Time
}

type Service struct {
	provider Provider
	store    Store
	now      func() time.Time
}

func NewService(options ServiceOptions) Service {
	now := options.Now
	if now == nil {
		now = time.Now
	}
	return Service{
		provider: options.Provider,
		store:    options.Store,
		now:      now,
	}
}

func (s Service) LoginURL(ctx context.Context) (string, string, error) {
	state, err := NewSessionToken()
	if err != nil {
		return "", "", err
	}
	loginURL, err := s.provider.AuthorizationURL(state)
	if err != nil {
		return "", "", err
	}
	return loginURL, state, nil
}

func (s Service) CompleteLogin(ctx context.Context, code string, _ string) (OIDCIdentity, string, string, error) {
	identity, err := s.provider.Exchange(ctx, code)
	if err != nil {
		return OIDCIdentity{}, "", "", err
	}
	if err := identity.Validate(); err != nil {
		return OIDCIdentity{}, "", "", err
	}

	userID, err := s.store.FindOrCreateUserByIdentity(ctx, identity)
	if err != nil {
		return OIDCIdentity{}, "", "", err
	}

	sessionToken, err := NewSessionToken()
	if err != nil {
		return OIDCIdentity{}, "", "", err
	}
	tokenHash, err := HashSessionToken(sessionToken)
	if err != nil {
		return OIDCIdentity{}, "", "", err
	}
	expiresAt := s.now().Add(DefaultSessionTTL)
	if err := s.store.CreateSession(ctx, userID, tokenHash, expiresAt); err != nil {
		return OIDCIdentity{}, "", "", err
	}

	csrfToken, err := NewSessionToken()
	if err != nil {
		return OIDCIdentity{}, "", "", err
	}

	return identity, sessionToken, csrfToken, nil
}

func (s Service) Session(ctx context.Context, sessionToken string) (OIDCIdentity, bool) {
	tokenHash, err := HashSessionToken(sessionToken)
	if err != nil {
		return OIDCIdentity{}, false
	}
	identity, ok, err := s.store.FindIdentityBySessionHash(ctx, tokenHash, s.now())
	if err != nil {
		return OIDCIdentity{}, false
	}
	return identity, ok
}

func (s Service) Logout(ctx context.Context, sessionToken string) error {
	tokenHash, err := HashSessionToken(sessionToken)
	if err != nil {
		return err
	}
	return s.store.RevokeSession(ctx, tokenHash)
}
