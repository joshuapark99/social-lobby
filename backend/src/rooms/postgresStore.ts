import type { Pool } from "pg";
import type { CommunityRole } from "../communities/service.js";
import type { RoomLayout } from "../layouts/layout.js";
import type { CommunitySummary, RoomRow, RoomStore } from "./service.js";

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

  async communitiesForUser(userId: string): Promise<CommunitySummary[]> {
    const result = await this.pool.query<{ id: string; slug: string; name: string; viewer_role: CommunityRole }>(
      `SELECT communities.id, communities.slug, communities.name, memberships.role AS viewer_role
       FROM communities
       INNER JOIN memberships ON memberships.community_id = communities.id
       WHERE memberships.user_id = $1
         AND memberships.status = 'active'
       ORDER BY memberships.created_at ASC, communities.name ASC`,
      [userId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      viewerRole: row.viewer_role
    }));
  }

  async activeMembershipRole(userId: string, communityId: string): Promise<CommunityRole | null> {
    const result = await this.pool.query<{ role: CommunityRole }>(
      `SELECT role
       FROM memberships
       WHERE user_id = $1
         AND community_id = $2
         AND status = 'active'
       LIMIT 1`,
      [userId, communityId]
    );

    return result.rows[0]?.role ?? null;
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

  async createRoom(input: { communityId: string; slug: string; name: string; layout: RoomLayout }): Promise<RoomRow> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const layoutResult = await client.query<{ id: string }>(
        `INSERT INTO room_layouts (slug, version, layout_json)
         VALUES ($1, 1, $2::jsonb)
         RETURNING id`,
        [`${input.communityId}:${input.slug}`, JSON.stringify(input.layout)]
      );
      const layoutId = layoutResult.rows[0]?.id;
      if (!layoutId) throw new Error("room layout was not created");

      const roomResult = await client.query<RoomQueryRow>(
        `INSERT INTO rooms (community_id, layout_id, slug, name, kind, is_default)
         VALUES ($1, $2, $3, $4, 'permanent', false)
         RETURNING
           rooms.id,
           rooms.community_id,
           (SELECT slug FROM communities WHERE communities.id = rooms.community_id) AS community_slug,
           (SELECT name FROM communities WHERE communities.id = rooms.community_id) AS community_name,
           rooms.slug,
           rooms.name,
           rooms.kind,
           rooms.is_default,
           1 AS layout_version,
           $5::jsonb AS layout_json`,
        [input.communityId, layoutId, input.slug, input.name, JSON.stringify(input.layout)]
      );
      const room = roomResult.rows[0];
      if (!room) throw new Error("room was not created");

      await client.query("COMMIT");
      return toRoomRow(room);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateRoomLayout(input: { roomId: string; layout: RoomLayout }): Promise<RoomRow> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const currentResult = await client.query<{ layout_slug: string; version: number }>(
        `SELECT room_layouts.slug AS layout_slug, room_layouts.version
         FROM rooms
         INNER JOIN room_layouts ON room_layouts.id = rooms.layout_id
         WHERE rooms.id = $1
         LIMIT 1`,
        [input.roomId]
      );
      const currentLayout = currentResult.rows[0];
      if (!currentLayout) throw new Error("room not found");

      const targetLayoutSlug = currentLayout.layout_slug.startsWith("room:") ? currentLayout.layout_slug : `room:${input.roomId}`;
      const versionResult = await client.query<{ version: number | null }>(
        "SELECT max(version) AS version FROM room_layouts WHERE slug = $1",
        [targetLayoutSlug]
      );
      const nextVersion = (versionResult.rows[0]?.version ?? currentLayout.version) + 1;
      const layoutResult = await client.query<{ id: string }>(
        `INSERT INTO room_layouts (slug, version, layout_json)
         VALUES ($1, $2, $3::jsonb)
         RETURNING id`,
        [targetLayoutSlug, nextVersion, JSON.stringify(input.layout)]
      );
      const layoutId = layoutResult.rows[0]?.id;
      if (!layoutId) throw new Error("room layout was not created");

      const roomResult = await client.query<RoomQueryRow>(
        `UPDATE rooms
         SET layout_id = $2,
             updated_at = now()
         WHERE rooms.id = $1
         RETURNING
           rooms.id,
           rooms.community_id,
           (SELECT slug FROM communities WHERE communities.id = rooms.community_id) AS community_slug,
           (SELECT name FROM communities WHERE communities.id = rooms.community_id) AS community_name,
           rooms.slug,
           rooms.name,
           rooms.kind,
           rooms.is_default,
           $3::integer AS layout_version,
           $4::jsonb AS layout_json`,
        [input.roomId, layoutId, nextVersion, JSON.stringify(input.layout)]
      );
      const room = roomResult.rows[0];
      if (!room) throw new Error("room not found");

      await client.query("COMMIT");
      return toRoomRow(room);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
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
