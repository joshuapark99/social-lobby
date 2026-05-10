import type { Pool } from "pg";
import type { InviteRecord, InviteStore } from "./service.js";

export class PostgresInviteStore implements InviteStore {
  constructor(private readonly pool: Pool) {}

  async createInvite(input: {
    codeHash: string;
    communityId: string;
    createdByUserId: string;
    targetEmail: string | null;
    maxRedemptions: number | null;
    expiresAt: Date | null;
  }): Promise<InviteRecord> {
    const result = await this.pool.query<InviteRow>(
      `INSERT INTO invites (community_id, code_hash, created_by_user_id, target_email, max_redemptions, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, code_hash, community_id, created_by_user_id, target_email, max_redemptions, redemption_count, expires_at, revoked_at, created_at`,
      [input.communityId, input.codeHash, input.createdByUserId, input.targetEmail, input.maxRedemptions, input.expiresAt]
    );
    return toInviteRecord(result.rows[0]);
  }

  async listInvites(communityId: string): Promise<InviteRecord[]> {
    const result = await this.pool.query<InviteRow>(
      `SELECT id, code_hash, community_id, created_by_user_id, target_email, max_redemptions, redemption_count, expires_at, revoked_at, created_at
       FROM invites
       WHERE community_id = $1
       ORDER BY created_at DESC`,
      [communityId]
    );
    return result.rows.map(toInviteRecord);
  }

  async findInviteByCodeHash(codeHash: string): Promise<InviteRecord | null> {
    const result = await this.pool.query<InviteRow>(
      `SELECT id, code_hash, community_id, created_by_user_id, target_email, max_redemptions, redemption_count, expires_at, revoked_at, created_at
       FROM invites
       WHERE code_hash = $1`,
      [codeHash]
    );
    return result.rows[0] ? toInviteRecord(result.rows[0]) : null;
  }

  async hasMembership(userId: string, communityId: string): Promise<boolean> {
    const result = await this.pool.query("SELECT 1 FROM memberships WHERE user_id = $1 AND community_id = $2 LIMIT 1", [
      userId,
      communityId
    ]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  async createMembership(userId: string, communityId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO memberships (user_id, community_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, community_id) DO NOTHING`,
      [userId, communityId]
    );
  }

  async incrementRedemption(inviteId: string): Promise<void> {
    await this.pool.query("UPDATE invites SET redemption_count = redemption_count + 1 WHERE id = $1", [inviteId]);
  }

  async revokeInvite(input: { inviteId: string; communityId?: string }): Promise<void> {
    await this.pool.query(
      `UPDATE invites
       SET revoked_at = now()
       WHERE id = $1
         AND ($2::uuid IS NULL OR community_id = $2::uuid)
         AND revoked_at IS NULL`,
      [input.inviteId, input.communityId ?? null]
    );
  }
}

type InviteRow = {
  id: string;
  code_hash: string;
  community_id: string;
  created_by_user_id: string | null;
  target_email: string | null;
  max_redemptions: number | null;
  redemption_count: number;
  expires_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
};

function toInviteRecord(row: InviteRow): InviteRecord {
  return {
    id: row.id,
    codeHash: row.code_hash,
    communityId: row.community_id,
    createdByUserId: row.created_by_user_id,
    targetEmail: row.target_email,
    maxRedemptions: row.max_redemptions,
    redemptionCount: row.redemption_count,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at
  };
}
