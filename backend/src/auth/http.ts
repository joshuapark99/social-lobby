import type { FastifyReply, FastifyRequest } from "fastify";
import { sessionCookieName } from "./cookies.js";
import type { AuthService, OidcIdentity } from "./service.js";

export async function requireIdentity(
  request: FastifyRequest,
  reply: FastifyReply,
  authService: AuthService
): Promise<(OidcIdentity & { userId: string }) | null> {
  const sessionToken = request.cookies[sessionCookieName];
  if (!sessionToken) {
    reply.status(401).send("session required");
    return null;
  }
  const identity = await authService.session(sessionToken);
  if (!identity?.userId) {
    reply.status(401).send("session required");
    return null;
  }
  return { ...identity, userId: identity.userId };
}
