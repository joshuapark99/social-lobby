package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCSRFMiddlewareAllowsSafeMethods(t *testing.T) {
	handler := CSRFMiddleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	request := httptest.NewRequest(http.MethodGet, "/auth/session", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected safe method to pass, got %d", response.Code)
	}
}

func TestCSRFMiddlewareRejectsUnsafeMethodsWithoutMatchingTokens(t *testing.T) {
	handler := CSRFMiddleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	request := httptest.NewRequest(http.MethodPost, "/auth/logout", nil)
	request.AddCookie(&http.Cookie{Name: CSRFTokenCookieName, Value: "cookie-token"})
	request.Header.Set(CSRFHeaderName, "header-token")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected forbidden status, got %d", response.Code)
	}
}

func TestCSRFMiddlewareAllowsUnsafeMethodsWithMatchingTokens(t *testing.T) {
	handler := CSRFMiddleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	request := httptest.NewRequest(http.MethodPost, "/auth/logout", nil)
	request.AddCookie(&http.Cookie{Name: CSRFTokenCookieName, Value: "csrf-token"})
	request.Header.Set(CSRFHeaderName, "csrf-token")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected unsafe method with matching tokens to pass, got %d", response.Code)
	}
}
