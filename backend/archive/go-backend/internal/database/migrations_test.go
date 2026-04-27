package database

import (
	"context"
	"database/sql"
	"reflect"
	"strings"
	"testing"
)

func TestMigrationsCreateRequiredDurableTables(t *testing.T) {
	requiredTables := []string{
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
	}

	sql := strings.ToLower(strings.Join(MigrationSQL(), "\n"))

	for _, table := range requiredTables {
		want := "create table if not exists " + table
		if !strings.Contains(sql, want) {
			t.Fatalf("expected migrations to include %q", want)
		}
	}
}

func TestMigrationsEnableRowLevelSecurityForDurableTables(t *testing.T) {
	requiredTables := []string{
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
	}

	sql := strings.ToLower(strings.Join(MigrationSQL(), "\n"))

	for _, table := range requiredTables {
		want := "alter table " + table + " enable row level security"
		if !strings.Contains(sql, want) {
			t.Fatalf("expected migrations to include %q", want)
		}
	}
}

func TestSeedDataIncludesDefaultCommunityPermanentRoomsAndLayoutJSON(t *testing.T) {
	seedSQL := strings.ToLower(strings.Join(SeedSQL(), "\n"))

	for _, fragment := range []string{
		"default-community",
		"main-lobby",
		"rooftop",
		"insert into communities",
		"insert into room_layouts",
		"insert into rooms",
		"permanent",
	} {
		if !strings.Contains(seedSQL, fragment) {
			t.Fatalf("expected seed SQL to include %q", fragment)
		}
	}

	layouts := SeedLayouts()
	if len(layouts) == 0 {
		t.Fatal("expected reviewable seed layout JSON files")
	}

	for _, layout := range layouts {
		if layout.Name == "" {
			t.Fatal("expected layout name")
		}
		if !strings.Contains(string(layout.JSON), `"spawnPoints"`) {
			t.Fatalf("expected layout %q to include spawnPoints", layout.Name)
		}
		if !strings.Contains(string(layout.JSON), `"teleports"`) {
			t.Fatalf("expected layout %q to include teleports", layout.Name)
		}
	}
}

func TestApplyRunsMigrationsThenSeedsInOrder(t *testing.T) {
	recorder := &recordingExecutor{}

	if err := Apply(context.Background(), recorder, Options{Seed: true}); err != nil {
		t.Fatalf("expected apply to succeed, got %v", err)
	}

	got := recorder.queries
	want := append(MigrationSQL(), SeedSQL()...)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected executed files %v, got %v", want, got)
	}
}

func TestApplyCanRunMigrationsWithoutSeeds(t *testing.T) {
	recorder := &recordingExecutor{}

	if err := Apply(context.Background(), recorder, Options{Seed: false}); err != nil {
		t.Fatalf("expected apply to succeed, got %v", err)
	}

	got := recorder.queries
	want := MigrationSQL()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected executed files %v, got %v", want, got)
	}
}

type recordingExecutor struct {
	queries []string
}

func (r *recordingExecutor) ExecContext(_ context.Context, query string, _ ...any) (sql.Result, error) {
	r.queries = append(r.queries, query)
	return nil, nil
}
