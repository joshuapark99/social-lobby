import type { FastifyInstance } from "fastify";
import type { Config } from "../config/config.js";
import {
  clearCsrfCookie,
  clearSessionCookie,
  csrfMatches,
  oidcStateCookieName,
  sessionCookieName,
  setCsrfCookie,
  setOidcStateCookie,
  setSessionCookie
} from "./cookies.js";
import type { AuthService } from "./service.js";

export function registerAuthRoutes(server: FastifyInstance, options: { config: Config; authService: AuthService }): void {
  server.get("/auth/login", async (_request, reply) => {
    try {
      const { redirectUrl, state } = await options.authService.loginUrl();
      setOidcStateCookie(reply, state, options.config.sessionCookieSecure);
      return reply.redirect(redirectUrl);
    } catch {
      return reply.status(503).send("auth unavailable");
    }
  });

  server.get<{ Querystring: { code?: string; state?: string } }>("/auth/callback", async (request, reply) => {
    const stateCookie = request.cookies[oidcStateCookieName];
    if (!stateCookie || stateCookie !== request.query.state) {
      return reply.status(401).send("invalid auth state");
    }

    try {
      const result = await options.authService.completeLogin(request.query.code ?? "", request.query.state ?? "");
      setSessionCookie(reply, result.sessionToken, options.config.sessionCookieSecure);
      setCsrfCookie(reply, result.csrfToken, options.config.sessionCookieSecure);
      return reply.status(200).send({ email: result.identity.email });
    } catch {
      return reply.status(401).send("invalid identity");
    }
  });

  server.get("/auth/session", async (request, reply) => {
    const sessionToken = request.cookies[sessionCookieName];
    if (!sessionToken) return reply.status(401).send("session required");
    const identity = await options.authService.session(sessionToken);
    if (!identity) return reply.status(401).send("session required");
    return reply.status(200).send({ email: identity.email });
  });

  server.post("/auth/logout", async (request, reply) => {
    if (!csrfMatches(request)) return reply.status(403).send("csrf token mismatch");
    const sessionToken = request.cookies[sessionCookieName];
    if (sessionToken) await options.authService.logout(sessionToken);
    clearSessionCookie(reply, options.config.sessionCookieSecure);
    clearCsrfCookie(reply, options.config.sessionCookieSecure);
    return reply.status(204).send();
  });
}
