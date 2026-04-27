import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import type { Config } from "../config/config.js";
import { OidcProvider } from "../auth/oidc.js";
import type { AuthService } from "../auth/service.js";
import { newSessionToken } from "../auth/session.js";
import {
  clearCsrfCookie,
  clearSessionCookie,
  csrfCookieName,
  csrfMatches,
  oidcStateCookieName,
  sessionCookieName,
  setCsrfCookie,
  setOidcStateCookie,
  setSessionCookie
} from "../auth/cookies.js";

export function buildServer(options: { config: Config; authService?: AuthService }): FastifyInstance {
  const server = Fastify();
  const authService = options.authService ?? defaultAuthService(options.config);

  void server.register(cookie);

  server.get("/healthz", async () => ({ status: "ok" }));
  server.route({
    method: ["POST", "PUT", "PATCH", "DELETE"],
    url: "/healthz",
    handler: async (_request, reply) => reply.status(405).send({ error: "method not allowed" })
  });

  server.get("/auth/login", async (_request, reply) => {
    try {
      const { redirectUrl, state } = await authService.loginUrl();
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
      const result = await authService.completeLogin(request.query.code ?? "", request.query.state ?? "");
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
    const identity = await authService.session(sessionToken);
    if (!identity) return reply.status(401).send("session required");
    return reply.status(200).send({ email: identity.email });
  });

  server.post("/auth/logout", async (request, reply) => {
    if (!csrfMatches(request)) return reply.status(403).send("csrf token mismatch");
    const sessionToken = request.cookies[sessionCookieName];
    if (sessionToken) await authService.logout(sessionToken);
    clearSessionCookie(reply, options.config.sessionCookieSecure);
    clearCsrfCookie(reply, options.config.sessionCookieSecure);
    return reply.status(204).send();
  });

  return server;
}

function defaultAuthService(config: Config): AuthService {
  const provider = buildOidcProvider(config);
  return {
    async loginUrl() {
      const state = newSessionToken();
      return { redirectUrl: provider.authorizationUrl(state), state };
    },
    async completeLogin() {
      throw new Error("auth session store is not configured");
    },
    async session() {
      return null;
    },
    async logout() {
      return undefined;
    }
  };
}

export function buildOidcProvider(config: Config): OidcProvider {
  return new OidcProvider(config.oidc);
}
