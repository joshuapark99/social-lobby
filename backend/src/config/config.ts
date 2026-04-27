import { z } from "zod";

const envSchema = z.object({
  HTTP_ADDR: z.string().default(":8081"),
  DATABASE_URL: z.string().optional().default(""),
  TEST_DATABASE_URL: z.string().optional().default(""),
  SESSION_COOKIE_SECURE: z.string().optional().default("false"),
  OIDC_ISSUER_URL: z.string().optional().default(""),
  OIDC_AUTH_URL: z.string().default("https://accounts.google.com/o/oauth2/v2/auth"),
  OIDC_TOKEN_URL: z.string().default("https://oauth2.googleapis.com/token"),
  OIDC_USERINFO_URL: z.string().default("https://openidconnect.googleapis.com/v1/userinfo"),
  OIDC_CLIENT_ID: z.string().optional().default(""),
  OIDC_CLIENT_SECRET: z.string().optional().default(""),
  OIDC_REDIRECT_URL: z.string().optional().default("")
});

export type Config = {
  httpAddr: string;
  databaseUrl: string;
  testDatabaseUrl: string;
  sessionCookieSecure: boolean;
  oidc: {
    issuerUrl: string;
    authUrl: string;
    tokenUrl: string;
    userInfoUrl: string;
    clientId: string;
    clientSecret: string;
    redirectUrl: string;
    providerName: string;
  };
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.parse(env);

  return {
    httpAddr: parsed.HTTP_ADDR,
    databaseUrl: parsed.DATABASE_URL,
    testDatabaseUrl: parsed.TEST_DATABASE_URL,
    sessionCookieSecure: parsed.SESSION_COOKIE_SECURE === "true",
    oidc: {
      issuerUrl: parsed.OIDC_ISSUER_URL,
      authUrl: parsed.OIDC_AUTH_URL,
      tokenUrl: parsed.OIDC_TOKEN_URL,
      userInfoUrl: parsed.OIDC_USERINFO_URL,
      clientId: parsed.OIDC_CLIENT_ID,
      clientSecret: parsed.OIDC_CLIENT_SECRET,
      redirectUrl: parsed.OIDC_REDIRECT_URL,
      providerName: "google"
    }
  };
}

export function parseHttpAddr(httpAddr: string): { host: string; port: number } {
  if (httpAddr.startsWith(":")) {
    return { host: "0.0.0.0", port: Number.parseInt(httpAddr.slice(1), 10) };
  }

  const [host, port] = httpAddr.split(":");
  return { host: host || "0.0.0.0", port: Number.parseInt(port ?? "8081", 10) };
}
