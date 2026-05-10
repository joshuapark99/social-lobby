import { describe, expect, test } from "vitest";
import { createInviteService, type InviteStore } from "./service.js";

type MemoryInviteStore = InviteStore & {
  invite: {
        id: string;
        codeHash: string;
        communityId: string;
        createdByUserId: string | null;
        targetEmail: string | null;
        maxRedemptions: number | null;
        redemptionCount: number;
        expiresAt: Date | null;
        revokedAt: Date | null;
        createdAt: Date;
      } | null;
  memberships: Set<string>;
};

function createMemoryStore(overrides: Partial<InviteStore> = {}): MemoryInviteStore {
  const store: MemoryInviteStore = {
    invite: null as {
        id: string;
        codeHash: string;
        communityId: string;
        createdByUserId: string | null;
        targetEmail: string | null;
        maxRedemptions: number | null;
        redemptionCount: number;
        expiresAt: Date | null;
        revokedAt: Date | null;
        createdAt: Date;
      } | null,
    memberships: new Set<string>(),
    async createInvite(input) {
      store.invite = {
        id: "invite-1",
        codeHash: input.codeHash,
        communityId: input.communityId,
        createdByUserId: input.createdByUserId,
        targetEmail: input.targetEmail,
        maxRedemptions: input.maxRedemptions,
        redemptionCount: 0,
        expiresAt: input.expiresAt,
        revokedAt: null,
        createdAt: new Date("2026-04-27T00:00:00Z")
      };
      return store.invite;
    },
    async listInvites(communityId) {
      return store.invite?.communityId === communityId ? [store.invite] : [];
    },
    async findInviteByCodeHash(codeHash) {
      return store.invite?.codeHash === codeHash ? store.invite : null;
    },
    async hasMembership(userId, communityId) {
      return store.memberships.has(`${userId}:${communityId}`);
    },
    async createMembership(userId, communityId) {
      store.memberships.add(`${userId}:${communityId}`);
    },
    async incrementRedemption() {
      if (store.invite) store.invite.redemptionCount += 1;
    },
    async revokeInvite(input) {
      if (store.invite?.id === input.inviteId && (!input.communityId || store.invite.communityId === input.communityId)) {
        store.invite.revokedAt = new Date("2026-04-27T00:00:00Z");
      }
    },
    ...overrides
  };
  return store;
}

