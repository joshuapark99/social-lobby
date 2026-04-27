import { Pool } from "pg";
import { loadConfig, parseHttpAddr } from "./config/config.js";
import { OidcProvider } from "./auth/oidc.js";
import { createAuthService, disabledAuthService } from "./auth/service.js";
import { PostgresAuthStore } from "./auth/postgresStore.js";
import { buildServer } from "./server/server.js";

const config = loadConfig();
let authService = disabledAuthService();
let pool: Pool | undefined;

if (config.databaseUrl) {
  pool = new Pool({ connectionString: config.databaseUrl });
  await pool.query("SELECT 1");
  authService = createAuthService({
    provider: new OidcProvider(config.oidc),
    store: new PostgresAuthStore(pool)
  });
}

const server = buildServer({ config, authService });
const { host, port } = parseHttpAddr(config.httpAddr);

const shutdown = async () => {
  await server.close();
  await pool?.end();
};
process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));

await server.listen({ host, port });
