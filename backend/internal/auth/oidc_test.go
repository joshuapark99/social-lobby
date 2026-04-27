package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

func TestOIDCProviderBuildsAuthorizationURL(t *testing.T) {
	provider := OIDCProvider{
		AuthURL:     "https://accounts.google.com/o/oauth2/v2/auth",
		ClientID:    "client-id",
		RedirectURL: "http://localhost:8081/auth/callback",
		Scopes:      []string{"openid", "email", "profile"},
	}

	authURL, err := provider.AuthorizationURL("state-value")
	if err != nil {
		t.Fatalf("expected auth URL, got error: %v", err)
	}

	parsed, err := url.Parse(authURL)
	if err != nil {
		t.Fatalf("expected parseable URL, got error: %v", err)
	}
	query := parsed.Query()
	if parsed.Scheme != "https" || parsed.Host != "accounts.google.com" {
		t.Fatalf("expected Google auth host, got %s://%s", parsed.Scheme, parsed.Host)
	}
	if query.Get("response_type") != "code" {
		t.Fatalf("expected response_type code, got %q", query.Get("response_type"))
	}
	if query.Get("client_id") != "client-id" {
		t.Fatalf("expected client ID, got %q", query.Get("client_id"))
	}
	if query.Get("redirect_uri") != "http://localhost:8081/auth/callback" {
		t.Fatalf("expected redirect URL, got %q", query.Get("redirect_uri"))
	}
	if query.Get("state") != "state-value" {
		t.Fatalf("expected state, got %q", query.Get("state"))
	}
	if !strings.Contains(query.Get("scope"), "openid") || !strings.Contains(query.Get("scope"), "email") {
		t.Fatalf("expected openid and email scopes, got %q", query.Get("scope"))
	}
}

func TestOIDCProviderRequiresState(t *testing.T) {
	provider := OIDCProvider{AuthURL: "https://accounts.google.com/o/oauth2/v2/auth"}

	if _, err := provider.AuthorizationURL(""); err == nil {
		t.Fatal("expected missing state to be rejected")
	}
}

func TestIdentityValidationRequiresProviderSubjectAndEmail(t *testing.T) {
	identity := OIDCIdentity{
		Provider: "google",
		Subject:  "subject",
		Email:    "person@example.com",
	}

	if err := identity.Validate(); err != nil {
		t.Fatalf("expected identity to be valid, got error: %v", err)
	}

	invalid := OIDCIdentity{Provider: "google", Subject: "subject"}
	if err := invalid.Validate(); err == nil {
		t.Fatal("expected missing email to be rejected")
	}
}

func TestOIDCProviderExchangeFetchesUserInfo(t *testing.T) {
	transport := roundTripFunc(func(r *http.Request) (*http.Response, error) {
		switch r.URL.String() {
		case "https://oidc.example/token":
			if err := r.ParseForm(); err != nil {
				t.Fatalf("parse token form: %v", err)
			}
			if r.Form.Get("grant_type") != "authorization_code" {
				t.Fatalf("expected authorization_code grant, got %q", r.Form.Get("grant_type"))
			}
			if r.Form.Get("code") != "auth-code" {
				t.Fatalf("expected auth code, got %q", r.Form.Get("code"))
			}
			return jsonResponse(http.StatusOK, map[string]string{"access_token": "access-token"}), nil
		case "https://oidc.example/userinfo":
			if r.Header.Get("Authorization") != "Bearer access-token" {
				t.Fatalf("expected bearer token, got %q", r.Header.Get("Authorization"))
			}
			return jsonResponse(http.StatusOK, map[string]string{
				"sub":   "subject",
				"email": "person@example.com",
				"name":  "Person Example",
			}), nil
		default:
			t.Fatalf("unexpected URL %s", r.URL.String())
			return nil, nil
		}
	})

	provider := OIDCProvider{
		TokenURL:     "https://oidc.example/token",
		UserInfoURL:  "https://oidc.example/userinfo",
		ClientID:     "client-id",
		ClientSecret: "client-secret",
		RedirectURL:  "http://localhost:8081/auth/callback",
		ProviderName: "google",
		HTTPClient:   &http.Client{Transport: transport},
	}

	identity, err := provider.Exchange(t.Context(), "auth-code")
	if err != nil {
		t.Fatalf("expected identity, got error: %v", err)
	}
	if identity.Provider != "google" || identity.Subject != "subject" || identity.Email != "person@example.com" || identity.Name != "Person Example" {
		t.Fatalf("unexpected identity: %#v", identity)
	}
}

func TestOIDCProviderExchangeRejectsInvalidUserInfo(t *testing.T) {
	provider := OIDCProvider{
		TokenURL:     "https://oidc.example/token",
		UserInfoURL:  "https://oidc.example/userinfo",
		ProviderName: "google",
		HTTPClient: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			if r.URL.String() == "https://oidc.example/token" {
				return jsonResponse(http.StatusOK, map[string]string{"access_token": "access-token"}), nil
			}
			return jsonResponse(http.StatusOK, map[string]string{"sub": "subject"}), nil
		})},
	}

	if _, err := provider.Exchange(t.Context(), "auth-code"); err == nil {
		t.Fatal("expected invalid user info to be rejected")
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) {
	return f(r)
}

func jsonResponse(status int, value any) *http.Response {
	var body bytes.Buffer
	_ = json.NewEncoder(&body).Encode(value)
	return &http.Response{
		StatusCode: status,
		Header:     make(http.Header),
		Body:       io.NopCloser(&body),
		Request:    (&http.Request{}).WithContext(context.Background()),
	}
}