describe("createInviteService", () => {
  test("creates an invite record with a hashed generated code", async () => {
    const store = createMemoryStore();
    const service = createInviteService({ store, now: () => new Date("2026-04-27T00:00:00Z") });

    const invite = await service.createInvite({
      createdByUserId: "admin-1",
      communityId: "community-1",
      targetEmail: "Friend@Example.com",
      maxRedemptions: 1,
      expiresAt: new Date("2026-05-01T00:00:00Z")
    });

    expect(invite.code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(store.invite?.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(store.invite?.targetEmail).toBe("friend@example.com");
    expect(store.invite?.codeHash).not.toBe(invite.code);
  });

  test("defaults new invites to expire in two weeks", async () => {
    const store = createMemoryStore();
    const service = createInviteService({ store, now: () => new Date("2026-04-27T12:00:00Z") });

    const invite = await service.createInvite({ createdByUserId: "admin-1", communityId: "community-1" });

    expect(invite.expiresAt).toEqual(new Date("2026-05-11T12:00:00Z"));
    expect(store.invite?.expiresAt).toEqual(new Date("2026-05-11T12:00:00Z"));
  });

  test("rejects invalid invite management settings", async () => {
    const store = createMemoryStore();
    const service = createInviteService({ store, now: () => new Date("2026-04-27T12:00:00Z") });

    await expect(service.createInvite({ createdByUserId: "admin-1", communityId: "community-1", maxRedemptions: 0 })).rejects.toThrow(
      "invite max uses must be at least 1"
    );
    await expect(service.createInvite({ createdByUserId: "admin-1", communityId: "community-1", expiresAt: new Date("invalid") })).rejects.toThrow(
      "invite expiry is invalid"
    );
    await expect(
      service.createInvite({ createdByUserId: "admin-1", communityId: "community-1", expiresAt: new Date("2026-04-27T11:00:00Z") })
    ).rejects.toThrow(
      "invite expiry must be in the future"
    );
  });

  test("redeems a valid invite and creates default community membership", async () => {
    const store = createMemoryStore();
    const service = createInviteService({ store, now: () => new Date("2026-04-27T00:00:00Z") });
    const invite = await service.createInvite({ createdByUserId: "admin-1", communityId: "community-1", maxRedemptions: 1 });

    await expect(service.redeemInvite({ code: invite.code, userId: "user-1", email: "person@example.com" })).resolves.toEqual({
      status: "redeemed",
      communityId: "community-1"
    });

    expect(store.memberships.has("user-1:community-1")).toBe(true);
    expect(store.invite?.redemptionCount).toBe(1);
  });

  test("creates and lists community-scoped invites", async () => {
    const store = createMemoryStore();
    const service = createInviteService({ store, now: () => new Date("2026-04-27T00:00:00Z") });

    await service.createInvite({ createdByUserId: "admin-1", communityId: "community-2", maxRedemptions: 2 });

    expect(store.invite?.communityId).toBe("community-2");
    await expect(service.listInvites({ communityId: "community-2" })).resolves.toEqual({
      invites: [
        {
          id: "invite-1",
          communityId: "community-2",
          createdByUserId: "admin-1",
          targetEmail: null,
          maxRedemptions: 2,
          redemptionCount: 0,
          expiresAt: new Date("2026-05-11T00:00:00Z"),
          revokedAt: null,
          createdAt: new Date("2026-04-27T00:00:00Z"),
          status: "active"
        }
      ]
    });
  });

  test("is idempotent when the user is already a member", async () => {
    const store = createMemoryStore();
    const service = createInviteService({ store, now: () => new Date("2026-04-27T00:00:00Z") });
    const invite = await service.createInvite({ createdByUserId: "admin-1", communityId: "community-1", maxRedemptions: 1 });
    await service.redeemInvite({ code: invite.code, userId: "user-1", email: "person@example.com" });

    await expect(service.redeemInvite({ code: invite.code, userId: "user-1", email: "person@example.com" })).resolves.toEqual({
      status: "already-member",
      communityId: "community-1"
    });
    expect(store.invite?.redemptionCount).toBe(1);
  });

  test("rejects expired, revoked, already-used, and email-mismatched invites", async () => {
    const expiredStore = createMemoryStore();
    const expiredService = createInviteService({ store: expiredStore, now: () => new Date("2026-04-27T00:00:00Z") });
    const expired = await expiredService.createInvite({ createdByUserId: "admin-1", communityId: "community-1" });
    if (expiredStore.invite) expiredStore.invite.expiresAt = new Date("2026-04-26T00:00:00Z");
    await expect(expiredService.redeemInvite({ code: expired.code, userId: "user-1", email: "person@example.com" })).rejects.toThrow(
      "invite expired"
    );

    const revokedStore = createMemoryStore();
    const revokedService = createInviteService({ store: revokedStore, now: () => new Date("2026-04-27T00:00:00Z") });
    const revoked = await revokedService.createInvite({ createdByUserId: "admin-1", communityId: "community-1" });
    if (revokedStore.invite) revokedStore.invite.revokedAt = new Date("2026-04-27T00:00:00Z");
    await expect(revokedService.redeemInvite({ code: revoked.code, userId: "user-1", email: "person@example.com" })).rejects.toThrow(
      "invite revoked"
    );

    const usedStore = createMemoryStore();
    const usedService = createInviteService({ store: usedStore, now: () => new Date("2026-04-27T00:00:00Z") });
    const used = await usedService.createInvite({ createdByUserId: "admin-1", communityId: "community-1", maxRedemptions: 1 });
    if (usedStore.invite) usedStore.invite.redemptionCount = 1;
    await expect(usedService.redeemInvite({ code: used.code, userId: "user-2", email: "person@example.com" })).rejects.toThrow(
      "invite already used"
    );

    const emailStore = createMemoryStore();
    const emailService = createInviteService({ store: emailStore, now: () => new Date("2026-04-27T00:00:00Z") });
    const targeted = await emailService.createInvite({
      createdByUserId: "admin-1",
      communityId: "community-1",
      targetEmail: "friend@example.com"
    });
    await expect(emailService.redeemInvite({ code: targeted.code, userId: "user-1", email: "other@example.com" })).rejects.toThrow(
      "invite email mismatch"
    );
  });

  test("revokes an invite", async () => {
    const store = createMemoryStore();
    const service = createInviteService({ store, now: () => new Date("2026-04-27T00:00:00Z") });
    const invite = await service.createInvite({ createdByUserId: "admin-1", communityId: "community-1" });

    await expect(service.revokeInvite({ inviteId: invite.id, communityId: "community-1" })).resolves.toEqual({ status: "revoked" });

    expect(store.invite?.revokedAt).toEqual(new Date("2026-04-27T00:00:00Z"));
  });
});
