import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import type { Config } from "../config/config.js";
import { defaultAuthService } from "../auth/defaultService.js";
import type { AuthService } from "../auth/service.js";
import { registerAuthRoutes } from "../auth/routes.js";
import { disabledChatService, type ChatService } from "../chat/service.js";
import { disabledInviteService, type InviteService } from "../invites/service.js";
import { registerInviteRoutes } from "../invites/routes.js";
import { registerRealtimeRoutes } from "../realtime/routes.js";
import { disabledRoomService, type RoomService } from "../rooms/service.js";
import { registerRoomRoutes } from "../rooms/routes.js";
import { disabledTeleportService, type TeleportService } from "../teleport/service.js";
import { registerHealthRoutes } from "./healthRoutes.js";

export function buildServer(options: {
  config: Config;
  authService?: AuthService;
  chatService?: ChatService;
  inviteService?: InviteService;
  roomService?: RoomService;
  teleportService?: TeleportService;
}): FastifyInstance {
  const server = Fastify();
  const authService = options.authService ?? defaultAuthService(options.config);
  const chatService = options.chatService ?? disabledChatService();
  const inviteService = options.inviteService ?? disabledInviteService();
  const roomService = options.roomService ?? disabledRoomService();
  const teleportService = options.teleportService ?? disabledTeleportService();

  void server.register(cookie);
  void server.register(websocket);

  registerHealthRoutes(server);
  registerAuthRoutes(server, { config: options.config, authService });
  registerInviteRoutes(server, { authService, inviteService });
  registerRoomRoutes(server, { authService, roomService, chatService });
  void server.register(async (instance) => {
    registerRealtimeRoutes(instance, { authService, roomService, chatService, teleportService });
  });

  return server;
}
