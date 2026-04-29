import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";
import type { SessionState } from "../auth/session";
import type { RealtimeClient } from "../realtime/realtimeClient";

function realtimeClient(): RealtimeClient {
  return {
    status: "idle",
    snapshot: null,
    error: null,
    connect: vi.fn(() => () => undefined),
    requestMovement: vi.fn(),
    subscribe: vi.fn(() => () => undefined)
  };
}

function renderApp(pathname: string, session: SessionState = { status: "anonymous" }) {
  const apiClient = {
    baseUrl: "/api",
    redeemInvite: vi.fn(async () => ({ status: "redeemed" as const, communityId: "community-1" })),
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
            teleports: [{ label: "Rooftop", targetRoom: "rooftop" }],
          },
        },
      ],
    })),
    getRoom: vi.fn(async () => ({
      community: { slug: "default-community", name: "Default Community" },
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
      redeemInvite: vi.fn(async () => ({ status: "redeemed" as const, communityId: "community-1" })),
      listRooms: vi.fn(),
      getRoom: vi.fn(),
    };
    render(
      <App
        apiClient={apiClient}
        bootstrapSession={() => Promise.resolve({ status: "authenticated", user: { displayName: "June" } })}
        initialPathname="/invite/friend-code"
        realtimeClient={realtimeClient()}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Redeem" }));

    await waitFor(() => expect(apiClient.redeemInvite).toHaveBeenCalledWith("friend-code"));
    expect(screen.getByText("Invite accepted.")).toBeInTheDocument();
  });

  it("renders the lobby route", async () => {
    renderApp("/lobby", { status: "authenticated", user: { displayName: "June" } });

    expect(await screen.findByRole("heading", { name: "Lobby" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Default Community" })).toBeInTheDocument();
    expect(screen.getByText("Main Lobby")).toBeInTheDocument();
    expect(screen.getByText("Signed in as June")).toBeInTheDocument();
  });

  it("renders the room route with canvas and chat regions", async () => {
    renderApp("/rooms/main-hall", { status: "authenticated", user: { displayName: "June" } });

    expect(await screen.findByRole("heading", { name: "Room: main-hall" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Room canvas" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Room chat" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Main Hall" })).toBeInTheDocument();
    expect(screen.getByText("Signed in as June")).toBeInTheDocument();
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
      redeemInvite: vi.fn(),
      listRooms: vi.fn(),
      getRoom: vi.fn(),
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

  it("renders not found for unknown routes", async () => {
    renderApp("/missing");

    expect(await screen.findByRole("heading", { name: "Not found" })).toBeInTheDocument();
  });
});
