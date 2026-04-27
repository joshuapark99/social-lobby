# Database

Social Lobby uses project-local PostgreSQL for development. The default setup is
a Docker Compose service scoped to this repository.

## Connection Strings

Application database:

```text
postgres://social_lobby:social_lobby@localhost:5432/social_lobby?sslmode=disable
```

Integration-test database:

```text
postgres://social_lobby:social_lobby@localhost:5432/social_lobby_test?sslmode=disable
```

These values match `.env.example` and the backend `TEST_DATABASE_URL` migration
flow.

The migrate command reads `DATABASE_URL` for the application database and
`TEST_DATABASE_URL` for the integration-test database. From `backend/`, load
local `.env` values with:

```bash
set -a
source ../.env
set +a
```

## Local Setup

Keep database commands scoped to this Compose project. On a shared development
host, do not run broad Docker cleanup, prune, network, volume, service restart,
or host-network commands as part of Social Lobby development.

Start the project database:

```bash
docker compose up -d postgres
```

Check health:

```bash
docker compose ps postgres
```

Stop the project database without deleting data:

```bash
docker compose stop postgres
```

Remove the project database container and network without deleting the named
Postgres data volume:

```bash
docker compose down
```

## Prerequisites

- Docker Engine or Docker Desktop
- Docker Compose v2
- Node.js and npm matching the backend package

## Startup

From the repository root:

```bash
docker compose up -d postgres
docker compose ps postgres
```

If port `5432` is already in use on the host machine, choose another host port:

```bash
SOCIAL_LOBBY_POSTGRES_PORT=55432 docker compose up -d postgres
```

Use the same port in local connection strings:

```text
postgres://social_lobby:social_lobby@localhost:55432/social_lobby?sslmode=disable
postgres://social_lobby:social_lobby@localhost:55432/social_lobby_test?sslmode=disable
```

Then run the backend tests:

```bash
cd backend
npm install
npm test
```

Run migrations and seed data against the application database:

```bash
cd backend
npm run migrate -- --db=app
```

Run migrations and seed data against the integration-test database:

```bash
cd backend
npm run migrate -- --db=test
```

Pass `--seed=false` to apply only schema migrations.

Current migrations enable row level security on durable application tables as a
guardrail. Policy definitions and `FORCE ROW LEVEL SECURITY` are intentionally
deferred until the backend has request-scoped database authorization context.

Run the real Postgres migration integration check:

```bash
cd backend
TEST_DATABASE_URL='postgres://social_lobby:social_lobby@localhost:5432/social_lobby_test?sslmode=disable' \
  npm run migrate -- --db=test
```

If you used a custom host port, replace `5432` in `TEST_DATABASE_URL` with that
port.

## Resetting Local Database State

Use this only for disposable local development data. It removes the Social Lobby
Postgres container and the Social Lobby named database volume, then recreates
the database from the Compose initialization files.

```bash
docker compose down -v
docker compose up -d postgres
```

Do not run `docker system prune`, `docker volume prune`, mass `docker stop`, or
mass `docker rm` for this project.
