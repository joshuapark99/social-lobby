# Social Lobby

Invite-only social web app with a TypeScript Fastify backend and React/Vite frontend.

## Workspaces

- `backend`: TypeScript Fastify HTTP service.
- `frontend`: React and Vite browser app.

## Common Commands

Repository root:

```bash
npm test
npm run test:smoke
npm run test:backend:integration
npm run build
```

Backend:

```bash
cd backend
npm install
npm test
npm run build
npm run dev
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
