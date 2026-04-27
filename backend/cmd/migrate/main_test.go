package main

import "testing"

func TestMigrationTargetUsesDatabaseURLForApp(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://app")
	t.Setenv("TEST_DATABASE_URL", "postgres://test")

	target, err := migrationTarget("app")
	if err != nil {
		t.Fatalf("expected app target to resolve: %v", err)
	}

	if target.Name != "app" {
		t.Fatalf("expected target name app, got %q", target.Name)
	}
	if target.DatabaseURL != "postgres://app" {
		t.Fatalf("expected app target to use DATABASE_URL, got %q", target.DatabaseURL)
	}
}

func TestMigrationTargetUsesTestDatabaseURLForTest(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://app")
	t.Setenv("TEST_DATABASE_URL", "postgres://test")

	target, err := migrationTarget("test")
	if err != nil {
		t.Fatalf("expected test target to resolve: %v", err)
	}

	if target.Name != "test" {
		t.Fatalf("expected target name test, got %q", target.Name)
	}
	if target.DatabaseURL != "postgres://test" {
		t.Fatalf("expected test target to use TEST_DATABASE_URL, got %q", target.DatabaseURL)
	}
}

func TestMigrationTargetRequiresDatabaseURL(t *testing.T) {
	t.Setenv("DATABASE_URL", "")

	if _, err := migrationTarget("app"); err == nil {
		t.Fatal("expected missing DATABASE_URL to fail")
	}
}

func TestMigrationTargetRequiresTestDatabaseURL(t *testing.T) {
	t.Setenv("TEST_DATABASE_URL", "")

	if _, err := migrationTarget("test"); err == nil {
		t.Fatal("expected missing TEST_DATABASE_URL to fail")
	}
}

func TestMigrationTargetRejectsUnknownDatabase(t *testing.T) {
	if _, err := migrationTarget("prod"); err == nil {
		t.Fatal("expected unknown database target to fail")
	}
}
