package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"social-lobby/backend/internal/config"
)

func NewRouter(_ config.Config) http.Handler {
	router := chi.NewRouter()
	router.Get("/healthz", handleHealthz)
	return router
}

func handleHealthz(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}
