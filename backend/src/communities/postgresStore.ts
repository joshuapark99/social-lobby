import type { Pool } from "pg";
import type { CommunityAccessStore, CommunityMember, CommunityMembership, CommunityRole } from "./service.js";

export class PostgresCommunityAccessStore implements CommunityAccessStore {
  constructor(private readonly pool: Pool) {}

  async defaultCommunity(): Promise<{ id: string; slug: string; name: string }> {
    const result = await this.pool.query<{ id: string; slug: string; name: string }>(
      "SELECT id, slug, name FROM communities ORDER BY created_at ASC LIMIT 1"
    );
    const community = result.rows[0];
    if (!community) throw new Error("default community is not configured");
    return community;
  }

  async membershipForUser(userId: string, communityId: string): Promise<CommunityMembership | null> {
    const result = await this.pool.query<MembershipRow>(
      `SELECT user_id, community_id, role, status
       FROM memberships
       WHERE user_id = $1
         AND community_id = $2
       LIMIT 1`,
      [userId, communityId]
    );

    return result.rows[0] ? toMembership(result.rows[0]) : null;
  }

  async listMembers(communityId: string): Promise<CommunityMember[]> {
    const result = await this.pool.query<MemberRow>(
      `SELECT
         memberships.user_id,
         users.display_name,
         users.username,
         linked_identities.email,
         memberships.role,
         memberships.status
       FROM memberships
       INNER JOIN users ON users.id = memberships.user_id
       LEFT JOIN LATERAL (
         SELECT email
         FROM linked_identities
         WHERE linked_identities.user_id = users.id
         ORDER BY linked_identities.created_at ASC
         LIMIT 1
       ) linked_identities ON true
       WHERE memberships.community_id = $1
         AND memberships.status = 'active'
       ORDER BY
         CASE memberships.role
           WHEN 'owner' THEN 0
           WHEN 'admin' THEN 1
           ELSE 2
         END,
         lower(users.display_name) ASC`,
      [communityId]
    );

    return result.rows.map(toMember);
  }

  async updateMembershipRole(input: {
    userId: string;
    communityId: string;
    role: Exclude<CommunityRole, "owner">;
  }): Promise<CommunityMembership | null> {
    const result = await this.pool.query<MembershipRow>(
      `UPDATE memberships
       SET role = $3
       WHERE user_id = $1
         AND community_id = $2
         AND status = 'active'
         AND role <> 'owner'
       RETURNING user_id, community_id, role, status`,
      [input.userId, input.communityId, input.role]
    );

    return result.rows[0] ? toMembership(result.rows[0]) : null;
  }
}

type MembershipRow = {
  user_id: string;
  community_id: string;
  role: CommunityRole;
  status: string;
};

type MemberRow = MembershipRow & {
  display_name: string;
  username: string | null;
  email: string | null;
};

function toMembership(row: MembershipRow): CommunityMembership {
  return {
    userId: row.user_id,
    communityId: row.community_id,
    role: row.role,
    status: row.status
  };
}

function toMember(row: MemberRow): CommunityMember {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    username: row.username,
    email: row.email,
    role: row.role,
    status: row.status
  };
}
