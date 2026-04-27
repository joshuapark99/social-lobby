import type { OidcIdentity } from "./oidc.js";
import { validateIdentity } from "./oidc.js";
import { defaultSessionTtlMs, hashSessionToken, newSessionToken } from "./session.js";

export type { OidcIdentity };

export type AuthStore = {
  findOrCreateUserByIdentity(identity: OidcIdentity): Promise<string>;
  createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  findIdentityBySessionHash(tokenHash: string, now: Date): Promise<OidcIdentity | null>;
  revokeSession(tokenHash: string): Promise<void>;
};

export type AuthProvider = {
  authorizationUrl(state: string): string;
  exchange(code: string): Promise<OidcIdentity>;
};

export type AuthService = {
  loginUrl(): Promise<{ redirectUrl: string; state: string }>;
  completeLogin(code: string, state: string): Promise<{
    identity: OidcIdentity;
    sessionToken: string;
    csrfToken: string;
  }>;
  session(sessionToken: string): Promise<OidcIdentity | null>;
  logout(sessionToken: string): Promise<void>;
};

export function createAuthService(options: {
  provider: AuthProvider;
  store: AuthStore;
  now?: () => Date;
}): AuthService {
  const now = options.now ?? (() => new Date());

  return {
    async loginUrl() {
      const state = newSessionToken();
      return { redirectUrl: options.provider.authorizationUrl(state), state };
    },
    async completeLogin(code: string) {
      const identity = await options.provider.exchange(code);
      validateIdentity(identity);
      const userId = await options.store.findOrCreateUserByIdentity(identity);
      const sessionToken = newSessionToken();
      await options.store.createSession(userId, hashSessionToken(sessionToken), new Date(now().getTime() + defaultSessionTtlMs));
      return { identity, sessionToken, csrfToken: newSessionToken() };
    },
    async session(sessionToken: string) {
      return options.store.findIdentityBySessionHash(hashSessionToken(sessionToken), now());
    },
    async logout(sessionToken: string) {
      await options.store.revokeSession(hashSessionToken(sessionToken));
    }
  };
}

export function disabledAuthService(): AuthService {
  return {
    async loginUrl() {
      throw new Error("auth is not configured");
    },
    async completeLogin() {
      throw new Error("auth is not configured");
    },
    async session() {
      return null;
    },
    async logout() {
      return undefined;
    }
  };
}
