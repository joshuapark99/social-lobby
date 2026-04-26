package config

import "testing"

func TestLoadUsesDevelopmentDefaults(t *testing.T) {
	t.Setenv("HTTP_ADDR", "")

	cfg := Load()

	if cfg.HTTPAddr != ":8080" {
		t.Fatalf("expected default HTTPAddr %q, got %q", ":8080", cfg.HTTPAddr)
	}
}

func TestLoadUsesEnvironmentOverrides(t *testing.T) {
	t.Setenv("HTTP_ADDR", ":9090")

	cfg := Load()

	if cfg.HTTPAddr != ":9090" {
		t.Fatalf("expected overridden HTTPAddr %q, got %q", ":9090", cfg.HTTPAddr)
	}
}
