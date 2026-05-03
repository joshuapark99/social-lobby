import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";
import type { SessionState } from "../auth/session";
import type { RealtimeClient } from "../realtime/realtimeClient";
import { ApiError } from "../shared/apiClient";

function realtimeClient(): RealtimeClient {
  return {
    status: "idle",
    snapshot: null,
    messages: [],
    error: null,
    connect: vi.fn(() => () => undefined),
    requestMovement: vi.fn(),
    requestTeleport: vi.fn(),
    sendChatMessage: vi.fn(),
    subscribe: vi.fn(() => () => undefined)
  };
}

type FrontendIssue = {
  source: string;
  message: string;
};

function authenticatedSession(overrides: Partial<Extract<SessionState, { status: "authenticated" }>["user"]> = {}): SessionState {
  return {
    status: "authenticated",
    user: {
      displayName: "June",
      email: "june@example.com",
      username: "June",
      needsUsername: false,
      ...overrides
    }
  };
}

function renderApp(pathname: string, session: SessionState = { status: "anonymous" }) {
  const apiClient = {
    baseUrl: "/api",
    updateProfile: vi.fn(async () => ({ displayName: "June", username: "June" })),
    redeemInvite: vi.fn(async () => ({ status: "redeemed" as const, communityId: "community-1" })),
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
            teleports: [{ label: "Rooftop", targetRoom: "rooftop" }],
          },
        },
      ],
    })),
    listCommunityRooms: vi.fn(),
    getRoom: vi.fn(async () => ({
      community: { id: "community-1", slug: "default-community", name: "Default Community" },
      room: {
        slug: "main-hall",
        name: "Main Hall",
        kind: "permanent",
        isDefault: false,
        layoutVersion: 1,
        layout: {
          theme: "cozy-hall",
          backgroundAsset: "rooms/main-hall.png",
          avatarStyleSet: "soft-rounded",
          objectPack: "hall-furniture-v1",
          width: 1800,
          height: 1200,
          spawnPoints: [{ x: 240, y: 360 }],
          collision: [],
          teleports: [],
        },
      },
    })),
    listRoomMessages: vi.fn(async () => ({ messages: [] })),
  };
  return render(
    <App
      apiClient={apiClient}
      bootstrapSession={() => Promise.resolve(session)}
      initialPathname={pathname}
      realtimeClient={realtimeClient()}
    />,
  );
}

