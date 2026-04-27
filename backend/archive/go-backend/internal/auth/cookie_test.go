package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSetSessionCookieUsesBrowserSafeAttributes(t *testing.T) {
	response := httptest.NewRecorder()

	SetSessionCookie(response, "session-token", true)

	cookie := response.Result().Cookies()[0]
	if cookie.Name != SessionCookieName {
		t.Fatalf("expected cookie name %q, got %q", SessionCookieName, cookie.Name)
	}
	if cookie.Value != "session-token" {
		t.Fatalf("expected session token value, got %q", cookie.Value)
	}
	if !cookie.HttpOnly {
		t.Fatal("expected session cookie to be HttpOnly")
	}
	if !cookie.Secure {
		t.Fatal("expected session cookie to honor secure setting")
	}
	if cookie.SameSite != http.SameSiteLaxMode {
		t.Fatalf("expected SameSite=Lax, got %v", cookie.SameSite)
	}
	if cookie.Path != "/" {
		t.Fatalf("expected cookie path /, got %q", cookie.Path)
	}
}

func TestClearSessionCookieExpiresCookie(t *testing.T) {
	response := httptest.NewRecorder()

	ClearSessionCookie(response, false)

	cookie := response.Result().Cookies()[0]
	if cookie.Name != SessionCookieName {
		t.Fatalf("expected cookie name %q, got %q", SessionCookieName, cookie.Name)
	}
	if cookie.Value != "" {
		t.Fatalf("expected empty cookie value, got %q", cookie.Value)
	}
	if cookie.MaxAge != -1 {
		t.Fatalf("expected MaxAge -1, got %d", cookie.MaxAge)
	}
	if cookie.Secure {
		t.Fatal("expected development clear cookie not to be Secure")
	}
}
