import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoomView } from "./RoomView";
import type { ApiClient } from "../shared/apiClient";
import type { RealtimeClient, RealtimeState } from "../realtime/realtimeClient";

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
    ...overrides
  };
}

function realtimeClient(state: Partial<RealtimeState> = {}): RealtimeClient {
  return {
    status: state.status ?? "idle",
    snapshot: state.snapshot ?? null,
    error: state.error ?? null,
    connect: vi.fn(() => () => undefined),
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
});
