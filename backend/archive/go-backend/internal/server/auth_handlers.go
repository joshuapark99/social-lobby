package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"social-lobby/backend/internal/auth"
	"social-lobby/backend/internal/config"
)

const oidcStateCookieName = "sl_oidc_state"

type AuthService interface {
	LoginURL(ctx context.Context) (string, string, error)
	CompleteLogin(ctx context.Context, code string, state string) (auth.OIDCIdentity, string, string, error)
	Session(ctx context.Context, sessionToken string) (auth.OIDCIdentity, bool)
	Logout(ctx context.Context, sessionToken string) error
}

type disabledAuthService struct{}

func (disabledAuthService) LoginURL(context.Context) (string, string, error) {
	return "", "", errors.New("auth is not configured")
}

func (disabledAuthService) CompleteLogin(context.Context, string, string) (auth.OIDCIdentity, string, string, error) {
	return auth.OIDCIdentity{}, "", "", errors.New("auth is not configured")
}

func (disabledAuthService) Session(context.Context, string) (auth.OIDCIdentity, bool) {
	return auth.OIDCIdentity{}, false
}

func (disabledAuthService) Logout(context.Context, string) error {
	return nil
}

type configuredAuthService struct {
	provider auth.OIDCProvider
}

func newConfiguredAuthService(cfg config.Config) AuthService {
	return configuredAuthService{
		provider: auth.OIDCProvider{
			AuthURL:      cfg.OIDCAuthURL,
			TokenURL:     cfg.OIDCTokenURL,
			UserInfoURL:  cfg.OIDCUserInfoURL,
			ClientID:     cfg.OIDCClientID,
			ClientSecret: cfg.OIDCClientSecret,
			RedirectURL:  cfg.OIDCRedirectURL,
			ProviderName: "google",
			Scopes:       []string{"openid", "email", "profile"},
		},
	}
}

func (s configuredAuthService) LoginURL(context.Context) (string, string, error) {
	state, err := auth.NewSessionToken()
	if err != nil {
		return "", "", err
	}
	redirectURL, err := s.provider.AuthorizationURL(state)
	if err != nil {
		return "", "", err
	}
	return redirectURL, state, nil
}

func (configuredAuthService) CompleteLogin(context.Context, string, string) (auth.OIDCIdentity, string, string, error) {
	return auth.OIDCIdentity{}, "", "", errors.New("oidc callback exchange is not implemented")
}

func (configuredAuthService) Session(context.Context, string) (auth.OIDCIdentity, bool) {
	return auth.OIDCIdentity{}, false
}

func (configuredAuthService) Logout(context.Context, string) error {
	return nil
}

func registerAuthRoutes(router chi.Router, cfg config.Config, authService AuthService) {
	router.Get("/auth/login", handleAuthLogin(cfg, authService))
	router.Get("/auth/callback", handleAuthCallback(cfg, authService))
	router.Get("/auth/session", handleAuthSession(authService))
	router.With(auth.CSRFMiddleware).Post("/auth/logout", handleAuthLogout(cfg, authService))
}

func handleAuthLogin(cfg config.Config, authService AuthService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		redirectURL, state, err := authService.LoginURL(r.Context())
		if err != nil {
			http.Error(w, "auth unavailable", http.StatusServiceUnavailable)
			return
		}

		http.SetCookie(w, &http.Cookie{
			Name:     oidcStateCookieName,
			Value:    state,
			Path:     "/",
			HttpOnly: true,
			Secure:   cfg.SessionCookieSecure,
			SameSite: http.SameSiteLaxMode,
		})
		http.Redirect(w, r, redirectURL, http.StatusFound)
	}
}

func handleAuthCallback(cfg config.Config, authService AuthService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		stateCookie, err := r.Cookie(oidcStateCookieName)
		if err != nil || stateCookie.Value == "" || stateCookie.Value != r.URL.Query().Get("state") {
			http.Error(w, "invalid auth state", http.StatusUnauthorized)
			return
		}

		identity, sessionToken, csrfToken, err := authService.CompleteLogin(r.Context(), r.URL.Query().Get("code"), r.URL.Query().Get("state"))
		if err != nil || identity.Validate() != nil {
			http.Error(w, "invalid identity", http.StatusUnauthorized)
			return
		}

		auth.SetSessionCookie(w, sessionToken, cfg.SessionCookieSecure)
		setCSRFCookie(w, csrfToken, cfg.SessionCookieSecure)
		writeJSON(w, http.StatusOK, identityResponse{Email: identity.Email})
	}
}

func handleAuthSession(authService AuthService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(auth.SessionCookieName)
		if err != nil || cookie.Value == "" {
			http.Error(w, "session required", http.StatusUnauthorized)
			return
		}

		identity, ok := authService.Session(r.Context(), cookie.Value)
		if !ok {
			http.Error(w, "session required", http.StatusUnauthorized)
			return
		}

		writeJSON(w, http.StatusOK, identityResponse{Email: identity.Email})
	}
}

func handleAuthLogout(cfg config.Config, authService AuthService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cookie, err := r.Cookie(auth.SessionCookieName); err == nil && cookie.Value != "" {
			if err := authService.Logout(r.Context(), cookie.Value); err != nil {
				http.Error(w, "logout failed", http.StatusInternalServerError)
				return
			}
		}
		auth.ClearSessionCookie(w, cfg.SessionCookieSecure)
		http.SetCookie(w, &http.Cookie{
			Name:     auth.CSRFTokenCookieName,
			Value:    "",
			Path:     "/",
			Secure:   cfg.SessionCookieSecure,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   -1,
		})
		w.WriteHeader(http.StatusNoContent)
	}
}

type identityResponse struct {
	Email string `json:"email"`
}

func setCSRFCookie(w http.ResponseWriter, token string, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     auth.CSRFTokenCookieName,
		Value:    token,
		Path:     "/",
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
