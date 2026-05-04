import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import { PostgresAuthStore } from "../auth/postgresStore.js";
import { hashSessionToken } from "../auth/session.js";
import { PostgresChatStore } from "../chat/postgresStore.js";
import { createChatService } from "../chat/service.js";
import { PostgresCommunityAccessStore } from "../communities/postgresStore.js";
import { createCommunityAccessService } from "../communities/service.js";
import { PostgresInviteStore } from "../invites/postgresStore.js";
import { createInviteService } from "../invites/service.js";
import { PostgresTeleportStore } from "../teleport/postgresStore.js";
import { prepareTestDatabase, withLockedTestDatabase, withTestPool } from "./testDatabase.js";

describe.sequential("postgres-backed integration paths", () => {
  test("persists session-backed identities", async () => {
    await withLockedTestDatabase(async () => {
      await prepareTestDatabase();

      await withTestPool(async (pool) => {
      const store = new PostgresAuthStore(pool);
      const sessionToken = "session-token";
      const expiresAt = new Date("2026-05-30T00:00:00Z");

      const userId = await store.findOrCreateUserByIdentity({
        provider: "google",
        subject: "subject-1",
        email: "person@example.com",
        name: "Person Example"
      });

      await store.createSession(userId, hashSessionToken(sessionToken), expiresAt);

      await expect(store.findIdentityBySessionHash(hashSessionToken(sessionToken), new Date("2026-04-30T00:00:00Z"))).resolves.toEqual({
        userId,
        provider: "google",
        subject: "subject-1",
        email: "person@example.com",
        name: "Person Example"
      });
      });
    });
  });

  test("redeems invites into default-community membership", async () => {
    await withLockedTestDatabase(async () => {
      await prepareTestDatabase();

      await withTestPool(async (pool) => {
      const admin = await insertUser(pool, { displayName: "Admin", email: "admin@example.com", subject: "admin-subject" });
      const member = await insertUser(pool, { displayName: "Member", email: "member@example.com", subject: "member-subject" });
      const service = createInviteService({
        store: new PostgresInviteStore(pool),
        now: () => new Date("2026-04-30T00:00:00Z")
      });

      const invite = await service.createInvite({
        createdByUserId: admin.id,
        maxRedemptions: 1
      });

      await expect(service.redeemInvite({ code: invite.code, userId: member.id, email: member.email })).resolves.toEqual({
        status: "redeemed",
        communityId: "00000000-0000-4000-8000-000000000001"
      });

      const membershipCount = await pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM memberships WHERE user_id = $1 AND community_id = $2",
        [member.id, "00000000-0000-4000-8000-000000000001"]
      );
      const redemptionCount = await pool.query<{ redemption_count: number }>("SELECT redemption_count FROM invites WHERE id = $1", [
        invite.id
      ]);

      expect(membershipCount.rows[0]?.count).toBe("1");
      expect(redemptionCount.rows[0]?.redemption_count).toBe(1);
      });
    });
  });

  test("persists community owner and admin role assignments", async () => {
    await withLockedTestDatabase(async () => {
      await prepareTestDatabase();

      await withTestPool(async (pool) => {
        const owner = await insertUser(pool, { displayName: "Owner", email: "owner@example.com", subject: "owner-subject" });
        const member = await insertUser(pool, { displayName: "Member", email: "role-member@example.com", subject: "role-member-subject" });
        await addMembership(pool, owner.id, undefined, "owner");
        await addMembership(pool, member.id);

        const service = createCommunityAccessService({ store: new PostgresCommunityAccessStore(pool) });

        await expect(
          service.assignCommunityRole({
            actorUserId: owner.id,
            targetUserId: member.id,
            communityId: "00000000-0000-4000-8000-000000000001",
            role: "admin"
          })
        ).resolves.toMatchObject({ userId: member.id, role: "admin" });

        await expect(
          service.requireCommunityManagement({
            actorUserId: member.id,
            communityId: "00000000-0000-4000-8000-000000000001"
          })
        ).resolves.toBeUndefined();
      });
    });
  });

  test("persists room chat history for active community members", async () => {
    await withLockedTestDatabase(async () => {
      await prepareTestDatabase();

      await withTestPool(async (pool) => {
      const member = await insertUser(pool, { displayName: "Chatter", email: "chat@example.com", subject: "chat-subject" });
      await addMembership(pool, member.id);
      const service = createChatService({ store: new PostgresChatStore(pool) });

      const message = await service.createMessage({
        roomSlug: "main-lobby",
        userId: member.id,
        body: "  Hello room  "
      });

      const history = await service.listRecentMessages({
        roomSlug: "main-lobby",
        userId: member.id
      });

      expect(message.body).toBe("Hello room");
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        id: message.id,
        roomSlug: "main-lobby",
        userId: member.id,
        userName: "Chatter",
        body: "Hello room"
      });
      });
    });
  });

  test("upserts visited-room records for accessible rooms", async () => {
    await withLockedTestDatabase(async () => {
      await prepareTestDatabase();

      await withTestPool(async (pool) => {
      const member = await insertUser(pool, { displayName: "Traveler", email: "travel@example.com", subject: "travel-subject" });
      await addMembership(pool, member.id);
      const store = new PostgresTeleportStore(pool);

      const room = await store.findAccessibleRoom({ roomSlug: "rooftop", userId: member.id });
      expect(room).not.toBeNull();

      await store.recordVisit({ userId: member.id, roomId: room!.id });
      await store.recordVisit({ userId: member.id, roomId: room!.id });

      const visitCount = await pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM visited_rooms WHERE user_id = $1 AND room_id = $2",
        [member.id, room!.id]
      );

      expect(visitCount.rows[0]?.count).toBe("1");
      });
    });
  });
});

async function insertUser(
  pool: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ id: string }> }> },
  input: { displayName: string; email: string; subject: string }
): Promise<{ id: string; email: string }> {
  const userId = randomUUID();

  await pool.query("INSERT INTO users (id, display_name) VALUES ($1, $2)", [userId, input.displayName]);
  await pool.query(
    `INSERT INTO linked_identities (user_id, provider, provider_subject, email)
     VALUES ($1, 'google', $2, $3)`,
    [userId, input.subject, input.email]
  );

  return { id: userId, email: input.email };
}

async function addMembership(
  pool: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
  userId: string,
  communityId = "00000000-0000-4000-8000-000000000001",
  role = "member"
): Promise<void> {
  await pool.query(
    `INSERT INTO memberships (user_id, community_id, role, status)
     VALUES ($1, $2, $3, 'active')`,
    [userId, communityId, role]
  );
}
