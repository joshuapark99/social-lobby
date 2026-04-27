import { describe, expect, test } from "vitest";
import { OidcProvider } from "./oidc.js";

describe("OidcProvider", () => {
  test("generates a generic OIDC authorization URL", () => {
    const provider = new OidcProvider({
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUrl: "http://localhost:8081/auth/callback",
      providerName: "google"
    });

    const authUrl = new URL(provider.authorizationUrl("state-token"));

    expect(authUrl.origin + authUrl.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(authUrl.searchParams.get("response_type")).toBe("code");
    expect(authUrl.searchParams.get("client_id")).toBe("client-id");
    expect(authUrl.searchParams.get("redirect_uri")).toBe("http://localhost:8081/auth/callback");
    expect(authUrl.searchParams.get("scope")).toBe("openid email profile");
    expect(authUrl.searchParams.get("state")).toBe("state-token");
  });
});
