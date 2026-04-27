import { describe, expect, it } from "vitest";

import { parseRoute } from "./routing";

describe("parseRoute", () => {
  it("parses login, lobby, invite, and room routes", () => {
    expect(parseRoute("/login")).toEqual({ name: "login" });
    expect(parseRoute("/lobby")).toEqual({ name: "lobby" });
    expect(parseRoute("/invite/abc-123")).toEqual({
      name: "invite",
      code: "abc-123",
    });
    expect(parseRoute("/rooms/main-hall")).toEqual({
      name: "room",
      roomId: "main-hall",
    });
  });

  it("normalizes the root route to lobby", () => {
    expect(parseRoute("/")).toEqual({ name: "lobby" });
  });

  it("returns not-found for missing dynamic segments and unknown paths", () => {
    expect(parseRoute("/invite")).toEqual({ name: "not-found" });
    expect(parseRoute("/rooms")).toEqual({ name: "not-found" });
    expect(parseRoute("/settings")).toEqual({ name: "not-found" });
  });
});
