package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"social-lobby/backend/internal/config"
)

func NewRouter(cfg config.Config) http.Handler {
	return NewRouterWithAuth(cfg, newConfiguredAuthService(cfg))
}

func NewRouterWithAuth(cfg config.Config, authService AuthService) http.Handler {
	router := chi.NewRouter()
	router.Get("/healthz", handleHealthz)
	registerAuthRoutes(router, cfg, authService)
	return router
}

func handleHealthz(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}
