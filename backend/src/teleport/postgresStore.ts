import type { Pool } from "pg";
import type { TeleportStore } from "./service.js";

export class PostgresTeleportStore implements TeleportStore {
  constructor(private readonly pool: Pool) {}

  async findAccessibleRoom(input: { roomSlug: string; userId: string }): Promise<{ id: string } | null> {
    const result = await this.pool.query<{ id: string }>(
      `SELECT rooms.id
       FROM rooms
       INNER JOIN memberships ON memberships.community_id = rooms.community_id
       WHERE rooms.slug = $1
         AND memberships.user_id = $2
         AND memberships.status = 'active'
       ORDER BY rooms.created_at ASC
       LIMIT 1`,
      [input.roomSlug, input.userId]
    );

    return result.rows[0] ?? null;
  }

  async recordVisit(input: { userId: string; roomId: string }): Promise<void> {
    await this.pool.query(
      `INSERT INTO visited_rooms (user_id, room_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, room_id)
       DO UPDATE SET last_visited_at = now()`,
      [input.userId, input.roomId]
    );
  }
}
