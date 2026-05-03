import type { FastifyInstance } from "fastify";
import { requireIdentity } from "../auth/http.js";
import type { AuthService } from "../auth/service.js";
import { isChatAccessError, type ChatService } from "../chat/service.js";
import { isRoomAccessError, type RoomService } from "./service.js";

export function registerRoomRoutes(
  server: FastifyInstance,
  options: { authService: AuthService; roomService: RoomService; chatService: ChatService }
): void {
  server.get("/api/communities/default/rooms", async (request, reply) => {
    const identity = await requireIdentity(request, reply, options.authService);
    if (!identity) return reply;

    try {
      return reply.status(200).send(await options.roomService.listDefaultCommunityRooms(identity.userId));
    } catch (error) {
      if (isRoomAccessError(error)) {
        return reply.status(403).send({ error: error.message });
      }
      return reply.status(500).send({ error: errorMessage(error) });
    }
  });

  server.get("/api/communities", async (request, reply) => {
    const identity = await requireIdentity(request, reply, options.authService);
    if (!identity) return reply;

    try {
      return reply.status(200).send(await options.roomService.listUserCommunities(identity.userId));
    } catch (error) {
      return reply.status(500).send({ error: errorMessage(error) });
    }
  });

  server.get<{ Params: { communitySlug: string } }>("/api/communities/:communitySlug/rooms", async (request, reply) => {
    const identity = await requireIdentity(request, reply, options.authService);
    if (!identity) return reply;

    try {
      const rooms = await options.roomService.listCommunityRooms(request.params.communitySlug, identity.userId);
      if (!rooms) return reply.status(404).send({ error: "community not found" });
      return reply.status(200).send(rooms);
    } catch (error) {
      if (isRoomAccessError(error)) {
        return reply.status(403).send({ error: error.message });
      }
      return reply.status(500).send({ error: errorMessage(error) });
    }
  });

  server.get<{ Params: { communityId: string } }>("/api/community/:communityId/rooms", async (request, reply) => {
    const identity = await requireIdentity(request, reply, options.authService);
    if (!identity) return reply;

    try {
      const rooms = await options.roomService.listCommunityRoomsById(request.params.communityId, identity.userId);
      if (!rooms) return reply.status(404).send({ error: "community not found" });
      return reply.status(200).send(rooms);
    } catch (error) {
      if (isRoomAccessError(error)) {
        return reply.status(403).send({ error: error.message });
      }
      return reply.status(500).send({ error: errorMessage(error) });
    }
  });

  server.get<{ Params: { communitySlug: string; roomSlug: string } }>(
    "/api/communities/:communitySlug/rooms/:roomSlug",
    async (request, reply) => {
      const identity = await requireIdentity(request, reply, options.authService);
      if (!identity) return reply;

      try {
        const room = await options.roomService.roomByCommunitySlug(
          request.params.communitySlug,
          request.params.roomSlug,
          identity.userId
        );
        if (!room) return reply.status(404).send({ error: "room not found" });
        return reply.status(200).send(room);
      } catch (error) {
        if (isRoomAccessError(error)) {
          return reply.status(403).send({ error: error.message });
        }
        return reply.status(500).send({ error: errorMessage(error) });
      }
    }
  );

  server.get<{ Params: { communityId: string; roomSlug: string } }>(
    "/api/community/:communityId/rooms/:roomSlug",
    async (request, reply) => {
      const identity = await requireIdentity(request, reply, options.authService);
      if (!identity) return reply;

      try {
        const room = await options.roomService.roomByCommunityId(
          request.params.communityId,
          request.params.roomSlug,
          identity.userId
        );
        if (!room) return reply.status(404).send({ error: "room not found" });
        return reply.status(200).send(room);
      } catch (error) {
        if (isRoomAccessError(error)) {
          return reply.status(403).send({ error: error.message });
        }
        return reply.status(500).send({ error: errorMessage(error) });
      }
    }
  );

  server.get<{ Params: { roomSlug: string } }>("/api/rooms/:roomSlug", async (request, reply) => {
    const identity = await requireIdentity(request, reply, options.authService);
    if (!identity) return reply;

    try {
      const room = await options.roomService.roomBySlug(request.params.roomSlug, identity.userId);
      if (!room) return reply.status(404).send({ error: "room not found" });
      return reply.status(200).send(room);
    } catch (error) {
      if (isRoomAccessError(error)) {
        return reply.status(403).send({ error: error.message });
      }
      return reply.status(500).send({ error: errorMessage(error) });
    }
  });

  server.get<{ Params: { roomSlug: string } }>("/api/rooms/:roomSlug/messages", async (request, reply) => {
    const identity = await requireIdentity(request, reply, options.authService);
    if (!identity) return reply;

    try {
      const messages = await options.chatService.listRecentMessages({
        roomSlug: request.params.roomSlug,
        userId: identity.userId
      });
      return reply.status(200).send({ messages });
    } catch (error) {
      if (isChatAccessError(error)) {
        return reply.status(403).send({ error: error.message });
      }
      return reply.status(500).send({ error: errorMessage(error) });
    }
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "request failed";
}
