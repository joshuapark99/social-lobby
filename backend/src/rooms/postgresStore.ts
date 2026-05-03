import type { Pool } from "pg";
import type { RoomRow, RoomStore } from "./service.js";

export class PostgresRoomStore implements RoomStore {
  constructor(private readonly pool: Pool) {}

  async defaultCommunity(): Promise<{ id: string; slug: string; name: string }> {
    const result = await this.pool.query<{ id: string; slug: string; name: string }>(
      "SELECT id, slug, name FROM communities ORDER BY created_at ASC LIMIT 1"
    );
    const community = result.rows[0];
    if (!community) throw new Error("default community is not configured");
    return community;
  }

  async communitiesForUser(userId: string): Promise<Array<{ id: string; slug: string; name: string }>> {
    const result = await this.pool.query<{ id: string; slug: string; name: string }>(
      `SELECT communities.id, communities.slug, communities.name
       FROM communities
       INNER JOIN memberships ON memberships.community_id = communities.id
       WHERE memberships.user_id = $1
         AND memberships.status = 'active'
       ORDER BY memberships.created_at ASC, communities.name ASC`,
      [userId]
    );

    return result.rows;
  }

  async hasActiveMembership(userId: string, communityId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1
       FROM memberships
       WHERE user_id = $1
         AND community_id = $2
         AND status = 'active'
       LIMIT 1`,
      [userId, communityId]
    );

    return result.rowCount !== null && result.rowCount > 0;
  }

  async roomsForCommunity(communityId: string): Promise<RoomRow[]> {
    const result = await this.pool.query<RoomQueryRow>(
      `SELECT
         rooms.id,
         rooms.community_id,
         communities.slug AS community_slug,
         communities.name AS community_name,
         rooms.slug,
         rooms.name,
         rooms.kind,
         rooms.is_default,
         room_layouts.version AS layout_version,
         room_layouts.layout_json
       FROM rooms
       INNER JOIN communities ON communities.id = rooms.community_id
       INNER JOIN room_layouts ON room_layouts.id = rooms.layout_id
       WHERE rooms.community_id = $1
       ORDER BY rooms.is_default DESC, rooms.created_at ASC`,
      [communityId]
    );
    return result.rows.map(toRoomRow);
  }

  async communityBySlug(communitySlug: string): Promise<{ id: string; slug: string; name: string } | null> {
    const result = await this.pool.query<{ id: string; slug: string; name: string }>(
      "SELECT id, slug, name FROM communities WHERE slug = $1 LIMIT 1",
      [communitySlug]
    );

    return result.rows[0] ?? null;
  }

  async communityById(communityId: string): Promise<{ id: string; slug: string; name: string } | null> {
    const result = await this.pool.query<{ id: string; slug: string; name: string }>(
      "SELECT id, slug, name FROM communities WHERE id = $1 LIMIT 1",
      [communityId]
    );

    return result.rows[0] ?? null;
  }

  async roomBySlug(roomSlug: string): Promise<RoomRow | null> {
    const result = await this.pool.query<RoomQueryRow>(
      `SELECT
         rooms.id,
         rooms.community_id,
         communities.slug AS community_slug,
         communities.name AS community_name,
         rooms.slug,
         rooms.name,
         rooms.kind,
         rooms.is_default,
         room_layouts.version AS layout_version,
         room_layouts.layout_json
       FROM rooms
       INNER JOIN communities ON communities.id = rooms.community_id
       INNER JOIN room_layouts ON room_layouts.id = rooms.layout_id
       WHERE rooms.slug = $1
       ORDER BY rooms.created_at ASC
       LIMIT 1`,
      [roomSlug]
    );

    return result.rows[0] ? toRoomRow(result.rows[0]) : null;
  }

  async roomByCommunitySlug(communitySlug: string, roomSlug: string): Promise<RoomRow | null> {
    const result = await this.pool.query<RoomQueryRow>(
      `SELECT
         rooms.id,
         rooms.community_id,
         communities.slug AS community_slug,
         communities.name AS community_name,
         rooms.slug,
         rooms.name,
         rooms.kind,
         rooms.is_default,
         room_layouts.version AS layout_version,
         room_layouts.layout_json
       FROM rooms
       INNER JOIN communities ON communities.id = rooms.community_id
       INNER JOIN room_layouts ON room_layouts.id = rooms.layout_id
       WHERE communities.slug = $1
         AND rooms.slug = $2
       LIMIT 1`,
      [communitySlug, roomSlug]
    );

    return result.rows[0] ? toRoomRow(result.rows[0]) : null;
  }

  async roomByCommunityId(communityId: string, roomSlug: string): Promise<RoomRow | null> {
    const result = await this.pool.query<RoomQueryRow>(
      `SELECT
         rooms.id,
         rooms.community_id,
         communities.slug AS community_slug,
         communities.name AS community_name,
         rooms.slug,
         rooms.name,
         rooms.kind,
         rooms.is_default,
         room_layouts.version AS layout_version,
         room_layouts.layout_json
       FROM rooms
       INNER JOIN communities ON communities.id = rooms.community_id
       INNER JOIN room_layouts ON room_layouts.id = rooms.layout_id
       WHERE rooms.community_id = $1
         AND rooms.slug = $2
       LIMIT 1`,
      [communityId, roomSlug]
    );

    return result.rows[0] ? toRoomRow(result.rows[0]) : null;
  }
}

type RoomQueryRow = {
  id: string;
  community_id: string;
  community_slug: string;
  community_name: string;
  slug: string;
  name: string;
  kind: string;
  is_default: boolean;
  layout_version: number;
  layout_json: unknown;
};

function toRoomRow(row: RoomQueryRow): RoomRow {
  return {
    id: row.id,
    communityId: row.community_id,
    communitySlug: row.community_slug,
    communityName: row.community_name,
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    isDefault: row.is_default,
    layoutVersion: row.layout_version,
    layoutJson: row.layout_json
  };
}
