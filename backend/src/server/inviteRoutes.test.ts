import { describe, expect, test, vi } from "vitest";
import { buildServer } from "./server.js";
import { loadConfig } from "../config/config.js";
import type { AuthService } from "../auth/service.js";
import type { InviteService } from "../invites/service.js";

function authService(userId = "user-1", email = "person@example.com"): AuthService {
  return {
    loginUrl: vi.fn(),
    completeLogin: vi.fn(),
    session: vi.fn(async () => ({ userId, provider: "google", subject: "subject", email })),
    logout: vi.fn()
  };
}

function inviteService(overrides: Partial<InviteService> = {}): InviteService {
  return {
    createInvite: vi.fn(async () => ({
      id: "invite-1",
      code: "invite-code",
      targetEmail: "friend@example.com",
      expiresAt: null,
      maxRedemptions: 1
    })),
    redeemInvite: vi.fn(async () => ({ status: "redeemed" as const, communityId: "community-1" })),
    revokeInvite: vi.fn(async () => ({ status: "revoked" as const })),
    ...overrides
  };
}

describe("invite routes", () => {
  test("POST /admin/invites creates an invite for an authenticated admin session", async () => {
    const invites = inviteService();
    const server = buildServer({ config: loadConfig({}), authService: authService("admin-1"), inviteService: invites });

    const response = await server.inject({
      method: "POST",
      url: "/admin/invites",
      cookies: { sl_session: "session-token", sl_csrf: "csrf-token" },
      headers: { "x-csrf-token": "csrf-token" },
      payload: { targetEmail: "Friend@Example.com", maxRedemptions: 1 }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      id: "invite-1",
      code: "invite-code",
      targetEmail: "friend@example.com",
      expiresAt: null,
      maxRedemptions: 1
    });
    expect(invites.createInvite).toHaveBeenCalledWith({
      createdByUserId: "admin-1",
      targetEmail: "Friend@Example.com",
      maxRedemptions: 1,
      expiresAt: null
    });
  });

  test("POST /invites/redeem redeems an invite for the authenticated user", async () => {
    const invites = inviteService();
    const server = buildServer({ config: loadConfig({}), authService: authService("user-1", "friend@example.com"), inviteService: invites });

    const response = await server.inject({
      method: "POST",
      url: "/invites/redeem",
      cookies: { sl_session: "session-token", sl_csrf: "csrf-token" },
      headers: { "x-csrf-token": "csrf-token" },
      payload: { code: "invite-code" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "redeemed", communityId: "community-1" });
    expect(invites.redeemInvite).toHaveBeenCalledWith({
      code: "invite-code",
      userId: "user-1",
      email: "friend@example.com"
    });
  });

  test("POST /admin/invites/:inviteId/revoke revokes an invite", async () => {
    const invites = inviteService();
    const server = buildServer({ config: loadConfig({}), authService: authService("admin-1"), inviteService: invites });

    const response = await server.inject({
      method: "POST",
      url: "/admin/invites/invite-1/revoke",
      cookies: { sl_session: "session-token", sl_csrf: "csrf-token" },
      headers: { "x-csrf-token": "csrf-token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "revoked" });
    expect(invites.revokeInvite).toHaveBeenCalledWith("invite-1");
  });

  test("POST /invites/redeem requires session and CSRF", async () => {
    const invites = inviteService();
    const server = buildServer({ config: loadConfig({}), authService: authService(), inviteService: invites });

    const noSession = await server.inject({
      method: "POST",
      url: "/invites/redeem",
      cookies: { sl_csrf: "csrf-token" },
      headers: { "x-csrf-token": "csrf-token" },
      payload: { code: "invite-code" }
    });
    const noCsrf = await server.inject({
      method: "POST",
      url: "/invites/redeem",
      cookies: { sl_session: "session-token", sl_csrf: "csrf-token" },
      payload: { code: "invite-code" }
    });

    expect(noSession.statusCode).toBe(401);
    expect(noCsrf.statusCode).toBe(403);
    expect(invites.redeemInvite).not.toHaveBeenCalled();
  });

  test("POST /invites/redeem returns clear invalid invite responses", async () => {
    const invites = inviteService({
      redeemInvite: vi.fn(async () => {
        throw new Error("invite expired");
      })
    });
    const server = buildServer({ config: loadConfig({}), authService: authService(), inviteService: invites });

    const response = await server.inject({
      method: "POST",
      url: "/invites/redeem",
      cookies: { sl_session: "session-token", sl_csrf: "csrf-token" },
      headers: { "x-csrf-token": "csrf-token" },
      payload: { code: "invite-code" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invite expired" });
  });
});
