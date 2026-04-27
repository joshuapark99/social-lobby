import { describe, expect, test } from "vitest";
import { hashSessionToken, isExpired, newSessionToken } from "./session.js";

describe("session tokens", () => {
  test("generates URL-safe random tokens and hashes them before storage", () => {
    const token = newSessionToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(hashSessionToken(token)).toMatch(/^[a-f0-9]{64}$/);
  });

  test("rejects empty tokens and treats exact expiry time as expired", () => {
    expect(() => hashSessionToken("")).toThrow("session token is required");
    expect(isExpired(new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z"))).toBe(true);
  });
});
