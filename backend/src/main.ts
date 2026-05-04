import { Pool } from "pg";
import { loadConfig, parseHttpAddr } from "./config/config.js";
import { OidcProvider } from "./auth/oidc.js";
import { createAuthService, disabledAuthService } from "./auth/service.js";
import { createChatService, disabledChatService } from "./chat/service.js";
import { PostgresChatStore } from "./chat/postgresStore.js";
import { PostgresCommunityAccessStore } from "./communities/postgresStore.js";
import { createCommunityAccessService, disabledCommunityAccessService } from "./communities/service.js";
import { PostgresAuthStore } from "./auth/postgresStore.js";
import { createInviteService, disabledInviteService } from "./invites/service.js";
import { PostgresInviteStore } from "./invites/postgresStore.js";
import { createRoomService, disabledRoomService } from "./rooms/service.js";
import { PostgresRoomStore } from "./rooms/postgresStore.js";
import { buildServer } from "./server/server.js";
import { PostgresTeleportStore } from "./teleport/postgresStore.js";
import { createTeleportService, disabledTeleportService } from "./teleport/service.js";
import type { ReadinessResult } from "./server/observability.js";

const config = loadConfig();
let authService = disabledAuthService();
let chatService = disabledChatService();
let communityAccessService = disabledCommunityAccessService();
let inviteService = disabledInviteService();
let roomService = disabledRoomService();
let teleportService = disabledTeleportService();
let pool: Pool | undefined;

if (config.databaseUrl) {
  pool = new Pool({ connectionString: config.databaseUrl });
  await pool.query("SELECT 1");
  authService = createAuthService({
    provider: new OidcProvider(config.oidc),
    store: new PostgresAuthStore(pool)
  });
  chatService = createChatService({
    store: new PostgresChatStore(pool)
  });
  communityAccessService = createCommunityAccessService({
    store: new PostgresCommunityAccessStore(pool)
  });
  inviteService = createInviteService({
    store: new PostgresInviteStore(pool)
  });
  roomService = createRoomService({
    store: new PostgresRoomStore(pool)
  });
  teleportService = createTeleportService({
    roomService,
    store: new PostgresTeleportStore(pool)
  });
}

const server = buildServer({
  config,
  authService,
  chatService,
  communityAccessService,
  inviteService,
  roomService,
  teleportService,
  readinessCheck: async (): Promise<ReadinessResult> => {
    if (!pool) {
      return { ready: true };
    }

    try {
      await pool.query("SELECT 1");
      return { ready: true };
    } catch {
      return {
        ready: false,
        checks: {
          database: "unreachable"
        }
      };
    }
  }
});
const { host, port } = parseHttpAddr(config.httpAddr);

const shutdown = async () => {
  await server.close();
  await pool?.end();
};
process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));

await server.listen({ host, port });
