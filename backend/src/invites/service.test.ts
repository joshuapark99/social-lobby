import { describe, expect, test } from "vitest";
import { createInviteService, type InviteStore } from "./service.js";

type MemoryInviteStore = InviteStore & {
  invite: {
    id: string;
    codeHash: string;
    communityId: string;
    targetEmail: string | null;
    maxRedemptions: number | null;
    redemptionCount: number;
    expiresAt: Date | null;
    revokedAt: Date | null;
  } | null;
  memberships: Set<string>;
};

function createMemoryStore(overrides: Partial<InviteStore> = {}): MemoryInviteStore {
  const store: MemoryInviteStore = {
    invite: null as {
      id: string;
      codeHash: string;
      communityId: string;
      targetEmail: string | null;
      maxRedemptions: number | null;
      redemptionCount: number;
      expiresAt: Date | null;
      revokedAt: Date | null;
    } | null,
    memberships: new Set<string>(),
    async defaultCommunity() {
      return { id: "community-1", slug: "default" };
    },
    async createInvite(input) {
      store.invite = {
        id: "invite-1",
        codeHash: input.codeHash,
        communityId: input.communityId,
        targetEmail: input.targetEmail,
        maxRedemptions: input.maxRedemptions,
        redemptionCount: 0,
        expiresAt: input.expiresAt,
        revokedAt: null
      };
      return store.invite;
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
    async revokeInvite(inviteId) {
      if (store.invite?.id === inviteId) store.invite.revokedAt = new Date("2026-04-27T00:00:00Z");
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
      targetEmail: "Friend@Example.com",
      maxRedemptions: 1,
      expiresAt: new Date("2026-05-01T00:00:00Z")
    });

    expect(invite.code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(store.invite?.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(store.invite?.targetEmail).toBe("friend@example.com");
    expect(store.invite?.codeHash).not.toBe(invite.code);
  });

  test("redeems a valid invite and creates default community membership", async () => {
    const store = createMemoryStore();
    const service = createInviteService({ store, now: () => new Date("2026-04-27T00:00:00Z") });
    const invite = await service.createInvite({ createdByUserId: "admin-1", maxRedemptions: 1 });

    await expect(service.redeemInvite({ code: invite.code, userId: "user-1", email: "person@example.com" })).resolves.toEqual({
      status: "redeemed",
      communityId: "community-1"
    });

    expect(store.memberships.has("user-1:community-1")).toBe(true);
    expect(store.invite?.redemptionCount).toBe(1);
  });

  test("is idempotent when the user is already a member", async () => {
    const store = createMemoryStore();
    const service = createInviteService({ store, now: () => new Date("2026-04-27T00:00:00Z") });
    const invite = await service.createInvite({ createdByUserId: "admin-1", maxRedemptions: 1 });
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
    const expired = await expiredService.createInvite({
      createdByUserId: "admin-1",
      expiresAt: new Date("2026-04-26T00:00:00Z")
    });
    await expect(expiredService.redeemInvite({ code: expired.code, userId: "user-1", email: "person@example.com" })).rejects.toThrow(
      "invite expired"
    );

    const revokedStore = createMemoryStore();
    const revokedService = createInviteService({ store: revokedStore, now: () => new Date("2026-04-27T00:00:00Z") });
    const revoked = await revokedService.createInvite({ createdByUserId: "admin-1" });
    if (revokedStore.invite) revokedStore.invite.revokedAt = new Date("2026-04-27T00:00:00Z");
    await expect(revokedService.redeemInvite({ code: revoked.code, userId: "user-1", email: "person@example.com" })).rejects.toThrow(
      "invite revoked"
    );

    const usedStore = createMemoryStore();
    const usedService = createInviteService({ store: usedStore, now: () => new Date("2026-04-27T00:00:00Z") });
    const used = await usedService.createInvite({ createdByUserId: "admin-1", maxRedemptions: 1 });
    if (usedStore.invite) usedStore.invite.redemptionCount = 1;
    await expect(usedService.redeemInvite({ code: used.code, userId: "user-2", email: "person@example.com" })).rejects.toThrow(
      "invite already used"
    );

    const emailStore = createMemoryStore();
    const emailService = createInviteService({ store: emailStore, now: () => new Date("2026-04-27T00:00:00Z") });
    const targeted = await emailService.createInvite({ createdByUserId: "admin-1", targetEmail: "friend@example.com" });
    await expect(emailService.redeemInvite({ code: targeted.code, userId: "user-1", email: "other@example.com" })).rejects.toThrow(
      "invite email mismatch"
    );
  });

  test("revokes an invite", async () => {
    const store = createMemoryStore();
    const service = createInviteService({ store, now: () => new Date("2026-04-27T00:00:00Z") });
    const invite = await service.createInvite({ createdByUserId: "admin-1" });

    await expect(service.revokeInvite(invite.id)).resolves.toEqual({ status: "revoked" });

    expect(store.invite?.revokedAt).toEqual(new Date("2026-04-27T00:00:00Z"));
  });
});
