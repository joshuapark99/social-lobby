import type { Config } from "../config/config.js";
import { OidcProvider } from "./oidc.js";
import type { AuthService } from "./service.js";
import { newSessionToken } from "./session.js";

export function defaultAuthService(config: Config): AuthService {
  const provider = new OidcProvider(config.oidc);
  return {
    async loginUrl() {
      const state = newSessionToken();
      return { redirectUrl: provider.authorizationUrl(state), state };
    },
    async completeLogin() {
      throw new Error("auth session store is not configured");
    },
    async session() {
      return null;
    },
    async updateProfile() {
      throw new Error("auth session store is not configured");
    },
    async logout() {
      return undefined;
    }
  };
}
