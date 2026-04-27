import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

export const sessionCookieName = "sl_session";
export const csrfCookieName = "sl_csrf";
export const csrfHeaderName = "x-csrf-token";
export const oidcStateCookieName = "sl_oidc_state";

const sameSite = "lax";

export function setOidcStateCookie(reply: FastifyReply, state: string, secure: boolean): void {
  reply.setCookie(oidcStateCookieName, state, {
    path: "/",
    httpOnly: true,
    secure,
    sameSite
  });
}

export function setSessionCookie(reply: FastifyReply, token: string, secure: boolean): void {
  reply.setCookie(sessionCookieName, token, {
    path: "/",
    httpOnly: true,
    secure,
    sameSite
  });
}

export function clearSessionCookie(reply: FastifyReply, secure: boolean): void {
  reply.setCookie(sessionCookieName, "", {
    path: "/",
    httpOnly: true,
    secure,
    sameSite,
    maxAge: -1
  });
}

export function setCsrfCookie(reply: FastifyReply, token: string, secure: boolean): void {
  reply.setCookie(csrfCookieName, token, {
    path: "/",
    httpOnly: false,
    secure,
    sameSite
  });
}

export function clearCsrfCookie(reply: FastifyReply, secure: boolean): void {
  reply.setCookie(csrfCookieName, "", {
    path: "/",
    httpOnly: false,
    secure,
    sameSite,
    maxAge: -1
  });
}

export function csrfMatches(request: FastifyRequest): boolean {
  const cookie = request.cookies[csrfCookieName];
  const header = request.headers[csrfHeaderName];
  if (typeof cookie !== "string" || cookie.length === 0 || typeof header !== "string") {
    return false;
  }
  const cookieBytes = Buffer.from(cookie);
  const headerBytes = Buffer.from(header);
  return cookieBytes.length === headerBytes.length && timingSafeEqual(cookieBytes, headerBytes);
}
