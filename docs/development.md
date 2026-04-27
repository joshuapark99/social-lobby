# Development

Run commands from the repository root unless a section says otherwise.

## Backend

```bash
cd backend
go test ./...
go run ./cmd/server
```

The skeleton server listens on `:8080` by default and exposes `GET /healthz`.

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
