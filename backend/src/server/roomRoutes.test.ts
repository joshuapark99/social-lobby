import { describe, expect, test, vi } from "vitest";
import { buildServer } from "./server.js";
import { loadConfig } from "../config/config.js";
import type { AuthService } from "../auth/service.js";
import type { RoomService } from "../rooms/service.js";
import { registerRoomRoutes } from "../rooms/routes.js";

function authService(userId = "user-1", email = "person@example.com"): AuthService {
  return {
    loginUrl: vi.fn(),
    completeLogin: vi.fn(),
    session: vi.fn(async () => ({ userId, provider: "google", subject: "subject", email })),
    logout: vi.fn()
  };
}

function roomService(overrides: Partial<RoomService> = {}): RoomService {
  return {
    listDefaultCommunityRooms: vi.fn(async () => ({
      community: { slug: "default-community", name: "Default Community" },
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
    roomBySlug: vi.fn(async (roomSlug: string) =>
      roomSlug === "main-lobby"
        ? {
            community: { slug: "default-community", name: "Default Community" },
            room: {
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
          }
        : null
    ),
    ...overrides
  };
}

describe("room routes", () => {
  test("room route registration is owned by the rooms module", () => {
    expect(registerRoomRoutes).toEqual(expect.any(Function));
  });

  test("GET /communities/default/rooms returns room metadata for authenticated users", async () => {
    const rooms = roomService();
    const server = buildServer({ config: loadConfig({}), authService: authService(), roomService: rooms });

    const response = await server.inject({
      method: "GET",
      url: "api/communities/default/rooms",
      cookies: { sl_session: "session-token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      community: { slug: "default-community", name: "Default Community" },
      rooms: [
        expect.objectContaining({
          slug: "main-lobby",
          layoutVersion: 1
        })
      ]
    });
    expect(rooms.listDefaultCommunityRooms).toHaveBeenCalled();
  });

  test("GET /rooms/:roomSlug returns room detail for authenticated users", async () => {
    const rooms = roomService();
    const server = buildServer({ config: loadConfig({}), authService: authService(), roomService: rooms });

    const response = await server.inject({
      method: "GET",
      url: "api/rooms/main-lobby",
      cookies: { sl_session: "session-token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      community: { slug: "default-community", name: "Default Community" },
      room: expect.objectContaining({
        slug: "main-lobby",
        layoutVersion: 1
      })
    });
    expect(rooms.roomBySlug).toHaveBeenCalledWith("main-lobby");
  });

  test("GET /rooms/:roomSlug returns 404 when a room is missing", async () => {
    const rooms = roomService({
      roomBySlug: vi.fn(async () => null)
    });
    const server = buildServer({ config: loadConfig({}), authService: authService(), roomService: rooms });

    const response = await server.inject({
      method: "GET",
      url: "api/rooms/missing-room",
      cookies: { sl_session: "session-token" }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "room not found" });
  });
});
