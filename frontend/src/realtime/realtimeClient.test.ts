import { describe, expect, it } from "vitest";
import { createRealtimeClient, type RealtimeState } from "./realtimeClient";

class FakeWebSocket {
  sent: string[] = [];
  closed = false;
  url: string;
  private readonly listeners = new Map<string, Set<(event: { data?: string }) => void>>();

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: string, listener: (event: { data?: string }) => void) {
    const bucket = this.listeners.get(type) ?? new Set();
    bucket.add(listener);
    this.listeners.set(type, bucket);
  }

  removeEventListener(type: string, listener: (event: { data?: string }) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.closed = true;
    this.emit("close", {});
  }

  emit(type: string, event: { data?: string }) {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

describe("createRealtimeClient", () => {
  it("sends room.join and stores the first room snapshot", () => {
    let socket: FakeWebSocket | undefined;
    const states: RealtimeState[] = [];
    const client = createRealtimeClient({
      baseUrl: "/api",
      webSocketFactory: (url) => {
        socket = new FakeWebSocket(url);
        return socket as never;
      }
    });

    client.subscribe((state) => {
      states.push(state);
    });

    const disconnect = client.connect("main-lobby");

    expect(client.status).toBe("connecting");
    expect(socket?.url).toBe("ws://localhost:3000/api/rooms/main-lobby/ws");

    socket?.emit("open", {});

    expect(socket?.sent).toEqual([
      JSON.stringify({
        version: 1,
        type: "room.join",
        payload: { roomSlug: "main-lobby" }
      })
    ]);

    socket?.emit("message", {
      data: JSON.stringify({
        version: 1,
        type: "room.snapshot",
        occurredAt: "2026-04-28T12:00:00.000Z",
        payload: {
          room: { slug: "main-lobby", name: "Main Lobby", layoutVersion: 1 },
          self: {
            connectionId: "conn-1",
            userId: "user-1",
            email: "person@example.com",
            position: { x: 320, y: 420 }
          },
          occupants: [
            {
              connectionId: "conn-1",
              userId: "user-1",
              email: "person@example.com",
              position: { x: 320, y: 420 }
            }
          ]
        }
      })
    });

    expect(client.status).toBe("connected");
    expect(client.snapshot?.occupants).toHaveLength(1);
    expect(client.messages).toEqual([]);
    expect(states[states.length - 1]?.snapshot?.room.slug).toBe("main-lobby");

    disconnect();
    expect(socket?.closed).toBe(true);
  });

  it("sends move.request and updates occupant state from movement.accepted", () => {
    let socket: FakeWebSocket | undefined;
    const client = createRealtimeClient({
      baseUrl: "/api",
      webSocketFactory: (url) => {
        socket = new FakeWebSocket(url);
        return socket as never;
      }
    });

    client.connect("main-lobby");
    socket?.emit("open", {});
    socket?.emit("message", {
      data: JSON.stringify({
        version: 1,
        type: "room.snapshot",
        occurredAt: "2026-04-28T12:00:00.000Z",
        payload: {
          room: { slug: "main-lobby", name: "Main Lobby", layoutVersion: 1 },
          self: {
            connectionId: "conn-1",
            userId: "user-1",
            email: "person@example.com",
            position: { x: 320, y: 420 }
          },
          occupants: [
            {
              connectionId: "conn-1",
              userId: "user-1",
              email: "person@example.com",
              position: { x: 320, y: 420 }
            },
            {
              connectionId: "conn-2",
              userId: "user-2",
              email: "other@example.com",
              position: { x: 640, y: 420 }
            }
          ]
        }
      })
    });

    client.requestMovement({
      roomSlug: "main-lobby",
      destination: { x: 640, y: 520 },
      source: "pointer"
    });

    expect(socket?.sent).toContain(
      JSON.stringify({
        version: 1,
        type: "move.request",
        payload: {
          roomSlug: "main-lobby",
          destination: { x: 640, y: 520 },
          source: "pointer"
        }
      })
    );

    socket?.emit("message", {
      data: JSON.stringify({
        version: 1,
        type: "movement.accepted",
        occurredAt: "2026-04-28T12:00:01.000Z",
        payload: {
          occupant: {
            connectionId: "conn-2",
            userId: "user-2",
            email: "other@example.com",
            position: { x: 700, y: 460 }
          }
        }
      })
    });

    expect(client.snapshot?.occupants).toEqual([
      {
        connectionId: "conn-1",
        userId: "user-1",
        email: "person@example.com",
        position: { x: 320, y: 420 }
      },
      {
        connectionId: "conn-2",
        userId: "user-2",
        email: "other@example.com",
        position: { x: 700, y: 460 }
      }
    ]);
  });

  it("sends chat.send and stores chat.message events", () => {
    let socket: FakeWebSocket | undefined;
    const client = createRealtimeClient({
      baseUrl: "/api",
      webSocketFactory: (url) => {
        socket = new FakeWebSocket(url);
        return socket as never;
      }
    });

    client.connect("main-lobby");
    socket?.emit("open", {});

    client.sendChatMessage({
      roomSlug: "main-lobby",
      body: "Hello room"
    });

    expect(socket?.sent).toContain(
      JSON.stringify({
        version: 1,
        type: "chat.send",
        payload: {
          roomSlug: "main-lobby",
          body: "Hello room"
        }
      })
    );

    socket?.emit("message", {
      data: JSON.stringify({
        version: 1,
        type: "chat.message",
        occurredAt: "2026-04-29T10:10:00.000Z",
        payload: {
          message: {
            id: "message-1",
            roomSlug: "main-lobby",
            userId: "user-1",
            userName: "Person Example",
            body: "Hello room",
            createdAt: "2026-04-29T10:10:00.000Z"
          }
        }
      })
    });

    expect(client.messages).toEqual([
      {
        id: "message-1",
        roomSlug: "main-lobby",
        userId: "user-1",
        userName: "Person Example",
        body: "Hello room",
        createdAt: "2026-04-29T10:10:00.000Z"
      }
    ]);
  });
});
