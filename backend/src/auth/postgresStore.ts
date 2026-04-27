import type { Pool } from "pg";
import type { AuthStore, OidcIdentity } from "./service.js";
import { validateIdentity } from "./oidc.js";

export class PostgresAuthStore implements AuthStore {
  constructor(private readonly pool: Pool) {}

  async findOrCreateUserByIdentity(identity: OidcIdentity): Promise<string> {
    validateIdentity(identity);
    const existing = await this.pool.query<{ user_id: string }>(
      "SELECT user_id FROM linked_identities WHERE provider = $1 AND provider_subject = $2",
      [identity.provider, identity.subject]
    );
    if (existing.rows[0]) return existing.rows[0].user_id;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const user = await client.query<{ id: string }>("INSERT INTO users (display_name) VALUES ($1) RETURNING id", [
        identity.name || identity.email
      ]);
      const userId = user.rows[0].id;
      const linkedIdentity = await client.query<{ user_id: string }>(
        `INSERT INTO linked_identities (user_id, provider, provider_subject, email)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (provider, provider_subject) DO NOTHING
         RETURNING user_id`,
        [userId, identity.provider, identity.subject, identity.email]
      );
      if (!linkedIdentity.rows[0]) {
        await client.query("ROLLBACK");
        const winner = await this.pool.query<{ user_id: string }>(
          "SELECT user_id FROM linked_identities WHERE provider = $1 AND provider_subject = $2",
          [identity.provider, identity.subject]
        );
        if (!winner.rows[0]) {
          throw new Error("linked identity conflict could not be resolved");
        }
        return winner.rows[0].user_id;
      }
      await client.query("COMMIT");
      return userId;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.pool.query("INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)", [
      userId,
      tokenHash,
      expiresAt
    ]);
  }

  async findIdentityBySessionHash(tokenHash: string, now: Date): Promise<OidcIdentity | null> {
    const result = await this.pool.query<{
      provider: string;
      provider_subject: string;
      email: string;
      display_name: string;
    }>(
      `SELECT li.provider, li.provider_subject, li.email, u.display_name
       FROM user_sessions us
       JOIN users u ON u.id = us.user_id
       JOIN linked_identities li ON li.user_id = u.id
       WHERE us.token_hash = $1
         AND us.revoked_at IS NULL
         AND us.expires_at > $2
       ORDER BY li.created_at ASC
       LIMIT 1`,
      [tokenHash, now]
    );
    const row = result.rows[0];
    if (!row) return null;
    return { provider: row.provider, subject: row.provider_subject, email: row.email, name: row.display_name };
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await this.pool.query("UPDATE user_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [
      tokenHash
    ]);
  }
}
