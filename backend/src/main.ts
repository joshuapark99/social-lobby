import { Pool } from "pg";
import { loadConfig, parseHttpAddr } from "./config/config.js";
import { OidcProvider } from "./auth/oidc.js";
import { createAuthService, disabledAuthService } from "./auth/service.js";
import { PostgresAuthStore } from "./auth/postgresStore.js";
import { createInviteService, disabledInviteService } from "./invites/service.js";
import { PostgresInviteStore } from "./invites/postgresStore.js";
import { buildServer } from "./server/server.js";

const config = loadConfig();
let authService = disabledAuthService();
let inviteService = disabledInviteService();
let pool: Pool | undefined;

if (config.databaseUrl) {
  pool = new Pool({ connectionString: config.databaseUrl });
  await pool.query("SELECT 1");
  authService = createAuthService({
    provider: new OidcProvider(config.oidc),
    store: new PostgresAuthStore(pool)
  });
  inviteService = createInviteService({
    store: new PostgresInviteStore(pool)
  });
}

const server = buildServer({ config, authService, inviteService });
const { host, port } = parseHttpAddr(config.httpAddr);

const shutdown = async () => {
  await server.close();
  await pool?.end();
};
process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));

await server.listen({ host, port });
