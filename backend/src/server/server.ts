import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import type { Config } from "../config/config.js";
import { defaultAuthService } from "../auth/defaultService.js";
import type { AuthService } from "../auth/service.js";
import { registerAuthRoutes } from "../auth/routes.js";
import { disabledInviteService, type InviteService } from "../invites/service.js";
import { registerInviteRoutes } from "../invites/routes.js";
import { disabledRoomService, type RoomService } from "../rooms/service.js";
import { registerRoomRoutes } from "../rooms/routes.js";
import { registerHealthRoutes } from "./healthRoutes.js";

export function buildServer(options: {
  config: Config;
  authService?: AuthService;
  inviteService?: InviteService;
  roomService?: RoomService;
}): FastifyInstance {
  const server = Fastify();
  const authService = options.authService ?? defaultAuthService(options.config);
  const inviteService = options.inviteService ?? disabledInviteService();
  const roomService = options.roomService ?? disabledRoomService();

  void server.register(cookie);

  registerHealthRoutes(server);
  registerAuthRoutes(server, { config: options.config, authService });
  registerInviteRoutes(server, { authService, inviteService });
  registerRoomRoutes(server, { authService, roomService });

  return server;
}
