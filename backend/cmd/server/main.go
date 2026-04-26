package main

import (
	"log"
	"net/http"

	"social-lobby/backend/internal/config"
	"social-lobby/backend/internal/server"
)

func main() {
	cfg := config.Load()

	log.Printf("social-lobby backend listening on %s", cfg.HTTPAddr)
	if err := http.ListenAndServe(cfg.HTTPAddr, server.NewRouter(cfg)); err != nil {
		log.Fatal(err)
	}
}
