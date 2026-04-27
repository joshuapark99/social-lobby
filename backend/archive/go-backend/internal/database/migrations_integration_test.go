package database

import (
	"context"
	"database/sql"
	"os"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func TestApplyCreatesSchemaAndSeedDataAgainstPostgres(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set TEST_DATABASE_URL to an isolated empty Postgres database to run migration integration checks")
	}

	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	defer db.Close()

	ctx := context.Background()
	if err := db.PingContext(ctx); err != nil {
		t.Fatalf("ping test database: %v", err)
	}

	if err := Apply(ctx, db, Options{Seed: true}); err != nil {
		t.Fatalf("apply migrations and seeds: %v", err)
	}

	for _, table := range []string{
		"users",
		"linked_identities",
		"communities",
		"memberships",
		"invites",
		"room_layouts",
		"rooms",
		"room_messages",
		"visited_rooms",
		"temporary_room_lifecycle_records",
		"user_sessions",
	} {
		var exists bool
		err := db.QueryRowContext(ctx, `SELECT to_regclass('public.' || $1) IS NOT NULL`, table).Scan(&exists)
		if err != nil {
			t.Fatalf("check table %s: %v", table, err)
		}
		if !exists {
			t.Fatalf("expected table %s to exist", table)
		}
	}

	var defaultRooms int
	err = db.QueryRowContext(ctx, `
		SELECT count(*)
		FROM rooms
		WHERE community_id = '00000000-0000-4000-8000-000000000001'
		  AND kind = 'permanent'
	`).Scan(&defaultRooms)
	if err != nil {
		t.Fatalf("count default permanent rooms: %v", err)
	}
	if defaultRooms < 2 {
		t.Fatalf("expected at least two default permanent rooms, got %d", defaultRooms)
	}
}
