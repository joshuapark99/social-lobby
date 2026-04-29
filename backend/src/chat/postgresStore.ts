import type { Pool } from "pg";
import type { ChatStore, RoomChatMessage } from "./service.js";

export class PostgresChatStore implements ChatStore {
  constructor(private readonly pool: Pool) {}

  async findAccessibleRoom(input: { roomSlug: string; userId: string }): Promise<{ id: string; slug: string } | null> {
    const result = await this.pool.query<{ id: string; slug: string }>(
      `SELECT rooms.id, rooms.slug
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

  async listRecentMessages(input: { roomId: string; limit: number }): Promise<RoomChatMessage[]> {
    const result = await this.pool.query<MessageRow>(
      `SELECT room_messages.id, rooms.slug AS room_slug, room_messages.user_id, users.display_name AS user_name, room_messages.body, room_messages.created_at
       FROM room_messages
       INNER JOIN rooms ON rooms.id = room_messages.room_id
       INNER JOIN users ON users.id = room_messages.user_id
       WHERE room_messages.room_id = $1
       ORDER BY room_messages.created_at DESC
       LIMIT $2`,
      [input.roomId, input.limit]
    );

    return result.rows.map(toRoomChatMessage);
  }

  async createMessage(input: { roomId: string; roomSlug: string; userId: string; body: string }): Promise<RoomChatMessage> {
    const result = await this.pool.query<MessageRow>(
      `INSERT INTO room_messages (room_id, user_id, body)
       VALUES ($1, $2, $3)
       RETURNING id,
                 $4::text AS room_slug,
                 user_id,
                 (SELECT display_name FROM users WHERE users.id = room_messages.user_id) AS user_name,
                 body,
                 created_at`,
      [input.roomId, input.userId, input.body, input.roomSlug]
    );

    return toRoomChatMessage(result.rows[0]);
  }
}

type MessageRow = {
  id: string;
  room_slug: string;
  user_id: string;
  user_name: string;
  body: string;
  created_at: Date;
};

function toRoomChatMessage(row: MessageRow): RoomChatMessage {
  return {
    id: row.id,
    roomSlug: row.room_slug,
    userId: row.user_id,
    userName: row.user_name,
    body: row.body,
    createdAt: row.created_at.toISOString()
  };
}
