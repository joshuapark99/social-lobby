package main

import (
	"context"
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"

	_ "github.com/jackc/pgx/v5/stdlib"

	"social-lobby/backend/internal/database"
)

type target struct {
	Name        string
	DatabaseURL string
}

func main() {
	dbFlag := flag.String("db", "app", "database target to migrate: app or test")
	seedFlag := flag.Bool("seed", true, "apply seed data after migrations")
	flag.Parse()

	if err := run(context.Background(), *dbFlag, *seedFlag); err != nil {
		log.Fatal(err)
	}
}

func run(ctx context.Context, dbName string, seed bool) error {
	target, err := migrationTarget(dbName)
	if err != nil {
		return err
	}

	db, err := sql.Open("pgx", target.DatabaseURL)
	if err != nil {
		return fmt.Errorf("open %s database: %w", target.Name, err)
	}
	defer db.Close()

	if err := db.PingContext(ctx); err != nil {
		return fmt.Errorf("ping %s database: %w", target.Name, err)
	}

	if err := database.Apply(ctx, db, database.Options{Seed: seed}); err != nil {
		return fmt.Errorf("apply migrations to %s database: %w", target.Name, err)
	}

	log.Printf("applied migrations to %s database", target.Name)
	return nil
}

func migrationTarget(dbName string) (target, error) {
	switch dbName {
	case "app":
		return targetFromEnv("app", "DATABASE_URL")
	case "test":
		return targetFromEnv("test", "TEST_DATABASE_URL")
	default:
		return target{}, fmt.Errorf("unknown database target %q; use app or test", dbName)
	}
}

func targetFromEnv(name string, key string) (target, error) {
	databaseURL := os.Getenv(key)
	if databaseURL == "" {
		return target{}, errors.New(key + " is required")
	}

	return target{
		Name:        name,
		DatabaseURL: databaseURL,
	}, nil
}
