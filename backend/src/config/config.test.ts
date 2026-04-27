import { describe, expect, test } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  test("uses development defaults for local backend configuration", () => {
    const config = loadConfig({});

    expect(config.httpAddr).toBe(":8081");
    expect(config.sessionCookieSecure).toBe(false);
    expect(config.oidc.authUrl).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(config.oidc.tokenUrl).toBe("https://oauth2.googleapis.com/token");
    expect(config.oidc.userInfoUrl).toBe("https://openidconnect.googleapis.com/v1/userinfo");
  });

  test("parses environment overrides", () => {
    const config = loadConfig({
      HTTP_ADDR: ":9090",
      DATABASE_URL: "postgres://app",
      TEST_DATABASE_URL: "postgres://test",
      SESSION_COOKIE_SECURE: "true",
      OIDC_CLIENT_ID: "client-id",
      OIDC_CLIENT_SECRET: "client-secret",
      OIDC_REDIRECT_URL: "http://localhost:9090/auth/callback"
    });

    expect(config.httpAddr).toBe(":9090");
    expect(config.databaseUrl).toBe("postgres://app");
    expect(config.testDatabaseUrl).toBe("postgres://test");
    expect(config.sessionCookieSecure).toBe(true);
    expect(config.oidc.clientId).toBe("client-id");
    expect(config.oidc.clientSecret).toBe("client-secret");
    expect(config.oidc.redirectUrl).toBe("http://localhost:9090/auth/callback");
  });
});
