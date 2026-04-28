import { afterEach, describe, expect, it, vi } from "vitest";
import { bootstrapSession } from "./session";

describe("bootstrapSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns authenticated state when the backend session endpoint succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ email: "person@example.com" })
      }))
    );

    await expect(bootstrapSession()).resolves.toEqual({
      status: "authenticated",
      user: { displayName: "person@example.com" }
    });
    expect(fetch).toHaveBeenCalledWith("/api/auth/session", { credentials: "include" });
  });

  it("returns anonymous state when the backend session endpoint rejects with unauthorized", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401
      }))
    );

    await expect(bootstrapSession()).resolves.toEqual({ status: "anonymous" });
  });

  it("throws when the backend session check fails unexpectedly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503
      }))
    );

    await expect(bootstrapSession()).rejects.toThrow("Unable to check session.");
  });
});
