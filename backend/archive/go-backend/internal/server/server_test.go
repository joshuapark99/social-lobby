package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"social-lobby/backend/internal/config"
)

func TestHealthzReturnsOK(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	response := httptest.NewRecorder()

	NewRouter(config.Config{HTTPAddr: ":8080"}).ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, response.Code)
	}

	body := strings.TrimSpace(response.Body.String())
	if body != `{"status":"ok"}` {
		t.Fatalf("expected health body, got %q", body)
	}

	contentType := response.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Fatalf("expected application/json content type, got %q", contentType)
	}
}

func TestHealthzRejectsWrongMethod(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/healthz", nil)
	response := httptest.NewRecorder()

	NewRouter(config.Config{HTTPAddr: ":8080"}).ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected status %d, got %d", http.StatusMethodNotAllowed, response.Code)
	}
}
