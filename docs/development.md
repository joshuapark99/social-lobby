# Development

Run commands from the repository root unless a section says otherwise.

## Backend

```bash
cd backend
go test ./...
go run ./cmd/server
```

The skeleton server listens on `:8080` by default and exposes `GET /healthz`.

### Database Migrations

SL-004 keeps the database layer portable PostgreSQL:

- SQL migrations live in `backend/internal/database/migrations`.
- Seed SQL lives in `backend/internal/database/seeds`.
- Reviewable room layout JSON lives in `backend/internal/database/seeds/layouts`.
- `DATABASE_URL` configures the application database connection string.

Run the normal backend tests with:

```bash
cd backend
GOCACHE=../.cache/go-build go test ./...
```

To verify migrations against a real database, point `TEST_DATABASE_URL` at an
isolated empty development database. Do not point it at shared or production
data.

```bash
cd backend
TEST_DATABASE_URL=postgres://social_lobby:social_lobby@localhost:5432/social_lobby_test?sslmode=disable \
  GOCACHE=../.cache/go-build \
  go test ./internal/database
```

Development rollback strategy: treat local databases as disposable while the
schema is still young. Drop and recreate the isolated development database,
then rerun the migrations and seeds. Do not run destructive reset commands
against shared, production, or host-service databases.

## Frontend

```bash
cd frontend
npm install
npm test
npm run dev
```

The frontend is a React/Vite workspace. `npm install` is required before running frontend tests or the dev server.

## Docker Safety

Keep Docker commands scoped to this Compose project. Do not run broad Docker
cleanup, prune, network, volume, or service restart commands as incidental
development steps on a shared host.

## Database

Use the project-local PostgreSQL Compose service for development and migration
integration checks. See `docs/database.md`.
