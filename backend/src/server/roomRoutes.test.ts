import { describe, expect, test, vi } from "vitest";
import { buildServer } from "./server.js";
import { loadConfig } from "../config/config.js";
import type { AuthService } from "../auth/service.js";
import { RoomAccessError, type RoomService } from "../rooms/service.js";
import { registerRoomRoutes } from "../rooms/routes.js";
import { ChatAccessError, type ChatService, type RoomChatMessage } from "../chat/service.js";

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
    listDefaultCommunityRooms: vi.fn(async (_userId: string) => ({
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
    roomBySlug: vi.fn(async (roomSlug: string, _userId: string) =>
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

function chatService(overrides: Partial<ChatService> = {}): ChatService {
  const messages: RoomChatMessage[] = [
    {
      id: "message-1",
      roomSlug: "main-lobby",
      userId: "user-1",
      userName: "Person Example",
      body: "Hello room",
      createdAt: "2026-04-29T10:00:00.000Z"
    },
    {
      id: "message-2",
      roomSlug: "main-lobby",
      userId: "user-2",
      userName: "Other Person",
      body: "Welcome back",
      createdAt: "2026-04-29T10:05:00.000Z"
    }
  ];

  return {
    listRecentMessages: vi.fn(async () => messages),
    createMessage: vi.fn(),
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
    expect(rooms.listDefaultCommunityRooms).toHaveBeenCalledWith("user-1");
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
    expect(rooms.roomBySlug).toHaveBeenCalledWith("main-lobby", "user-1");
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

  test("GET /rooms/:roomSlug/messages returns recent room chat for authenticated members", async () => {
    const chat = chatService();
    const server = buildServer({
      config: loadConfig({}),
      authService: authService(),
      roomService: roomService(),
      chatService: chat
    });

    const response = await server.inject({
      method: "GET",
      url: "api/rooms/main-lobby/messages",
      cookies: { sl_session: "session-token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      messages: [
        expect.objectContaining({
          id: "message-1",
          body: "Hello room"
        }),
        expect.objectContaining({
          id: "message-2",
          body: "Welcome back"
        })
      ]
    });
    expect(chat.listRecentMessages).toHaveBeenCalledWith({
      roomSlug: "main-lobby",
      userId: "user-1"
    });
  });

  test("GET /rooms/:roomSlug/messages returns 403 when the user cannot access the room chat", async () => {
    const chat = chatService({
      listRecentMessages: vi.fn(async () => {
        throw new ChatAccessError();
      })
    });
    const server = buildServer({
      config: loadConfig({}),
      authService: authService(),
      roomService: roomService(),
      chatService: chat
    });

    const response = await server.inject({
      method: "GET",
      url: "api/rooms/main-lobby/messages",
      cookies: { sl_session: "session-token" }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "room access denied" });
  });

  test("GET /communities/default/rooms returns 403 when membership is missing", async () => {
    const rooms = roomService({
      listDefaultCommunityRooms: vi.fn(async () => {
        throw new RoomAccessError();
      })
    });
    const server = buildServer({ config: loadConfig({}), authService: authService(), roomService: rooms });

    const response = await server.inject({
      method: "GET",
      url: "api/communities/default/rooms",
      cookies: { sl_session: "session-token" }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "room access denied" });
  });

  test("GET /rooms/:roomSlug returns 403 when membership is missing", async () => {
    const rooms = roomService({
      roomBySlug: vi.fn(async () => {
        throw new RoomAccessError();
      })
    });
    const server = buildServer({ config: loadConfig({}), authService: authService(), roomService: rooms });

    const response = await server.inject({
      method: "GET",
      url: "api/rooms/main-lobby",
      cookies: { sl_session: "session-token" }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "room access denied" });
  });
});
