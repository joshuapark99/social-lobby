import type { FastifyInstance } from "fastify";
import { csrfMatches } from "../auth/cookies.js";
import { requireIdentity } from "../auth/http.js";
import type { AuthService } from "../auth/service.js";
import type { RoomService } from "../rooms/service.js";
import type { CommunityAccessService, CommunityRole } from "./service.js";
import { isCommunityAccessError, isCommunitySlugConflictError, isCommunityValidationError } from "./service.js";

export function registerCommunityRoutes(
  server: FastifyInstance,
  options: { authService: AuthService; communityAccessService: CommunityAccessService; roomService: RoomService }
): void {
  server.post<{ Body: { name?: string } }>("/api/communities", async (request, reply) => {
    if (!csrfMatches(request)) return reply.status(403).send({ error: "csrf token mismatch" });
    const identity = await requireIdentity(request, reply, options.authService);
    if (!identity) return reply;

    try {
      const community = await options.communityAccessService.createCommunity({
        actorUserId: identity.userId,
        name: request.body?.name ?? ""
      });
      const rooms = await options.roomService.listCommunityRoomsById(community.id, identity.userId);
      return reply.status(201).send(rooms ?? { community, rooms: [] });
    } catch (error) {
      if (isCommunitySlugConflictError(error)) return reply.status(409).send({ error: error.message });
      if (isCommunityValidationError(error)) return reply.status(400).send({ error: error.message });
      if (isCommunityAccessError(error)) return reply.status(403).send({ error: error.message });
      return reply.status(400).send({ error: errorMessage(error) });
    }
  });

  server.get<{ Params: { communityId: string } }>("/api/communities/:communityId/members", async (request, reply) => {
    const identity = await requireIdentity(request, reply, options.authService);
    if (!identity) return reply;

    try {
      const members = await options.communityAccessService.listCommunityMembers({
        actorUserId: identity.userId,
        communityId: request.params.communityId
      });
      return reply.status(200).send({ members });
    } catch (error) {
      if (isCommunityAccessError(error)) return reply.status(403).send({ error: error.message });
      return reply.status(400).send({ error: errorMessage(error) });
    }
  });

  server.put<{
    Params: { communityId: string; userId: string };
    Body: { role?: CommunityRole };
  }>("/api/communities/:communityId/members/:userId/role", async (request, reply) => {
    if (!csrfMatches(request)) return reply.status(403).send({ error: "csrf token mismatch" });
    const identity = await requireIdentity(request, reply, options.authService);
    if (!identity) return reply;

    const role = request.body?.role;
    if (role !== "admin" && role !== "member") {
      return reply.status(400).send({ error: "role must be admin or member" });
    }

    try {
      const membership = await options.communityAccessService.assignCommunityRole({
        actorUserId: identity.userId,
        targetUserId: request.params.userId,
        communityId: request.params.communityId,
        role
      });
      return reply.status(200).send({
        userId: membership.userId,
        communityId: membership.communityId,
        role: membership.role
      });
    } catch (error) {
      if (isCommunityAccessError(error)) return reply.status(403).send({ error: error.message });
      return reply.status(400).send({ error: errorMessage(error) });
    }
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "request failed";
}
