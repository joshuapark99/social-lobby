package server

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"social-lobby/backend/internal/auth"
	"social-lobby/backend/internal/config"
)

type fakeAuthService struct {
	loginURL      string
	loginState    string
	callbackToken string
	callbackCSRF  string
	callbackID    auth.OIDCIdentity
	callbackErr   error
	sessionID     auth.OIDCIdentity
	sessionOK     bool
	logoutToken   string
}

func (f fakeAuthService) LoginURL(_ context.Context) (string, string, error) {
	return f.loginURL, f.loginState, nil
}

func (f fakeAuthService) CompleteLogin(_ context.Context, _ string, _ string) (auth.OIDCIdentity, string, string, error) {
	return f.callbackID, f.callbackToken, f.callbackCSRF, f.callbackErr
}

func (f fakeAuthService) Session(_ context.Context, _ string) (auth.OIDCIdentity, bool) {
	return f.sessionID, f.sessionOK
}

func (f *fakeAuthService) Logout(_ context.Context, sessionToken string) error {
	f.logoutToken = sessionToken
	return nil
}

func TestAuthLoginRedirectsToProviderAndStoresState(t *testing.T) {
	router := NewRouterWithAuth(config.Config{HTTPAddr: ":8081"}, &fakeAuthService{
		loginURL:   "https://accounts.google.com/o/oauth2/v2/auth?state=state-token",
		loginState: "state-token",
	})
	request := httptest.NewRequest(http.MethodGet, "/auth/login", nil)
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusFound {
		t.Fatalf("expected status %d, got %d", http.StatusFound, response.Code)
	}
	if response.Header().Get("Location") != "https://accounts.google.com/o/oauth2/v2/auth?state=state-token" {
		t.Fatalf("expected provider redirect, got %q", response.Header().Get("Location"))
	}
	cookie := findCookie(t, response.Result().Cookies(), oidcStateCookieName)
	if cookie.Value != "state-token" {
		t.Fatalf("expected state cookie, got %q", cookie.Value)
	}
}

func TestNewRouterStartsConfiguredOIDCLogin(t *testing.T) {
	t.Setenv("OIDC_CLIENT_ID", "client-id")
	t.Setenv("OIDC_REDIRECT_URL", "http://localhost:8081/auth/callback")
	router := NewRouter(config.Load())
	request := httptest.NewRequest(http.MethodGet, "/auth/login", nil)
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusFound {
		t.Fatalf("expected status %d, got %d", http.StatusFound, response.Code)
	}
	location := response.Header().Get("Location")
	if !strings.HasPrefix(location, "https://accounts.google.com/o/oauth2/v2/auth?") {
		t.Fatalf("expected Google OIDC redirect, got %q", location)
	}
	if !strings.Contains(location, "client_id=client-id") {
		t.Fatalf("expected client ID in redirect, got %q", location)
	}
}

func TestAuthCallbackRejectsInvalidIdentity(t *testing.T) {
	router := NewRouterWithAuth(config.Config{HTTPAddr: ":8081"}, &fakeAuthService{
		callbackErr: errors.New("invalid identity"),
	})
	request := httptest.NewRequest(http.MethodGet, "/auth/callback?code=code&state=state-token", nil)
	request.AddCookie(&http.Cookie{Name: oidcStateCookieName, Value: "state-token"})
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected status %d, got %d", http.StatusUnauthorized, response.Code)
	}
}

func TestAuthCallbackSetsSessionAndCSRFCookies(t *testing.T) {
	router := NewRouterWithAuth(config.Config{HTTPAddr: ":8081", SessionCookieSecure: true}, &fakeAuthService{
		callbackToken: "session-token",
		callbackCSRF:  "csrf-token",
		callbackID: auth.OIDCIdentity{
			Provider: "google",
			Subject:  "subject",
			Email:    "person@example.com",
		},
	})
	request := httptest.NewRequest(http.MethodGet, "/auth/callback?code=code&state=state-token", nil)
	request.AddCookie(&http.Cookie{Name: oidcStateCookieName, Value: "state-token"})
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, response.Code)
	}
	sessionCookie := findCookie(t, response.Result().Cookies(), auth.SessionCookieName)
	if sessionCookie.Value != "session-token" || !sessionCookie.Secure {
		t.Fatalf("expected secure session cookie, got %#v", sessionCookie)
	}
	csrfCookie := findCookie(t, response.Result().Cookies(), auth.CSRFTokenCookieName)
	if csrfCookie.Value != "csrf-token" || csrfCookie.HttpOnly {
		t.Fatalf("expected readable CSRF cookie, got %#v", csrfCookie)
	}
}

func TestAuthSessionReturnsCurrentIdentity(t *testing.T) {
	router := NewRouterWithAuth(config.Config{HTTPAddr: ":8081"}, &fakeAuthService{
		sessionID: auth.OIDCIdentity{
			Provider: "google",
			Subject:  "subject",
			Email:    "person@example.com",
		},
		sessionOK: true,
	})
	request := httptest.NewRequest(http.MethodGet, "/auth/session", nil)
	request.AddCookie(&http.Cookie{Name: auth.SessionCookieName, Value: "session-token"})
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, response.Code)
	}
	if !strings.Contains(response.Body.String(), `"email":"person@example.com"`) {
		t.Fatalf("expected identity response, got %q", response.Body.String())
	}
}

func TestAuthLogoutRequiresCSRFAndClearsSession(t *testing.T) {
	authService := &fakeAuthService{}
	router := NewRouterWithAuth(config.Config{HTTPAddr: ":8081"}, authService)
	request := httptest.NewRequest(http.MethodPost, "/auth/logout", nil)
	request.AddCookie(&http.Cookie{Name: auth.SessionCookieName, Value: "session-token"})
	request.AddCookie(&http.Cookie{Name: auth.CSRFTokenCookieName, Value: "csrf-token"})
	request.Header.Set(auth.CSRFHeaderName, "csrf-token")
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected status %d, got %d", http.StatusNoContent, response.Code)
	}
	sessionCookie := findCookie(t, response.Result().Cookies(), auth.SessionCookieName)
	if sessionCookie.MaxAge != -1 {
		t.Fatalf("expected session cookie to be cleared, got %#v", sessionCookie)
	}
	if authService.logoutToken != "session-token" {
		t.Fatalf("expected logout to revoke session token, got %q", authService.logoutToken)
	}
}

func findCookie(t *testing.T, cookies []*http.Cookie, name string) *http.Cookie {
	t.Helper()
	for _, cookie := range cookies {
		if cookie.Name == name {
			return cookie
		}
	}
	t.Fatalf("expected cookie %q", name)
	return nil
}
