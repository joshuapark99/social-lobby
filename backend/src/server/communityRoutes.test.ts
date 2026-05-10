import { describe, expect, test, vi } from "vitest";
import type { AuthService } from "../auth/service.js";
import {
  CommunityAccessError,
  CommunitySlugConflictError,
  type CommunityAccessService,
  type CommunityMember
} from "../communities/service.js";
import { loadConfig } from "../config/config.js";
import type { RoomService } from "../rooms/service.js";
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
    createCommunity: vi.fn(async ({ name }) => ({ id: "community-2", slug: "friday-game-night", name, viewerRole: "owner" as const })),
    requireCommunityManagement: vi.fn(),
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

function roomService(overrides: Partial<RoomService> = {}): RoomService {
  return {
    listDefaultCommunityRooms: vi.fn(),
    listUserCommunities: vi.fn(),
    listCommunityRooms: vi.fn(),
    listCommunityRoomsById: vi.fn(async () => ({
      community: { id: "community-2", slug: "friday-game-night", name: "Friday Game Night", viewerRole: "owner" as const },
      rooms: [
        {
          slug: "main-lobby",
          name: "Main Lobby",
          kind: "permanent",
          isDefault: true,
          layoutVersion: 1,
          layout: {
            theme: "cozy-lobby",
            backgroundAsset: "rooms/main-lobby.png",
            avatarStyleSet: "soft-rounded",
            objectPack: "lobby-furniture-v1",
            width: 2400,
            height: 1600,
            spawnPoints: [{ x: 320, y: 420 }],
            collision: [],
            teleports: [{ label: "Rooftop", targetRoom: "rooftop" }]
          }
        }
      ]
    })),
    roomBySlug: vi.fn(),
    roomByCommunitySlug: vi.fn(),
    roomByCommunityId: vi.fn(),
    ...overrides
  };
}

describe("community routes", () => {
  test("creates a community for the authenticated owner", async () => {
    const access = communityAccessService();
    const rooms = roomService();
    const server = buildServer({
      config: loadConfig({}),
      authService: authService("owner-1"),
      communityAccessService: access,
      roomService: rooms
    });

    const response = await server.inject({
      method: "POST",
      url: "api/communities",
      cookies: { sl_session: "session-token", sl_csrf: "csrf-token" },
      headers: { "x-csrf-token": "csrf-token" },
      payload: { name: "Friday Game Night" }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      community: { id: "community-2", slug: "friday-game-night", name: "Friday Game Night", viewerRole: "owner" },
      rooms: [{ slug: "main-lobby", isDefault: true }]
    });
    expect(access.createCommunity).toHaveBeenCalledWith({ actorUserId: "owner-1", name: "Friday Game Night" });
    expect(rooms.listCommunityRoomsById).toHaveBeenCalledWith("community-2", "owner-1");
  });

  test("returns a clear conflict when a generated community slug already exists", async () => {
    const server = buildServer({
      config: loadConfig({}),
      authService: authService("owner-1"),
      communityAccessService: communityAccessService({
        createCommunity: vi.fn(async () => {
          throw new CommunitySlugConflictError();
        })
      }),
      roomService: roomService()
    });

    const response = await server.inject({
      method: "POST",
      url: "api/communities",
      cookies: { sl_session: "session-token", sl_csrf: "csrf-token" },
      headers: { "x-csrf-token": "csrf-token" },
      payload: { name: "Default Community" }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "community slug is already taken" });
  });

  test("community members can list members", async () => {
    const access = communityAccessService();
    const server = buildServer({
      config: loadConfig({}),
      authService: authService("member-1"),
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
    expect(access.listCommunityMembers).toHaveBeenCalledWith({ actorUserId: "member-1", communityId: "community-1" });
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
