import type { FastifyInstance } from "fastify";
import { csrfMatches } from "../auth/cookies.js";
import { requireIdentity } from "../auth/http.js";
import type { AuthService } from "../auth/service.js";
import type { CommunityAccessService, CommunityRole } from "./service.js";
import { isCommunityAccessError } from "./service.js";

export function registerCommunityRoutes(
  server: FastifyInstance,
  options: { authService: AuthService; communityAccessService: CommunityAccessService }
): void {
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