describe("App", () => {
  it("renders the welcome route with a Google OAuth entry link", async () => {
    renderApp("/welcome");

    expect(await screen.findByRole("heading", { name: "Welcome to Social Lobby" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue with Google" })).toHaveAttribute("href", "/api/auth/login");
  });

  it("renders the invite redemption route", async () => {
    renderApp("/invite/friend-code");

    expect(await screen.findByRole("heading", { name: "Redeem invite" })).toBeInTheDocument();
    expect(screen.getByLabelText("Invite code")).toHaveValue("friend-code");
  });

  it("redeems the invite code through the API client", async () => {
    const apiClient = {
      baseUrl: "/api",
      updateProfile: vi.fn(async () => ({ displayName: "June", username: "June" })),
      redeemInvite: vi.fn(async () => ({ status: "redeemed" as const, communityId: "community-1" })),
      listCommunities: vi.fn(async () => ({ communities: [] })),
      listRooms: vi.fn(),
      listCommunityRooms: vi.fn(),
      getRoom: vi.fn(),
      listRoomMessages: vi.fn(async () => ({ messages: [] }))
    };
    render(
      <App
        apiClient={apiClient}
        bootstrapSession={() => Promise.resolve(authenticatedSession())}
        initialPathname="/invite/friend-code"
        realtimeClient={realtimeClient()}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Redeem" }));

    await waitFor(() => expect(apiClient.redeemInvite).toHaveBeenCalledWith("friend-code"));
    expect(screen.getByText("Invite accepted.")).toBeInTheDocument();
  });

  it("renders the lobby route", async () => {
    renderApp("/lobby", authenticatedSession());

    expect(await screen.findByRole("heading", { name: "June's Room" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Communities and rooms" })).toBeInTheDocument();
  });

  it("renders the room route with canvas and chat regions", async () => {
    renderApp("/rooms/main-hall", authenticatedSession());

    expect(await screen.findByRole("heading", { name: "Main Hall" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Room canvas" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Room chat" })).toBeInTheDocument();
  });

  it("renders session bootstrap loading then anonymous state", async () => {
    renderApp("/lobby");

    expect(screen.getByText("Checking session...")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Not signed in")).toBeInTheDocument();
    });
  });

  it("redirects anonymous lobby access to the login view", async () => {
    renderApp("/lobby", { status: "anonymous" });

    expect(await screen.findByRole("heading", { name: "Welcome to Social Lobby" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue with Google" })).toHaveAttribute("href", "/api/auth/login");
  });

  it("redirects anonymous room access to the welcome view", async () => {
    renderApp("/rooms/main-hall", { status: "anonymous" });

    expect(await screen.findByRole("heading", { name: "Welcome to Social Lobby" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue with Google" })).toHaveAttribute("href", "/api/auth/login");
    expect(screen.queryByRole("region", { name: "Room canvas" })).not.toBeInTheDocument();
  });

  it("does not mount protected room content while session bootstrap is loading", () => {
    const apiClient = {
      baseUrl: "/api",
      updateProfile: vi.fn(),
      redeemInvite: vi.fn(),
      listCommunities: vi.fn(async () => ({ communities: [] })),
      listRooms: vi.fn(),
      listCommunityRooms: vi.fn(),
      getRoom: vi.fn(),
      listRoomMessages: vi.fn(async () => ({ messages: [] }))
    };
    render(
      <App
        apiClient={apiClient}
        bootstrapSession={() => new Promise<SessionState>(() => undefined)}
        initialPathname="/rooms/main-hall"
        realtimeClient={realtimeClient()}
      />,
    );

    expect(screen.getByText("Checking session...")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Welcome to Social Lobby" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Room canvas" })).not.toBeInTheDocument();
    expect(apiClient.getRoom).not.toHaveBeenCalled();
  });

  it("renders session bootstrap errors", async () => {
    renderApp("/lobby", { status: "error", message: "Session unavailable" });

    expect(await screen.findByText("Session unavailable")).toBeInTheDocument();
  });

  it("surfaces room load failures in the application alert region", async () => {
    const errorReporter = vi.fn();
    const apiClient = {
      baseUrl: "/api",
      updateProfile: vi.fn(),
      redeemInvite: vi.fn(),
      listCommunities: vi.fn(async () => ({ communities: [] })),
      listRooms: vi.fn(),
      listCommunityRooms: vi.fn(),
      getRoom: vi.fn(async () => {
        throw new Error("Unable to load room.");
      }),
      listRoomMessages: vi.fn(async () => ({ messages: [] }))
    };

    render(
      <App
        apiClient={apiClient}
        bootstrapSession={() => Promise.resolve(authenticatedSession())}
        initialPathname="/rooms/main-hall"
        realtimeClient={realtimeClient()}
        errorReporter={errorReporter}
      />
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Room load failed: Unable to load room.");
    expect(errorReporter).toHaveBeenCalledWith({
      message: "Unable to load room.",
      source: "room_load"
    } satisfies FrontendIssue);
  });

  it("redirects authenticated room access to invite redemption when membership is missing", async () => {
    render(
      <App
        apiClient={{
          baseUrl: "/api",
          updateProfile: vi.fn(async () => ({ displayName: "June", username: "June" })),
          redeemInvite: vi.fn(async () => ({ status: "redeemed" as const, communityId: "community-1" })),
          listCommunities: vi.fn(async () => ({ communities: [] })),
          listRooms: vi.fn(async () => ({
            community: { id: "community-1", slug: "default-community", name: "Default Community" },
            rooms: []
          })),
          listCommunityRooms: vi.fn(),
          getRoom: vi.fn(async () => {
            throw new ApiError("room access denied", 403);
          }),
          listRoomMessages: vi.fn(async () => ({ messages: [] }))
        }}
        bootstrapSession={() => Promise.resolve(authenticatedSession())}
        initialPathname="/rooms/main-lobby"
        realtimeClient={realtimeClient()}
      />
    );

    expect(await screen.findByRole("heading", { name: "Redeem invite" })).toBeInTheDocument();
    expect(screen.getByLabelText("Invite code")).toHaveValue("");
  });

  it("surfaces realtime failures in the application alert region", async () => {
    const errorReporter = vi.fn();
    render(
      <App
        apiClient={{
          baseUrl: "/api",
          updateProfile: vi.fn(),
          redeemInvite: vi.fn(),
          listCommunities: vi.fn(async () => ({ communities: [] })),
          listRooms: vi.fn(async () => ({
            community: { id: "community-1", slug: "default-community", name: "Default Community" },
            rooms: []
          })),
          listCommunityRooms: vi.fn(),
          getRoom: vi.fn(async () => ({
            community: { id: "community-1", slug: "default-community", name: "Default Community" },
            room: {
              slug: "main-hall",
              name: "Main Hall",
              kind: "permanent",
              isDefault: false,
              layoutVersion: 1,
              layout: {
                theme: "cozy-hall",
                backgroundAsset: "rooms/main-hall.png",
                avatarStyleSet: "soft-rounded",
                objectPack: "hall-furniture-v1",
                width: 1800,
                height: 1200,
                spawnPoints: [{ x: 240, y: 360 }],
                collision: [],
                teleports: []
              }
            }
          })),
          listRoomMessages: vi.fn(async () => ({ messages: [] }))
        }}
        bootstrapSession={() => Promise.resolve(authenticatedSession())}
        initialPathname="/rooms/main-hall"
        realtimeClient={{
          ...realtimeClient(),
          status: "error",
          error: "Realtime connection failed."
        }}
        errorReporter={errorReporter}
      />
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Realtime issue: Realtime connection failed.");
    expect(errorReporter).toHaveBeenCalledWith({
      message: "Realtime connection failed.",
      source: "realtime"
    } satisfies FrontendIssue);
  });

  it("renders not found for unknown routes", async () => {
    renderApp("/missing");

    expect(await screen.findByRole("heading", { name: "Not found" })).toBeInTheDocument();
  });

  it("keeps sidebar routing authoritative when realtime snapshots lag behind", async () => {
    const listeners: Array<(state: RealtimeClient["snapshot"] extends never ? never : any) => void> = [];
    const realtime = {
      ...realtimeClient(),
      subscribe: vi.fn((listener: (state: any) => void) => {
        listeners.push(listener);
        return () => undefined;
      }),
      connect: vi.fn(() => () => undefined)
    };

    const apiClient = {
      baseUrl: "/api",
      updateProfile: vi.fn(),
      redeemInvite: vi.fn(),
      listCommunities: vi.fn(async () => ({ communities: [] })),
      listRooms: vi.fn(),
      listCommunityRooms: vi.fn(),
      getRoom: vi.fn(async (roomSlug: string) => ({
        community: { id: "community-1", slug: "default-community", name: "Default Community" },
        room:
          roomSlug === "rooftop"
            ? {
                slug: "rooftop",
                name: "Rooftop",
                kind: "permanent",
                isDefault: false,
                layoutVersion: 1,
                layout: {
                  theme: "evening-rooftop",
                  backgroundAsset: "rooms/rooftop.png",
                  avatarStyleSet: "soft-rounded",
                  objectPack: "rooftop-furniture-v1",
                  width: 2200,
                  height: 1400,
                  spawnPoints: [{ x: 280, y: 380 }],
                  collision: [],
                  teleports: [{ label: "Lobby", targetRoom: "main-lobby" }]
                }
              }
            : {
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
      })),
      listRoomMessages: vi.fn(async () => ({ messages: [] }))
    };

    render(
      <App
        apiClient={apiClient}
        bootstrapSession={() => Promise.resolve(authenticatedSession())}
        initialPathname="/rooms/main-lobby"
        realtimeClient={realtime}
      />
    );

    expect(await screen.findByRole("heading", { name: "Main Lobby" })).toBeInTheDocument();

    await act(async () => {
      listeners[0]?.({
        status: "connected",
        snapshot: {
          room: { slug: "rooftop", name: "Rooftop", layoutVersion: 1 },
          self: {
            connectionId: "conn-1",
            userId: "user-1",
            email: "june@example.com",
            position: { x: 280, y: 380 }
          },
          occupants: [
            {
              connectionId: "conn-1",
              userId: "user-1",
              email: "june@example.com",
              position: { x: 280, y: 380 }
            }
          ]
        },
        messages: [],
        error: null
      });
    });

    expect(screen.getByRole("heading", { name: "Main Lobby" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Rooftop" })).not.toBeInTheDocument();
  });
});
