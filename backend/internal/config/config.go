package config

import "os"

type Config struct {
	HTTPAddr            string
	DatabaseURL         string
	SessionCookieSecure bool
	OIDCIssuerURL       string
	OIDCAuthURL         string
	OIDCTokenURL        string
	OIDCUserInfoURL     string
	OIDCClientID        string
	OIDCClientSecret    string
	OIDCRedirectURL     string
}

func Load() Config {
	return Config{
		HTTPAddr:            envOrDefault("HTTP_ADDR", ":8081"),
		DatabaseURL:         os.Getenv("DATABASE_URL"),
		SessionCookieSecure: os.Getenv("SESSION_COOKIE_SECURE") == "true",
		OIDCIssuerURL:       os.Getenv("OIDC_ISSUER_URL"),
		OIDCAuthURL:         envOrDefault("OIDC_AUTH_URL", "https://accounts.google.com/o/oauth2/v2/auth"),
		OIDCTokenURL:        envOrDefault("OIDC_TOKEN_URL", "https://oauth2.googleapis.com/token"),
		OIDCUserInfoURL:     envOrDefault("OIDC_USERINFO_URL", "https://openidconnect.googleapis.com/v1/userinfo"),
		OIDCClientID:        os.Getenv("OIDC_CLIENT_ID"),
		OIDCClientSecret:    os.Getenv("OIDC_CLIENT_SECRET"),
		OIDCRedirectURL:     os.Getenv("OIDC_REDIRECT_URL"),
	}
}

func envOrDefault(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}
