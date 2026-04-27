package database

import (
	"context"
	"database/sql"
	"embed"
	"io/fs"
	"path/filepath"
	"sort"
)

//go:embed migrations/*.sql seeds/*.sql seeds/layouts/*.json
var migrationFiles embed.FS

type Options struct {
	Seed bool
}

type Executor interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

type SeedLayout struct {
	Name string
	JSON []byte
}

func Apply(ctx context.Context, executor Executor, options Options) error {
	for _, file := range sqlFiles("migrations") {
		if _, err := executor.ExecContext(ctx, file.SQL); err != nil {
			return err
		}
	}

	if !options.Seed {
		return nil
	}

	for _, file := range sqlFiles("seeds") {
		if _, err := executor.ExecContext(ctx, file.SQL); err != nil {
			return err
		}
	}

	return nil
}

func MigrationNames() []string {
	return sqlFileNames("migrations")
}

func MigrationSQL() []string {
	return sqlFileSQL("migrations")
}

func SeedNames() []string {
	return sqlFileNames("seeds")
}

func SeedSQL() []string {
	return sqlFileSQL("seeds")
}

func SeedLayouts() []SeedLayout {
	entries := dirEntries("seeds/layouts")
	layouts := make([]SeedLayout, 0, len(entries))

	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}

		path := filepath.Join("seeds/layouts", entry.Name())
		content, err := migrationFiles.ReadFile(path)
		if err != nil {
			panic(err)
		}

		layouts = append(layouts, SeedLayout{
			Name: entry.Name(),
			JSON: content,
		})
	}

	return layouts
}

type sqlFile struct {
	Name string
	SQL  string
}

func sqlFileNames(dir string) []string {
	files := sqlFiles(dir)
	names := make([]string, 0, len(files))
	for _, file := range files {
		names = append(names, file.Name)
	}
	return names
}

func sqlFileSQL(dir string) []string {
	files := sqlFiles(dir)
	statements := make([]string, 0, len(files))
	for _, file := range files {
		statements = append(statements, file.SQL)
	}
	return statements
}

func sqlFiles(dir string) []sqlFile {
	entries := dirEntries(dir)
	files := make([]sqlFile, 0, len(entries))

	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".sql" {
			continue
		}

		path := filepath.Join(dir, entry.Name())
		content, err := migrationFiles.ReadFile(path)
		if err != nil {
			panic(err)
		}

		files = append(files, sqlFile{
			Name: path,
			SQL:  string(content),
		})
	}

	return files
}

func dirEntries(dir string) []fs.DirEntry {
	entries, err := migrationFiles.ReadDir(dir)
	if err != nil {
		panic(err)
	}

	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name() < entries[j].Name()
	})

	return entries
}
