import { describe, expect, test, vi } from "vitest";
import { buildServer } from "./server.js";
import { loadConfig } from "../config/config.js";
import type { AuthService } from "../auth/service.js";
import { CommunityAccessError, type CommunityAccessService } from "../communities/service.js";
import type { InviteService } from "../invites/service.js";
import { registerInviteRoutes } from "../invites/routes.js";

function authService(userId = "user-1", email = "person@example.com"): AuthService {
  return {
    loginUrl: vi.fn(),
    completeLogin: vi.fn(),
    updateProfile: vi.fn(),
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
    listInvites: vi.fn(async () => ({
      invites: [
        {
          id: "invite-1",
          communityId: "community-1",
          createdByUserId: "admin-1",
          targetEmail: "friend@example.com",
          maxRedemptions: 1,
          redemptionCount: 0,
          expiresAt: null,
          revokedAt: null,
          createdAt: new Date("2026-05-09T00:00:00Z"),
          status: "active" as const
        }
      ]
    })),
    redeemInvite: vi.fn(async () => ({ status: "redeemed" as const, communityId: "community-1" })),
    revokeInvite: vi.fn(async () => ({ status: "revoked" as const })),
    ...overrides
  };
}

function communityAccessService(overrides: Partial<CommunityAccessService> = {}): CommunityAccessService {
  return {
    createCommunity: vi.fn(),
    requireCommunityManagement: vi.fn(),
    listCommunityMembers: vi.fn(async () => []),
    assignCommunityRole: vi.fn(),
    ...overrides
  };
}

describe("invite routes", () => {
  test("invite route registration is owned by the invites module", () => {
    expect(registerInviteRoutes).toEqual(expect.any(Function));
  });

  test("legacy default-community admin invite routes are not registered", async () => {
    const invites = inviteService();
    const server = buildServer({
      config: loadConfig({}),
      authService: authService("admin-1"),
      inviteService: invites,
      communityAccessService: communityAccessService()
    });

    const createResponse = await server.inject({
      method: "POST",
      url: "api/admin/invites",
      cookies: { sl_session: "session-token", sl_csrf: "csrf-token" },
      headers: { "x-csrf-token": "csrf-token" },
      payload: { targetEmail: "Friend@Example.com" }
    });
    const revokeResponse = await server.inject({
      method: "POST",
      url: "api/admin/invites/invite-1/revoke",
      cookies: { sl_session: "session-token", sl_csrf: "csrf-token" },
      headers: { "x-csrf-token": "csrf-token" }
    });

    expect(createResponse.statusCode).toBe(404);
    expect(revokeResponse.statusCode).toBe(404);
    expect(invites.createInvite).not.toHaveBeenCalled();
    expect(invites.revokeInvite).not.toHaveBeenCalled();
  });

  test("GET /communities/:communityId/invites lists invites for community managers", async () => {
    const invites = inviteService();
    const access = communityAccessService();
    const server = buildServer({
      config: loadConfig({}),
      authService: authService("admin-1"),
      inviteService: invites,
      communityAccessService: access
    });

    const response = await server.inject({
      method: "GET",
      url: "api/communities/community-1/invites",
      cookies: { sl_session: "session-token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      invites: [
        {
          id: "invite-1",
          communityId: "community-1",
          createdByUserId: "admin-1",
          targetEmail: "friend@example.com",
          maxRedemptions: 1,
          redemptionCount: 0,
          expiresAt: null,
          revokedAt: null,
          createdAt: "2026-05-09T00:00:00.000Z",
          status: "active"
        }
      ]
    });
    expect(access.requireCommunityManagement).toHaveBeenCalledWith({ actorUserId: "admin-1", communityId: "community-1" });
    expect(invites.listInvites).toHaveBeenCalledWith({ communityId: "community-1" });
  });

  test("POST /communities/:communityId/invites creates a scoped invite", async () => {
    const invites = inviteService();
    const access = communityAccessService();
    const server = buildServer({
      config: loadConfig({}),
      authService: authService("admin-1"),
      inviteService: invites,
      communityAccessService: access
    });

    const response = await server.inject({
      method: "POST",
      url: "api/communities/community-1/invites",
      cookies: { sl_session: "session-token", sl_csrf: "csrf-token" },
      headers: { "x-csrf-token": "csrf-token" },
      payload: { targetEmail: "Friend@Example.com", maxRedemptions: 1 }
    });

    expect(response.statusCode).toBe(201);
    expect(access.requireCommunityManagement).toHaveBeenCalledWith({ actorUserId: "admin-1", communityId: "community-1" });
    expect(invites.createInvite).toHaveBeenCalledWith({
      createdByUserId: "admin-1",
      communityId: "community-1",
      targetEmail: "Friend@Example.com",
      maxRedemptions: 1,
      expiresAt: null
    });
  });

  test("POST /communities/:communityId/invites requires a community admin role", async () => {
    const invites = inviteService();
    const server = buildServer({
      config: loadConfig({}),
      authService: authService("member-1"),
      inviteService: invites,
      communityAccessService: communityAccessService({
        requireCommunityManagement: vi.fn(async () => {
          throw new CommunityAccessError("community admin role required");
        })
      })
    });

    const response = await server.inject({
      method: "POST",
      url: "api/communities/community-1/invites",
      cookies: { sl_session: "session-token", sl_csrf: "csrf-token" },
      headers: { "x-csrf-token": "csrf-token" },
      payload: { targetEmail: "Friend@Example.com", maxRedemptions: 1 }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "community admin role required" });
    expect(invites.createInvite).not.toHaveBeenCalled();
  });

  test("POST /invites/redeem redeems an invite for the authenticated user", async () => {
    const invites = inviteService();
    const server = buildServer({ config: loadConfig({}), authService: authService("user-1", "friend@example.com"), inviteService: invites });

    const response = await server.inject({
      method: "POST",
      url: "api/invites/redeem",
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

  test("POST /communities/:communityId/invites/:inviteId/revoke revokes a scoped invite", async () => {
    const invites = inviteService();
    const access = communityAccessService();
    const server = buildServer({
      config: loadConfig({}),
      authService: authService("admin-1"),
      inviteService: invites,
      communityAccessService: access
    });

    const response = await server.inject({
      method: "POST",
      url: "api/communities/community-1/invites/invite-1/revoke",
      cookies: { sl_session: "session-token", sl_csrf: "csrf-token" },
      headers: { "x-csrf-token": "csrf-token" }
    });

    expect(response.statusCode).toBe(200);
    expect(access.requireCommunityManagement).toHaveBeenCalledWith({ actorUserId: "admin-1", communityId: "community-1" });
    expect(invites.revokeInvite).toHaveBeenCalledWith({ inviteId: "invite-1", communityId: "community-1" });
  });

  test("POST /invites/redeem requires session and CSRF", async () => {
    const invites = inviteService();
    const server = buildServer({ config: loadConfig({}), authService: authService(), inviteService: invites });

    const noSession = await server.inject({
      method: "POST",
      url: "api/invites/redeem",
      cookies: { sl_csrf: "csrf-token" },
      headers: { "x-csrf-token": "csrf-token" },
      payload: { code: "invite-code" }
    });
    const noCsrf = await server.inject({
      method: "POST",
      url: "api/invites/redeem",
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
      url: "api/invites/redeem",
      cookies: { sl_session: "session-token", sl_csrf: "csrf-token" },
      headers: { "x-csrf-token": "csrf-token" },
      payload: { code: "invite-code" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invite expired" });
  });
});
