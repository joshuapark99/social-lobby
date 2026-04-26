import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("renders the Social Lobby app shell", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Social Lobby" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Invite-only 2D rooms for live presence.")).toBeInTheDocument();
  });
});
