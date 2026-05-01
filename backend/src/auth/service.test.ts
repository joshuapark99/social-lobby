import { describe, expect, test, vi } from "vitest";
import { createAuthService, normalizeUsername, type AuthStore } from "./service.js";
import type { OidcIdentity } from "./oidc.js";

describe("createAuthService", () => {
  test("exchanges OIDC identity, persists hashed session, and returns CSRF token", async () => {
    const identity: OidcIdentity = { provider: "google", subject: "subject", email: "person@example.com" };
    const provider = {
      authorizationUrl: vi.fn((state: string) => `https://provider.example/auth?state=${state}`),
      exchange: vi.fn(async () => identity)
    };
    const store: AuthStore = {
      findOrCreateUserByIdentity: vi.fn(async () => "user-1"),
      createSession: vi.fn(async () => undefined),
      findIdentityBySessionHash: vi.fn(async () => identity),
      updateProfile: vi.fn(async ({ username }) => ({ username, displayName: username })),
      revokeSession: vi.fn(async () => undefined)
    };
    const service = createAuthService({
      provider,
      store,
      now: () => new Date("2026-01-01T00:00:00Z")
    });

    const login = await service.loginUrl();
    const callback = await service.completeLogin("code", "state");
    const session = await service.session(callback.sessionToken);
    await service.logout(callback.sessionToken);

    expect(login.redirectUrl).toContain("state=");
    expect(store.findOrCreateUserByIdentity).toHaveBeenCalledWith(identity);
    expect(store.createSession).toHaveBeenCalledWith("user-1", expect.stringMatching(/^[a-f0-9]{64}$/), new Date("2026-01-31T00:00:00Z"));
    expect(callback.identity).toEqual(identity);
    expect(callback.sessionToken).not.toEqual(callback.csrfToken);
    expect(session).toEqual(identity);
    expect(store.revokeSession).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/));
  });

  test("normalizes and validates usernames before updating profile", async () => {
    const provider = {
      authorizationUrl: vi.fn(),
      exchange: vi.fn()
    };
    const store: AuthStore = {
      findOrCreateUserByIdentity: vi.fn(),
      createSession: vi.fn(),
      findIdentityBySessionHash: vi.fn(),
      updateProfile: vi.fn(async ({ username }) => ({ username, displayName: username })),
      revokeSession: vi.fn()
    };
    const service = createAuthService({ provider, store });

    await expect(service.updateProfile({ userId: "user-1", username: "  June_Park  " })).resolves.toEqual({
      username: "June_Park",
      displayName: "June_Park"
    });
    expect(store.updateProfile).toHaveBeenCalledWith({
      userId: "user-1",
      username: "June_Park",
      displayName: "June_Park"
    });
    expect(() => normalizeUsername("no")).toThrow("username must be 3-24 characters using letters, numbers, or underscores");
  });
});
