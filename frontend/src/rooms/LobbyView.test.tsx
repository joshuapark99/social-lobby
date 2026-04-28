import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LobbyView } from "./LobbyView";
import type { ApiClient } from "../shared/apiClient";

function apiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    baseUrl: "/api",
    redeemInvite: vi.fn(),
    listRooms: vi.fn(async () => ({
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
    getRoom: vi.fn(),
    ...overrides
  };
}

describe("LobbyView", () => {
  it("renders loading then the room list", async () => {
    render(<LobbyView apiClient={apiClient()} />);

    expect(screen.getByText("Loading rooms...")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Default Community" })).toBeInTheDocument();
    expect(screen.getByText("Main Lobby")).toBeInTheDocument();
    expect(screen.getByText("Theme: cozy-lobby")).toBeInTheDocument();
    expect(screen.getByText("2400 x 1600")).toBeInTheDocument();
  });

  it("renders an error state when room loading fails", async () => {
    render(
      <LobbyView
        apiClient={apiClient({
          listRooms: vi.fn(async () => {
            throw new Error("Unable to load rooms.");
          })
        })}
      />
    );

    await waitFor(() => expect(screen.getByText("Unable to load rooms.")).toBeInTheDocument());
  });
});
