import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import WebSocket from "ws";
import { buildServer } from "../server/server.js";
import { loadConfig } from "../config/config.js";
import type { AuthService } from "../auth/service.js";
import { ChatAccessError, type ChatService } from "../chat/service.js";
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

function chatService(overrides: Partial<ChatService> = {}): ChatService {
  return {
    listRecentMessages: vi.fn(),
    createMessage: vi.fn(async ({ roomSlug, userId, body }) => ({
      id: "message-1",
      roomSlug,
      userId,
      userName: userId === "user-1" ? "Person Example" : "Other Person",
      body,
      createdAt: "2026-04-29T10:10:00.000Z"
    })),
    ...overrides
  };
}

describe("realtime room routes", () => {
  let server: ReturnType<typeof buildServer>;
  let sockets: WebSocket[];
  let chat: ChatService;

  beforeEach(async () => {
    sockets = [];
    chat = chatService();
    server = buildServer({ config: loadConfig({}), authService: authService(), roomService: roomService(), chatService: chat });
    await server.ready();
  });

  afterEach(async () => {
    sockets.forEach((socket) => socket.terminate());
    await server.close();
  });

  test("rejects missing session cookies", async () => {
    await expect(server.injectWS("/api/rooms/main-lobby/ws")).rejects.toThrow();
  });

  test("sends a room snapshot after a valid room.join", async () => {
    const socket = rememberSocket(await server.injectWS("/api/rooms/main-lobby/ws", {
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
    const first = rememberSocket(await server.injectWS("/api/rooms/main-lobby/ws", {
      headers: { cookie: "sl_session=session-token" }
    }));
    const firstSnapshotPromise = onceMessage(first);
    first.send(JSON.stringify({ version: 1, type: "room.join", payload: { roomSlug: "main-lobby" } }));
    await firstSnapshotPromise;

    const second = rememberSocket(await server.injectWS("/api/rooms/main-lobby/ws", {
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
    const first = rememberSocket(await server.injectWS("/api/rooms/main-lobby/ws", {
      headers: { cookie: "sl_session=session-token" }
    }));
    const firstSnapshotPromise = onceMessage(first);
    first.send(JSON.stringify({ version: 1, type: "room.join", payload: { roomSlug: "main-lobby" } }));
    await firstSnapshotPromise;

    const second = rememberSocket(await server.injectWS("/api/rooms/main-lobby/ws", {
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

  test("accepts movement requests and broadcasts the accepted destination", async () => {
    const first = rememberSocket(await server.injectWS("/api/rooms/main-lobby/ws", {
      headers: { cookie: "sl_session=session-token" }
    }));
    const firstSnapshotPromise = onceMessage(first);
    first.send(JSON.stringify({ version: 1, type: "room.join", payload: { roomSlug: "main-lobby" } }));
    await firstSnapshotPromise;

    const second = rememberSocket(await server.injectWS("/api/rooms/main-lobby/ws", {
      headers: { cookie: "sl_session=session-token-2" }
    }));
    const secondSnapshotPromise = onceMessage(second);
    const joinedPromise = onceMessage(first);
    second.send(JSON.stringify({ version: 1, type: "room.join", payload: { roomSlug: "main-lobby" } }));
    await secondSnapshotPromise;
    await joinedPromise;

    const moverAcceptedPromise = onceMessage(first);
    const peerAcceptedPromise = onceMessage(second);

    first.send(
      JSON.stringify({
        version: 1,
        type: "move.request",
        requestId: "move-1",
        payload: {
          roomSlug: "main-lobby",
          destination: { x: 640, y: 520 },
          source: "pointer"
        }
      })
    );

    const moverEvent = JSON.parse((await moverAcceptedPromise).toString()) as {
      type: string;
      requestId?: string;
      payload?: { occupant?: { userId: string; position: { x: number; y: number } } };
    };
    const peerEvent = JSON.parse((await peerAcceptedPromise).toString()) as {
      type: string;
      payload?: { occupant?: { userId: string; position: { x: number; y: number } } };
    };

    expect(moverEvent.type).toBe("movement.accepted");
    expect(moverEvent.requestId).toBe("move-1");
    expect(moverEvent.payload?.occupant).toMatchObject({
      userId: "user-1",
      position: { x: 640, y: 520 }
    });

    expect(peerEvent.type).toBe("movement.accepted");
    expect(peerEvent.payload?.occupant).toMatchObject({
      userId: "user-1",
      position: { x: 640, y: 520 }
    });
  });

  test("returns an error event for invalid envelope versions", async () => {
    const socket = rememberSocket(await server.injectWS("/api/rooms/main-lobby/ws", {
      headers: { cookie: "sl_session=session-token" }
    }));

    socket.send(JSON.stringify({ version: 2, type: "room.join", payload: { roomSlug: "main-lobby" } }));

    const message = await onceMessage(socket);
    const event = JSON.parse(message.toString()) as { type: string; payload?: { code?: string } };

    expect(event.type).toBe("error");
    expect(event.payload?.code).toBe("invalid_event");
  });

  test("persists chat.send and fans out chat.message to room occupants", async () => {
    const first = rememberSocket(await server.injectWS("/api/rooms/main-lobby/ws", {
      headers: { cookie: "sl_session=session-token" }
    }));
    const firstSnapshotPromise = onceMessage(first);
    first.send(JSON.stringify({ version: 1, type: "room.join", payload: { roomSlug: "main-lobby" } }));
    await firstSnapshotPromise;

    const second = rememberSocket(await server.injectWS("/api/rooms/main-lobby/ws", {
      headers: { cookie: "sl_session=session-token-2" }
    }));
    const secondSnapshotPromise = onceMessage(second);
    const joinedPromise = onceMessage(first);
    second.send(JSON.stringify({ version: 1, type: "room.join", payload: { roomSlug: "main-lobby" } }));
    await secondSnapshotPromise;
    await joinedPromise;

    const senderMessagePromise = onceMessage(first);
    const peerMessagePromise = onceMessage(second);
    first.send(JSON.stringify({
      version: 1,
      type: "chat.send",
      requestId: "chat-1",
      payload: {
        roomSlug: "main-lobby",
        body: "Hello room"
      }
    }));

    const senderEvent = JSON.parse((await senderMessagePromise).toString()) as {
      type: string;
      requestId?: string;
      payload?: { message?: { body: string; userId: string } };
    };
    const peerEvent = JSON.parse((await peerMessagePromise).toString()) as {
      type: string;
      payload?: { message?: { body: string; userId: string } };
    };

    expect(senderEvent.type).toBe("chat.message");
    expect(senderEvent.requestId).toBe("chat-1");
    expect(senderEvent.payload?.message).toMatchObject({
      body: "Hello room",
      userId: "user-1"
    });

    expect(peerEvent.type).toBe("chat.message");
    expect(peerEvent.payload?.message).toMatchObject({
      body: "Hello room",
      userId: "user-1"
    });

    expect(chat.createMessage).toHaveBeenCalledWith({
      roomSlug: "main-lobby",
      userId: "user-1",
      body: "Hello room"
    });
  });

  test("returns access_denied when chat.send fails membership validation", async () => {
    chat.createMessage = vi.fn(async () => {
      throw new ChatAccessError();
    });

    const socket = rememberSocket(await server.injectWS("/api/rooms/main-lobby/ws", {
      headers: { cookie: "sl_session=session-token" }
    }));
    const snapshotPromise = onceMessage(socket);
    socket.send(JSON.stringify({ version: 1, type: "room.join", payload: { roomSlug: "main-lobby" } }));
    await snapshotPromise;

    const errorPromise = onceMessage(socket);
    socket.send(JSON.stringify({
      version: 1,
      type: "chat.send",
      requestId: "chat-denied",
      payload: {
        roomSlug: "main-lobby",
        body: "Hello room"
      }
    }));

    const event = JSON.parse((await errorPromise).toString()) as {
      type: string;
      requestId?: string;
      payload?: { code?: string; message?: string };
    };

    expect(event.type).toBe("error");
    expect(event.requestId).toBe("chat-denied");
    expect(event.payload).toEqual({
      code: "access_denied",
      message: "room access denied"
    });
  });

  function rememberSocket(socket: WebSocket): WebSocket {
    sockets.push(socket);
    return socket;
  }
});

function onceMessage(socket: WebSocket): Promise<WebSocket.RawData> {
  return new Promise((resolve, reject) => {
    socket.once("message", (data: any) => resolve(data));
    socket.once("error", reject);
  });
}
