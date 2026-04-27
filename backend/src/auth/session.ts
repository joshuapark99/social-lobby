import { createHash, randomBytes } from "node:crypto";

export const defaultSessionTtlMs = 30 * 24 * 60 * 60 * 1000;

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  if (token === "") {
    throw new Error("session token is required");
  }
  return createHash("sha256").update(token).digest("hex");
}

export function isExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}
