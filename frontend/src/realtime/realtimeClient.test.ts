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
    expect(states.at(-1)?.snapshot?.room.slug).toBe("main-lobby");

    disconnect();
    expect(socket?.closed).toBe(true);
  });
});
