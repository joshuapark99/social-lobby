# Social Lobby

Invite-only social web app with a Go backend and React/Vite frontend.

## Workspaces

- `backend`: Go HTTP service.
- `frontend`: React and Vite browser app.

## Common Commands

Backend:

```bash
cd backend
go test ./...
go run ./cmd/server
```

Frontend:

```bash
cd frontend
npm install
npm test
npm run dev
```

See `docs/development.md` for local development details and
`docs/database.md` for PostgreSQL setup. See `docs/collaboration.md` for the
branch and release flow.
