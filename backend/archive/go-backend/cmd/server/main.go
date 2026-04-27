package main

import (
	"database/sql"
	"log"
	"net/http"

	_ "github.com/jackc/pgx/v5/stdlib"

	"social-lobby/backend/internal/auth"
	"social-lobby/backend/internal/config"
	"social-lobby/backend/internal/server"
)

func main() {
	cfg := config.Load()
	router := server.NewRouter(cfg)

	if cfg.DatabaseURL != "" {
		db, err := sql.Open("pgx", cfg.DatabaseURL)
		if err != nil {
			log.Fatal(err)
		}
		defer db.Close()

		if err := db.Ping(); err != nil {
			log.Fatal(err)
		}

		authService := auth.NewService(auth.ServiceOptions{
			Provider: auth.OIDCProvider{
				AuthURL:      cfg.OIDCAuthURL,
				TokenURL:     cfg.OIDCTokenURL,
				UserInfoURL:  cfg.OIDCUserInfoURL,
				ClientID:     cfg.OIDCClientID,
				ClientSecret: cfg.OIDCClientSecret,
				RedirectURL:  cfg.OIDCRedirectURL,
				ProviderName: "google",
				Scopes:       []string{"openid", "email", "profile"},
			},
			Store: auth.NewPostgresStore(db),
		})
		router = server.NewRouterWithAuth(cfg, authService)
	}

	log.Printf("social-lobby backend listening on %s", cfg.HTTPAddr)
	if err := http.ListenAndServe(cfg.HTTPAddr, router); err != nil {
		log.Fatal(err)
	}
}
