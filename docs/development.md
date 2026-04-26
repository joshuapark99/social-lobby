# Development

Development happens directly on the Raspberry Pi under `/home/jpark/development/social-lobby`.

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

Do not run broad Docker cleanup, prune, network, or service restart commands on this Raspberry Pi. Project-local Docker files may be added in later tickets, but Docker host services must not be changed incidentally.
