import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LobbyView } from "./LobbyView";
import type { ApiClient } from "../shared/apiClient";

function apiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    baseUrl: "/api",
    updateProfile: vi.fn(),
    redeemInvite: vi.fn(),
    listCommunityMembers: vi.fn(async () => ({ members: [] })),
    updateCommunityMemberRole: vi.fn(),
    listCommunities: vi.fn(async () => ({
      communities: [
        {
          community: { id: "community-1", slug: "default-community", name: "Default Community" },
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
        }
      ]
    })),
    listRooms: vi.fn(async () => ({
      community: { id: "community-1", slug: "default-community", name: "Default Community" },
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
    listCommunityRooms: vi.fn(),
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
    expect(screen.getByRole("heading", { name: "Personal room feed" })).toBeInTheDocument();
    expect(screen.getAllByText(/Use the community menu/i).length).toBeGreaterThan(0);
  });

  it("loads the persistent community navigation", async () => {
    render(<LobbyView apiClient={apiClient()} session={session} />);

    expect(await screen.findByRole("navigation", { name: "Communities and rooms" })).toBeInTheDocument();
    expect(await screen.findByText("Default Community")).toBeInTheDocument();
    expect(await screen.findByText("Main Lobby")).toBeInTheDocument();
  });

  it("lets community owners open settings and assign admins", async () => {
    const updateCommunityMemberRole = vi.fn(async () => ({ userId: "member-1", communityId: "community-1", role: "admin" as const }));
    render(
      <LobbyView
        apiClient={apiClient({
          listCommunities: vi.fn(async () => ({
            communities: [
              {
                community: { id: "community-1", slug: "default-community", name: "Default Community", viewerRole: "owner" as const },
                rooms: []
              }
            ]
          })),
          listCommunityMembers: vi.fn(async () => ({
            members: [
              {
                userId: "owner-1",
                displayName: "Owner",
                username: "owner",
                email: "owner@example.com",
                role: "owner" as const,
                status: "active"
              },
              {
                userId: "member-1",
                displayName: "Member",
                username: "member",
                email: "member@example.com",
                role: "member" as const,
                status: "active"
              }
            ]
          })),
          updateCommunityMemberRole
        })}
        session={session}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Community settings" }));
    expect(await screen.findByText("member")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Make admin" }));

    await waitFor(() => expect(updateCommunityMemberRole).toHaveBeenCalledWith("community-1", "member-1", "admin"));
  });

  it("lets regular members show all members without settings access", async () => {
    const updateCommunityMemberRole = vi.fn();
    render(
      <LobbyView
        apiClient={apiClient({
          listCommunities: vi.fn(async () => ({
            communities: [
              {
                community: { id: "community-1", slug: "default-community", name: "Default Community", viewerRole: "member" as const },
                rooms: []
              }
            ]
          })),
          listCommunityMembers: vi.fn(async () => ({
            members: [
              {
                userId: "owner-1",
                displayName: "Owner",
                username: "owner",
                email: "owner@example.com",
                role: "owner" as const,
                status: "active"
              },
              {
                userId: "member-1",
                displayName: "Member",
                username: "member",
                email: "member@example.com",
                role: "member" as const,
                status: "active"
              }
            ]
          })),
          updateCommunityMemberRole
        })}
        session={session}
      />
    );

    expect(screen.queryByRole("button", { name: "Community settings" })).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Show all members" }));

    expect(await screen.findByText("member")).toBeInTheDocument();
    expect(screen.getByText("Member")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Make admin" })).not.toBeInTheDocument();
    expect(updateCommunityMemberRole).not.toHaveBeenCalled();
  });

  it("keeps the member list separate from owner settings", async () => {
    render(
      <LobbyView
        apiClient={apiClient({
          listCommunities: vi.fn(async () => ({
            communities: [
              {
                community: { id: "community-1", slug: "default-community", name: "Default Community", viewerRole: "owner" as const },
                rooms: []
              }
            ]
          })),
          listCommunityMembers: vi.fn(async () => ({
            members: [
              {
                userId: "member-1",
                displayName: "Member",
                username: "member",
                email: "member@example.com",
                role: "member" as const,
                status: "active"
              }
            ]
          }))
        })}
        session={session}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Show all members" }));

    expect(await screen.findByRole("region", { name: "Default Community members" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Make admin" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Community settings" }));

    expect(await screen.findByRole("region", { name: "Default Community settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make admin" })).toBeInTheDocument();
  });
});
