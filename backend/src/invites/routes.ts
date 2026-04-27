import type { FastifyInstance } from "fastify";
import { csrfMatches } from "../auth/cookies.js";
import { requireIdentity } from "../auth/http.js";
import type { AuthService } from "../auth/service.js";
import type { InviteService } from "./service.js";

export function registerInviteRoutes(
  server: FastifyInstance,
  options: { authService: AuthService; inviteService: InviteService }
): void {
  server.post<{
    Body: {
      targetEmail?: string | null;
      maxRedemptions?: number | null;
      expiresAt?: string | null;
    };
  }>("/admin/invites", async (request, reply) => {
    if (!csrfMatches(request)) return reply.status(403).send("csrf token mismatch");
    const identity = await requireIdentity(request, reply, options.authService);
    if (!identity) return reply;

    try {
      const invite = await options.inviteService.createInvite({
        createdByUserId: identity.userId,
        targetEmail: request.body?.targetEmail ?? null,
        maxRedemptions: request.body?.maxRedemptions ?? 1,
        expiresAt: request.body?.expiresAt ? new Date(request.body.expiresAt) : null
      });
      return reply.status(201).send(invite);
    } catch (error) {
      return reply.status(400).send({ error: errorMessage(error) });
    }
  });

  server.post<{ Params: { inviteId: string } }>("/admin/invites/:inviteId/revoke", async (request, reply) => {
    if (!csrfMatches(request)) return reply.status(403).send("csrf token mismatch");
    const identity = await requireIdentity(request, reply, options.authService);
    if (!identity) return reply;

    try {
      return reply.status(200).send(await options.inviteService.revokeInvite(request.params.inviteId));
    } catch (error) {
      return reply.status(400).send({ error: errorMessage(error) });
    }
  });

  server.post<{ Body: { code?: string } }>("/invites/redeem", async (request, reply) => {
    if (!csrfMatches(request)) return reply.status(403).send("csrf token mismatch");
    const identity = await requireIdentity(request, reply, options.authService);
    if (!identity) return reply;

    try {
      const result = await options.inviteService.redeemInvite({
        code: request.body?.code ?? "",
        userId: identity.userId,
        email: identity.email
      });
      return reply.status(200).send(result);
    } catch (error) {
      return reply.status(400).send({ error: errorMessage(error) });
    }
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "request failed";
}
