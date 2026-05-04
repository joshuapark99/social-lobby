import { describe, expect, test, vi } from "vitest";
import type { AuthService } from "../auth/service.js";
import { CommunityAccessError, type CommunityAccessService, type CommunityMember } from "../communities/service.js";
import { loadConfig } from "../config/config.js";
import { buildServer } from "./server.js";

function authService(userId = "owner-1", email = "owner@example.com"): AuthService {
  return {
    loginUrl: vi.fn(),
    completeLogin: vi.fn(),
    updateProfile: vi.fn(),
    session: vi.fn(async () => ({ userId, provider: "google", subject: "subject", email })),
    logout: vi.fn()
  };
}

function communityAccessService(overrides: Partial<CommunityAccessService> = {}): CommunityAccessService {
  return {
    requireCommunityManagement: vi.fn(),
    requireDefaultCommunityManagement: vi.fn(),
    listCommunityMembers: vi.fn(async (): Promise<CommunityMember[]> => [
      {
        userId: "owner-1",
        displayName: "Owner",
        username: "owner",
        email: "owner@example.com",
        role: "owner",
        status: "active"
      },
      {
        userId: "member-1",
        displayName: "Member",
        username: "member",
        email: "member@example.com",
        role: "member",
        status: "active"
      }
    ]),
    assignCommunityRole: vi.fn(async ({ targetUserId, communityId, role }) => ({
      userId: targetUserId,
      communityId,
      role,
      status: "active"
    })),
    ...overrides
  };
}

describe("community routes", () => {
  test("community admins can list members", async () => {
    const access = communityAccessService();
    const server = buildServer({
      config: loadConfig({}),
      authService: authService("admin-1"),
      communityAccessService: access
    });

    const response = await server.inject({
      method: "GET",
      url: "api/communities/community-1/members",
      cookies: { sl_session: "session-token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      members: [
        {
          userId: "owner-1",
          displayName: "Owner",
          username: "owner",
          email: "owner@example.com",
          role: "owner",
          status: "active"
        },
        {
          userId: "member-1",
          displayName: "Member",
          username: "member",
          email: "member@example.com",
          role: "member",
          status: "active"
        }
      ]
    });
    expect(access.listCommunityMembers).toHaveBeenCalledWith({ actorUserId: "admin-1", communityId: "community-1" });
  });

  test("owners can assign community admins", async () => {
    const access = communityAccessService();
    const server = buildServer({
      config: loadConfig({}),
      authService: authService("owner-1"),
      communityAccessService: access
    });

    const response = await server.inject({
      method: "PUT",
      url: "api/communities/community-1/members/member-1/role",
      cookies: { sl_session: "session-token", sl_csrf: "csrf-token" },
      headers: { "x-csrf-token": "csrf-token" },
      payload: { role: "admin" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ userId: "member-1", communityId: "community-1", role: "admin" });
    expect(access.assignCommunityRole).toHaveBeenCalledWith({
      actorUserId: "owner-1",
      targetUserId: "member-1",
      communityId: "community-1",
      role: "admin"
    });
  });

  test("rejects non-owner role assignment", async () => {
    const access = communityAccessService({
      assignCommunityRole: vi.fn(async () => {
        throw new CommunityAccessError("community owner role required");
      })
    });
    const server = buildServer({
      config: loadConfig({}),
      authService: authService("admin-1"),
      communityAccessService: access
    });

    const response = await server.inject({
      method: "PUT",
      url: "api/communities/community-1/members/member-1/role",
      cookies: { sl_session: "session-token", sl_csrf: "csrf-token" },
      headers: { "x-csrf-token": "csrf-token" },
      payload: { role: "admin" }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "community owner role required" });
  });

  test("does not allow owner assignment through the admin-management endpoint", async () => {
    const access = communityAccessService();
    const server = buildServer({
      config: loadConfig({}),
      authService: authService("owner-1"),
      communityAccessService: access
    });

    const response = await server.inject({
      method: "PUT",
      url: "api/communities/community-1/members/member-1/role",
      cookies: { sl_session: "session-token", sl_csrf: "csrf-token" },
      headers: { "x-csrf-token": "csrf-token" },
      payload: { role: "owner" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "role must be admin or member" });
    expect(access.assignCommunityRole).not.toHaveBeenCalled();
  });
});
