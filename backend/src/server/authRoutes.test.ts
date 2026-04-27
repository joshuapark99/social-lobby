import { describe, expect, test, vi } from "vitest";
import { buildServer } from "./server.js";
import { loadConfig } from "../config/config.js";
import type { AuthService, OidcIdentity } from "../auth/service.js";

function fakeAuthService(overrides: Partial<AuthService> = {}): AuthService {
  return {
    loginUrl: vi.fn(async () => ({
      redirectUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=state-token",
      state: "state-token"
    })),
    completeLogin: vi.fn(async () => ({
      identity: { provider: "google", subject: "subject", email: "person@example.com" },
      sessionToken: "session-token",
      csrfToken: "csrf-token"
    })),
    session: vi.fn(async (): Promise<OidcIdentity | null> => null),
    logout: vi.fn(async () => undefined),
    ...overrides
  };
}

describe("auth routes", () => {
  test("GET /auth/login redirects to provider and stores OIDC state", async () => {
    const auth = fakeAuthService();
    const server = buildServer({ config: loadConfig({}), authService: auth });

    const response = await server.inject({ method: "GET", url: "/auth/login" });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("https://accounts.google.com/o/oauth2/v2/auth?state=state-token");
    expect(response.cookies).toContainEqual(
      expect.objectContaining({
        name: "sl_oidc_state",
        value: "state-token",
        httpOnly: true,
        sameSite: "Lax"
      })
    );
  });

  test("default auth service can start OIDC login without a database connection", async () => {
    const server = buildServer({
      config: loadConfig({
        OIDC_CLIENT_ID: "client-id",
        OIDC_REDIRECT_URL: "http://localhost:8081/auth/callback"
      })
    });

    const response = await server.inject({ method: "GET", url: "/auth/login" });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain("https://accounts.google.com/o/oauth2/v2/auth?");
    expect(response.headers.location).toContain("client_id=client-id");
    expect(response.cookies).toContainEqual(expect.objectContaining({ name: "sl_oidc_state", httpOnly: true }));
  });

  test("default auth callback remains unavailable without a session store", async () => {
    const server = buildServer({ config: loadConfig({}) });

    const response = await server.inject({
      method: "GET",
      url: "/auth/callback?code=code&state=state-token",
      cookies: { sl_oidc_state: "state-token" }
    });

    expect(response.statusCode).toBe(401);
  });

  test("GET /auth/callback validates state and sets session plus CSRF cookies", async () => {
    const auth = fakeAuthService();
    const server = buildServer({
      config: loadConfig({ SESSION_COOKIE_SECURE: "true" }),
      authService: auth
    });

    const response = await server.inject({
      method: "GET",
      url: "/auth/callback?code=code&state=state-token",
      cookies: { sl_oidc_state: "state-token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ email: "person@example.com" });
    expect(response.cookies).toContainEqual(
      expect.objectContaining({
        name: "sl_session",
        value: "session-token",
        httpOnly: true,
        secure: true,
        sameSite: "Lax"
      })
    );
    const csrfCookie = response.cookies.find((cookie) => cookie.name === "sl_csrf");
    expect(csrfCookie).toEqual(
      expect.objectContaining({
        name: "sl_csrf",
        value: "csrf-token",
        secure: true,
        sameSite: "Lax"
      })
    );
    expect(csrfCookie?.httpOnly).not.toBe(true);
  });

  test("GET /auth/session returns the current identity from the session cookie", async () => {
    const auth = fakeAuthService({
      session: vi.fn(async () => ({ provider: "google", subject: "subject", email: "person@example.com" }))
    });
    const server = buildServer({ config: loadConfig({}), authService: auth });

    const response = await server.inject({
      method: "GET",
      url: "/auth/session",
      cookies: { sl_session: "session-token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ email: "person@example.com" });
    expect(auth.session).toHaveBeenCalledWith("session-token");
  });

  test("POST /auth/logout requires CSRF and clears session cookies", async () => {
    const auth = fakeAuthService();
    const server = buildServer({ config: loadConfig({}), authService: auth });

    const response = await server.inject({
      method: "POST",
      url: "/auth/logout",
      cookies: { sl_session: "session-token", sl_csrf: "csrf-token" },
      headers: { "x-csrf-token": "csrf-token" }
    });

    expect(response.statusCode).toBe(204);
    expect(auth.logout).toHaveBeenCalledWith("session-token");
    expect(response.cookies).toContainEqual(expect.objectContaining({ name: "sl_session", value: "" }));
    expect(response.cookies).toContainEqual(expect.objectContaining({ name: "sl_csrf", value: "" }));
  });

  test("POST /auth/logout rejects CSRF mismatch", async () => {
    const auth = fakeAuthService();
    const server = buildServer({ config: loadConfig({}), authService: auth });

    const response = await server.inject({
      method: "POST",
      url: "/auth/logout",
      cookies: { sl_session: "session-token", sl_csrf: "csrf-token" },
      headers: { "x-csrf-token": "wrong-token" }
    });

    expect(response.statusCode).toBe(403);
    expect(auth.logout).not.toHaveBeenCalled();
  });
});
