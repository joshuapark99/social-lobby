import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoomView } from "./RoomView";
import type { ApiClient } from "../shared/apiClient";
import type { RealtimeClient, RealtimeState } from "../realtime/realtimeClient";
import type { RoomChatMessage } from "../rooms/api";

function apiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    baseUrl: "/api",
    redeemInvite: vi.fn(),
    listRooms: vi.fn(),
    getRoom: vi.fn(async () => ({
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
          collision: [{ x: 520, y: 360, w: 220, h: 90 }],
          teleports: [{ label: "Rooftop", targetRoom: "rooftop" }]
          }
      }
    })),
    listRoomMessages: vi.fn(async (): Promise<{ messages: RoomChatMessage[] }> => ({
      messages: [
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
      ]
    })),
    ...overrides
  };
}

function realtimeClient(state: Partial<RealtimeState> = {}): RealtimeClient {
  return {
    status: state.status ?? "idle",
    snapshot: state.snapshot ?? null,
    error: state.error ?? null,
    messages: state.messages ?? [],
    connect: vi.fn(() => () => undefined),
    requestMovement: vi.fn(),
    sendChatMessage: vi.fn(),
    subscribe: vi.fn(() => () => undefined)
  };
}

describe("RoomView", () => {
  it("renders loading then room metadata", async () => {
    render(<RoomView apiClient={apiClient()} realtimeClient={realtimeClient()} roomSlug="main-lobby" />);

    expect(screen.getByText("Loading room...")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Main Lobby" })).toBeInTheDocument();
    expect(screen.getByText("Theme: cozy-lobby")).toBeInTheDocument();
    expect(screen.getByText("Layout version: 1")).toBeInTheDocument();
    expect(screen.getByText("Spawn points: 1")).toBeInTheDocument();
    expect(screen.getByText("Collision rectangles: 1")).toBeInTheDocument();
    expect(screen.getByText("Teleports: Rooftop")).toBeInTheDocument();
  });

  it("renders an error state when room metadata loading fails", async () => {
    render(
      <RoomView
        apiClient={apiClient({
          getRoom: vi.fn(async () => {
            throw new Error("Unable to load room.");
          })
        })}
        realtimeClient={realtimeClient()}
        roomSlug="main-lobby"
      />
    );

    await waitFor(() => expect(screen.getByText("Unable to load room.")).toBeInTheDocument());
  });

  it("renders active occupant count from realtime snapshot state", async () => {
    render(
      <RoomView
        apiClient={apiClient()}
        realtimeClient={realtimeClient({
          status: "connected",
          snapshot: {
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
                position: { x: 320, y: 420 }
              }
            ]
          }
        })}
        roomSlug="main-lobby"
      />
    );

    expect(await screen.findByText("Active occupants: 2")).toBeInTheDocument();
  });

  it("renders the Pixi room canvas once room metadata loads", async () => {
    render(<RoomView apiClient={apiClient()} realtimeClient={realtimeClient()} roomSlug="main-lobby" />);

    expect(await screen.findByLabelText("Pixi room canvas")).toBeInTheDocument();
  });

  it("renders room layout without avatars when realtime is idle", async () => {
    render(<RoomView apiClient={apiClient()} realtimeClient={realtimeClient({ status: "idle", snapshot: null })} roomSlug="main-lobby" />);

    expect(await screen.findByText("Active occupants: 0")).toBeInTheDocument();
    expect(screen.getByLabelText("Pixi room canvas")).toBeInTheDocument();
  });

  it("sends pointer movement requests in room coordinates", async () => {
    const client = realtimeClient({
      status: "connected",
      snapshot: {
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
    });

    render(<RoomView apiClient={apiClient()} realtimeClient={client} roomSlug="main-lobby" />);

    const canvas = await screen.findByLabelText("Pixi room canvas");
    Object.defineProperty(canvas, "getBoundingClientRect", {
      value: () => ({
        left: 0,
        top: 0,
        width: 400,
        height: 200,
        right: 400,
        bottom: 200,
        x: 0,
        y: 0,
        toJSON() {}
      })
    });

    fireEvent.click(canvas, { clientX: 200, clientY: 100 });

    expect(client.requestMovement).toHaveBeenCalledWith({
      roomSlug: "main-lobby",
      destination: { x: 1200, y: 800 },
      source: "pointer"
    });
  });

  it("sends keyboard movement requests from the local occupant position", async () => {
    const client = realtimeClient({
      status: "connected",
      snapshot: {
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
    });

    render(<RoomView apiClient={apiClient()} realtimeClient={client} roomSlug="main-lobby" />);
    await screen.findByLabelText("Pixi room canvas");

    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(client.requestMovement).toHaveBeenCalledWith({
      roomSlug: "main-lobby",
      destination: { x: 400, y: 420 },
      source: "keyboard"
    });
  });

  it("renders recent room chat history after the room loads", async () => {
    render(<RoomView apiClient={apiClient()} realtimeClient={realtimeClient()} roomSlug="main-lobby" />);

    expect(await screen.findByText((_, element) => element?.textContent === "Person Example: Hello room")).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === "Other Person: Welcome back")).toBeInTheDocument();
  });

  it("appends realtime chat messages from current room state", async () => {
    render(
      <RoomView
        apiClient={apiClient({
          listRoomMessages: vi.fn(async () => ({ messages: [] }))
        })}
        realtimeClient={realtimeClient({
          status: "connected",
          snapshot: {
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
          },
          messages: [
            {
              id: "message-3",
              roomSlug: "main-lobby",
              userId: "user-2",
              userName: "Other Person",
              body: "Realtime hello",
              createdAt: "2026-04-29T10:10:00.000Z"
            }
          ]
        })}
        roomSlug="main-lobby"
      />
    );

    expect(await screen.findByRole("listitem")).toHaveTextContent("Other Person: Realtime hello");
  });
});
