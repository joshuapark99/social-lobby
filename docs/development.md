# Development

Run commands from the repository root unless a section says otherwise.

## Backend

```bash
cd backend
go test ./...
go run ./cmd/server
```

The backend listens on `:8081` by default and exposes `GET /healthz`.

### Auth Configuration

SL-005 keeps browser auth backend-owned. Local development uses generic OIDC
settings so Google is the first provider without making the route handlers
Google-specific.

```bash
SESSION_COOKIE_SECURE=false
OIDC_ISSUER_URL=https://accounts.google.com
OIDC_AUTH_URL=https://accounts.google.com/o/oauth2/v2/auth
OIDC_TOKEN_URL=https://oauth2.googleapis.com/token
OIDC_USERINFO_URL=https://openidconnect.googleapis.com/v1/userinfo
OIDC_CLIENT_ID=replace-with-client-id
OIDC_CLIENT_SECRET=replace-with-client-secret
OIDC_REDIRECT_URL=http://localhost:8081/auth/callback
```

Use `SESSION_COOKIE_SECURE=true` when serving over HTTPS. Do not store provider
access tokens in frontend JavaScript for normal browser sessions.

### Database Migrations

SL-004 keeps the database layer portable PostgreSQL:

- SQL migrations live in `backend/internal/database/migrations`.
- Seed SQL lives in `backend/internal/database/seeds`.
- Reviewable room layout JSON lives in `backend/internal/database/seeds/layouts`.
- `DATABASE_URL` configures the application database connection string.
- `TEST_DATABASE_URL` configures the isolated integration-test database.
- Auth sessions are stored by hashed token in the `user_sessions` table.
- Row level security is enabled on durable application tables as a guardrail.
  Policy definitions and `FORCE ROW LEVEL SECURITY` are deferred until the
  backend has request-scoped database authorization context.

From `backend/`, load local values from `.env` before running migration
commands:

```bash
cd backend
set -a
source ../.env
set +a
```

Run migrations and seed data against the application database with:

```bash
cd backend
GOCACHE=/home/jpark/development/social-lobby/.cache/go-build \
  go run ./cmd/migrate -db app
```

Run migrations and seed data against the test database with:

```bash
cd backend
GOCACHE=/home/jpark/development/social-lobby/.cache/go-build \
  go run ./cmd/migrate -db test
```

Pass `-seed=false` to apply only schema migrations.

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
