package config

import "testing"

func TestLoadUsesDevelopmentDefaults(t *testing.T) {
	t.Setenv("HTTP_ADDR", "")
	t.Setenv("SESSION_COOKIE_SECURE", "")

	cfg := Load()

	if cfg.HTTPAddr != ":8081" {
		t.Fatalf("expected default HTTPAddr %q, got %q", ":8081", cfg.HTTPAddr)
	}
	if cfg.SessionCookieSecure {
		t.Fatal("expected session cookie secure to default to false for local development")
	}
	if cfg.OIDCAuthURL != "https://accounts.google.com/o/oauth2/v2/auth" {
		t.Fatalf("expected default Google auth URL, got %q", cfg.OIDCAuthURL)
	}
	if cfg.OIDCTokenURL != "https://oauth2.googleapis.com/token" {
		t.Fatalf("expected default Google token URL, got %q", cfg.OIDCTokenURL)
	}
	if cfg.OIDCUserInfoURL != "https://openidconnect.googleapis.com/v1/userinfo" {
		t.Fatalf("expected default Google userinfo URL, got %q", cfg.OIDCUserInfoURL)
	}
}

func TestLoadUsesEnvironmentOverrides(t *testing.T) {
	t.Setenv("HTTP_ADDR", ":9090")
	t.Setenv("DATABASE_URL", "postgres://example")
	t.Setenv("SESSION_COOKIE_SECURE", "true")
	t.Setenv("OIDC_ISSUER_URL", "https://accounts.google.com")
	t.Setenv("OIDC_CLIENT_ID", "client-id")
	t.Setenv("OIDC_CLIENT_SECRET", "client-secret")
	t.Setenv("OIDC_REDIRECT_URL", "http://localhost:8080/auth/callback")
	t.Setenv("OIDC_AUTH_URL", "https://oidc.example/auth")
	t.Setenv("OIDC_TOKEN_URL", "https://oidc.example/token")
	t.Setenv("OIDC_USERINFO_URL", "https://oidc.example/userinfo")

	cfg := Load()

	if cfg.HTTPAddr != ":9090" {
		t.Fatalf("expected overridden HTTPAddr %q, got %q", ":9090", cfg.HTTPAddr)
	}
	if cfg.DatabaseURL != "postgres://example" {
		t.Fatalf("expected overridden DatabaseURL %q, got %q", "postgres://example", cfg.DatabaseURL)
	}
	if !cfg.SessionCookieSecure {
		t.Fatal("expected session cookie secure override to be true")
	}
	if cfg.OIDCIssuerURL != "https://accounts.google.com" {
		t.Fatalf("expected OIDC issuer URL override, got %q", cfg.OIDCIssuerURL)
	}
	if cfg.OIDCClientID != "client-id" {
		t.Fatalf("expected OIDC client ID override, got %q", cfg.OIDCClientID)
	}
	if cfg.OIDCClientSecret != "client-secret" {
		t.Fatalf("expected OIDC client secret override, got %q", cfg.OIDCClientSecret)
	}
	if cfg.OIDCRedirectURL != "http://localhost:8080/auth/callback" {
		t.Fatalf("expected OIDC redirect URL override, got %q", cfg.OIDCRedirectURL)
	}
	if cfg.OIDCAuthURL != "https://oidc.example/auth" {
		t.Fatalf("expected OIDC auth URL override, got %q", cfg.OIDCAuthURL)
	}
	if cfg.OIDCTokenURL != "https://oidc.example/token" {
		t.Fatalf("expected OIDC token URL override, got %q", cfg.OIDCTokenURL)
	}
	if cfg.OIDCUserInfoURL != "https://oidc.example/userinfo" {
		t.Fatalf("expected OIDC userinfo URL override, got %q", cfg.OIDCUserInfoURL)
	}
}
