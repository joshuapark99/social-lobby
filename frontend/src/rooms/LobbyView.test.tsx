import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LobbyView } from "./LobbyView";
import type { ApiClient } from "../shared/apiClient";

function apiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    baseUrl: "/api",
    updateProfile: vi.fn(),
    createCommunity: vi.fn(),
    createCommunityRoom: vi.fn(),
    updateCommunityRoomTables: vi.fn(),
    redeemInvite: vi.fn(),
    listCommunityMembers: vi.fn(async () => ({ members: [] })),
    updateCommunityMemberRole: vi.fn(),
    listCommunityInvites: vi.fn(async () => ({ invites: [] })),
    createCommunityInvite: vi.fn(async () => ({
      id: "invite-1",
      code: "invite-code",
      targetEmail: null,
      maxRedemptions: 1,
      expiresAt: null
    })),
    revokeCommunityInvite: vi.fn(async () => ({ status: "revoked" as const })),
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

  it("creates a community from the add-community workflow", async () => {
    const createCommunity = vi.fn(async () => ({
      community: { id: "community-2", slug: "friday-game-night", name: "Friday Game Night", viewerRole: "owner" as const },
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
            teleports: []
          }
        }
      ]
    }));
    const onNavigate = vi.fn();
    render(<LobbyView apiClient={apiClient({ createCommunity })} onNavigate={onNavigate} session={session} />);

    fireEvent.click(await screen.findByRole("button", { name: "Add community" }));
    fireEvent.change(screen.getByLabelText("Create community"), { target: { value: "Friday Game Night" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(createCommunity).toHaveBeenCalledWith("Friday Game Night"));
    expect(await screen.findByText("Friday Game Night")).toBeInTheDocument();
    expect(onNavigate).toHaveBeenCalledWith("/community/friday-game-night/rooms/main-lobby");
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

  it("lets community managers create and revoke invites", async () => {
    const createCommunityInvite = vi.fn(async () => ({
      id: "invite-2",
      code: "new-code",
      targetEmail: "friend@example.com",
      maxRedemptions: 1,
      expiresAt: null
    }));
    const revokeCommunityInvite = vi.fn(async () => ({ status: "revoked" as const }));
    const listCommunityInvites = vi
      .fn()
      .mockResolvedValueOnce({
        invites: [
          {
            id: "invite-1",
            communityId: "community-1",
            createdByUserId: "admin-1",
            targetEmail: null,
            maxRedemptions: 1,
            redemptionCount: 0,
            expiresAt: null,
            revokedAt: null,
            createdAt: "2026-05-09T00:00:00.000Z",
            status: "active" as const
          }
        ]
      })
      .mockResolvedValueOnce({
        invites: [
          {
            id: "invite-1",
            communityId: "community-1",
            createdByUserId: "admin-1",
            targetEmail: null,
            maxRedemptions: 5,
            redemptionCount: 0,
            expiresAt: "2026-05-23T23:59:59.999Z",
            revokedAt: null,
            createdAt: "2026-05-09T00:00:00.000Z",
            status: "active" as const
          },
          {
            id: "invite-2",
            communityId: "community-1",
            createdByUserId: "admin-1",
            targetEmail: "friend@example.com",
            maxRedemptions: 5,
            redemptionCount: 0,
            expiresAt: "2026-05-23T23:59:59.999Z",
            revokedAt: null,
            createdAt: "2026-05-09T00:01:00.000Z",
            status: "active" as const
          }
        ]
      })
      .mockResolvedValueOnce({
        invites: [
          {
            id: "invite-1",
            communityId: "community-1",
            createdByUserId: "admin-1",
            targetEmail: null,
            maxRedemptions: 1,
            redemptionCount: 0,
            expiresAt: null,
            revokedAt: "2026-05-09T00:02:00.000Z",
            createdAt: "2026-05-09T00:00:00.000Z",
            status: "revoked" as const
          }
        ]
      });

    render(
      <LobbyView
        apiClient={apiClient({
          listCommunities: vi.fn(async () => ({
            communities: [
              {
                community: { id: "community-1", slug: "default-community", name: "Default Community", viewerRole: "admin" as const },
                rooms: []
              }
            ]
          })),
          listCommunityMembers: vi.fn(async () => ({ members: [] })),
          listCommunityInvites,
          createCommunityInvite,
          revokeCommunityInvite
        })}
        session={session}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Community settings" }));
    expect(await screen.findByText("General invite")).toBeInTheDocument();
    expect(await screen.findByText("ID invite-1")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Create invite"), { target: { value: "friend@example.com" } });
    fireEvent.change(screen.getByLabelText("Max uses"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Expiry date"), { target: { value: "2026-05-23" } });
    fireEvent.click(screen.getByRole("button", { name: "Create invite" }));

    await waitFor(() =>
      expect(createCommunityInvite).toHaveBeenCalledWith("community-1", {
        targetEmail: "friend@example.com",
        maxRedemptions: 5,
        expiresAt: "2026-05-23T23:59:59.999Z"
      })
    );
    expect(await screen.findByText("new-code")).toBeInTheDocument();
    expect(await screen.findByText("friend@example.com")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Revoke" })[0]);

    await waitFor(() => expect(revokeCommunityInvite).toHaveBeenCalledWith("community-1", "invite-1"));
  });

  it("lets community managers create rooms and opens the new room", async () => {
    const createCommunityRoom = vi.fn(async () => ({
      community: { id: "community-1", slug: "default-community", name: "Default Community", viewerRole: "admin" as const },
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
            teleports: []
          }
        },
        {
          slug: "board-game-room",
          name: "Board Game Room",
          kind: "permanent",
          isDefault: false,
          layoutVersion: 1,
          layout: {
            theme: "community-room",
            backgroundAsset: "rooms/main-lobby.png",
            avatarStyleSet: "soft-rounded",
            objectPack: "empty-room-v1",
            width: 2400,
            height: 1600,
            spawnPoints: [{ x: 320, y: 420 }],
            collision: [],
            teleports: []
          }
        }
      ]
    }));
    const onNavigate = vi.fn();

    render(
      <LobbyView
        apiClient={apiClient({
          listCommunities: vi.fn(async () => ({
            communities: [
              {
                community: { id: "community-1", slug: "default-community", name: "Default Community", viewerRole: "admin" as const },
                rooms: []
              }
            ]
          })),
          createCommunityRoom
        })}
        onNavigate={onNavigate}
        session={session}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Community settings" }));
    fireEvent.change(screen.getByLabelText("Create room"), { target: { value: "Board Game Room" } });
    fireEvent.click(screen.getByRole("button", { name: "Create room" }));

    await waitFor(() => expect(createCommunityRoom).toHaveBeenCalledWith("community-1", "Board Game Room"));
    expect(await screen.findByText("Board Game Room")).toBeInTheDocument();
    expect(onNavigate).toHaveBeenCalledWith("/community/default-community/rooms/board-game-room");
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
