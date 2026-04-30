import { describe, expect, it } from "vitest";

import { parseRoute } from "./routing";

describe("parseRoute", () => {
  it("parses welcome, lobby, invite, and room routes", () => {
    expect(parseRoute("/welcome")).toEqual({ name: "welcome" });
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

  it("normalizes the root route to welcome", () => {
    expect(parseRoute("/")).toEqual({ name: "welcome" });
  });

  it("returns not-found for removed login and unknown paths", () => {
    expect(parseRoute("/invite")).toEqual({ name: "invite", code: "" });
    expect(parseRoute("/rooms")).toEqual({ name: "not-found" });
    expect(parseRoute("/login")).toEqual({ name: "not-found" });
    expect(parseRoute("/settings")).toEqual({ name: "not-found" });
  });
});
