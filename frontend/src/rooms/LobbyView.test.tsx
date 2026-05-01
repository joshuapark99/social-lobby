import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LobbyView } from "./LobbyView";
import type { ApiClient } from "../shared/apiClient";

function apiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    baseUrl: "/api",
    updateProfile: vi.fn(),
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
    listRoomMessages: vi.fn(async () => ({ messages: [] })),
    ...overrides
  };
}

const session = {
  status: "authenticated" as const,
  user: {
    displayName: "June",
    email: "june@example.com",
    username: "June",
    needsUsername: false
  }
};

describe("LobbyView", () => {
  it("renders the personal-room landing experience", async () => {
    render(<LobbyView apiClient={apiClient()} session={session} />);

    expect(screen.getByRole("heading", { name: "June's Room" })).toBeInTheDocument();
    expect(screen.getByText("Open transit console")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Personal room feed" })).toBeInTheDocument();
    expect(screen.getByText(/Open the transit console/i)).toBeInTheDocument();
  });

  it("opens the directory and loads rooms", async () => {
    render(<LobbyView apiClient={apiClient()} session={session} />);

    fireEvent.click(screen.getByRole("button", { name: "Open transit console" }));

    expect(await screen.findByRole("heading", { name: "Pick your next room" })).toBeInTheDocument();
    expect(await screen.findByText("Main Lobby")).toBeInTheDocument();
  });
});
