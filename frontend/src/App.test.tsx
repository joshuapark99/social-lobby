import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";
import type { SessionState } from "./session";

function renderApp(pathname: string, session: SessionState = { status: "anonymous" }) {
  return render(
    <App
      apiClient={{ baseUrl: "/api" }}
      bootstrapSession={() => Promise.resolve(session)}
      initialPathname={pathname}
      realtimeClient={{ status: "idle" }}
    />,
  );
}

describe("App", () => {
  it("renders the login route", async () => {
    renderApp("/login");

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByText("Continue with Google to enter the lobby.")).toBeInTheDocument();
  });

  it("renders the invite redemption route", async () => {
    renderApp("/invite/friend-code");

    expect(await screen.findByRole("heading", { name: "Redeem invite" })).toBeInTheDocument();
    expect(screen.getByText("Invite code: friend-code")).toBeInTheDocument();
  });

  it("renders the lobby route", async () => {
    renderApp("/lobby");

    expect(await screen.findByRole("heading", { name: "Lobby" })).toBeInTheDocument();
    expect(screen.getByText("Room list placeholder")).toBeInTheDocument();
  });

  it("renders the room route with canvas and chat regions", async () => {
    renderApp("/rooms/main-hall", { status: "authenticated", user: { displayName: "June" } });

    expect(await screen.findByRole("heading", { name: "Room: main-hall" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Room canvas" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Room chat" })).toBeInTheDocument();
    expect(screen.getByText("Signed in as June")).toBeInTheDocument();
  });

  it("renders session bootstrap loading then anonymous state", async () => {
    renderApp("/lobby");

    expect(screen.getByText("Checking session...")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Not signed in")).toBeInTheDocument();
    });
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
