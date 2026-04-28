import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import WebSocket from "ws";
import { buildServer } from "../server/server.js";
import { loadConfig } from "../config/config.js";
import type { AuthService } from "../auth/service.js";
import type { RoomService } from "../rooms/service.js";

function authService(userId = "user-1", email = "person@example.com"): AuthService {
  return {
    loginUrl: vi.fn(),
    completeLogin: vi.fn(),
    session: vi.fn(async (token: string) => {
      if (token === "session-token") {
        return { userId, provider: "google", subject: "subject", email };
      }
      if (token === "session-token-2") {
        return { userId: "user-2", provider: "google", subject: "subject-2", email: "other@example.com" };
      }
      return null;
    }),
    logout: vi.fn()
  };
}

function roomService(): RoomService {
  return {
    listDefaultCommunityRooms: vi.fn(),
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
    )
  };
}

describe("realtime room routes", () => {
  let server: ReturnType<typeof buildServer>;
  let sockets: WebSocket[];

  beforeEach(async () => {
    sockets = [];
    server = buildServer({ config: loadConfig({}), authService: authService(), roomService: roomService() });
    await server.ready();
  });

  afterEach(async () => {
    sockets.forEach((socket) => socket.terminate());
    await server.close();
  });

  test("rejects missing session cookies", async () => {
    await expect(server.injectWS("/rooms/main-lobby/ws")).rejects.toThrow();
  });

  test("sends a room snapshot after a valid room.join", async () => {
    const socket = rememberSocket(await server.injectWS("/rooms/main-lobby/ws", {
      headers: { cookie: "sl_session=session-token" }
    }));

    const snapshotPromise = onceMessage(socket);
    socket.send(
      JSON.stringify({
        version: 1,
        type: "room.join",
        requestId: "req-1",
        payload: { roomSlug: "main-lobby" }
      })
    );

    const message = await snapshotPromise;
    const event = JSON.parse(message.toString()) as { type: string; payload?: { occupants?: unknown[] } };

    expect(event.type).toBe("room.snapshot");
    expect(event.payload?.occupants).toHaveLength(1);

  });

  test("fans out presence.joined to existing room occupants", async () => {
    const first = rememberSocket(await server.injectWS("/rooms/main-lobby/ws", {
      headers: { cookie: "sl_session=session-token" }
    }));
    const firstSnapshotPromise = onceMessage(first);
    first.send(JSON.stringify({ version: 1, type: "room.join", payload: { roomSlug: "main-lobby" } }));
    await firstSnapshotPromise;

    const second = rememberSocket(await server.injectWS("/rooms/main-lobby/ws", {
      headers: { cookie: "sl_session=session-token-2" }
    }));
    const secondSnapshotPromise = onceMessage(second);
    const joinedPromise = onceMessage(first);
    second.send(JSON.stringify({ version: 1, type: "room.join", payload: { roomSlug: "main-lobby" } }));
    await secondSnapshotPromise;

    const message = await joinedPromise;
    const event = JSON.parse(message.toString()) as { type: string; payload?: { occupant?: { userId: string } } };

    expect(event.type).toBe("presence.joined");
    expect(event.payload?.occupant?.userId).toBe("user-2");
  });

  test("fans out presence.left when an occupant disconnects", async () => {
    const first = rememberSocket(await server.injectWS("/rooms/main-lobby/ws", {
      headers: { cookie: "sl_session=session-token" }
    }));
    const firstSnapshotPromise = onceMessage(first);
    first.send(JSON.stringify({ version: 1, type: "room.join", payload: { roomSlug: "main-lobby" } }));
    await firstSnapshotPromise;

    const second = rememberSocket(await server.injectWS("/rooms/main-lobby/ws", {
      headers: { cookie: "sl_session=session-token-2" }
    }));
    const secondSnapshotPromise = onceMessage(second);
    const joinedPromise = onceMessage(first);
    second.send(JSON.stringify({ version: 1, type: "room.join", payload: { roomSlug: "main-lobby" } }));
    await secondSnapshotPromise;
    await joinedPromise;

    const leftPromise = onceMessage(first);
    second.terminate();

    const message = await leftPromise;
    const event = JSON.parse(message.toString()) as { type: string; payload?: { userId?: string } };

    expect(event.type).toBe("presence.left");
    expect(event.payload?.userId).toBe("user-2");
  });

  test("returns an error event for invalid envelope versions", async () => {
    const socket = rememberSocket(await server.injectWS("/rooms/main-lobby/ws", {
      headers: { cookie: "sl_session=session-token" }
    }));

    socket.send(JSON.stringify({ version: 2, type: "room.join", payload: { roomSlug: "main-lobby" } }));

    const message = await onceMessage(socket);
    const event = JSON.parse(message.toString()) as { type: string; payload?: { code?: string } };

    expect(event.type).toBe("error");
    expect(event.payload?.code).toBe("invalid_event");
  });

  function rememberSocket(socket: WebSocket): WebSocket {
    sockets.push(socket);
    return socket;
  }
});

function onceMessage(socket: WebSocket): Promise<WebSocket.RawData> {
  return new Promise((resolve, reject) => {
    socket.once("message", (data) => resolve(data));
    socket.once("error", reject);
  });
}
