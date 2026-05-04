import { describe, expect, test } from "vitest";
import { createCommunityAccessService, type CommunityAccessStore, type CommunityMembership } from "./service.js";

function store(memberships: CommunityMembership[]): CommunityAccessStore {
  return {
    defaultCommunity: async () => ({ id: "community-1", slug: "default-community", name: "Default Community" }),
    membershipForUser: async (userId, communityId) =>
      memberships.find((membership) => membership.userId === userId && membership.communityId === communityId) ?? null,
    listMembers: async (communityId) =>
      memberships
        .filter((membership) => membership.communityId === communityId)
        .map((membership) => ({
          userId: membership.userId,
          displayName: membership.userId,
          username: null,
          email: null,
          role: membership.role,
          status: membership.status
        })),
    updateMembershipRole: async (input) => {
      const membership = memberships.find(
        (candidate) =>
          candidate.userId === input.userId &&
          candidate.communityId === input.communityId &&
          candidate.status === "active" &&
          candidate.role !== "owner"
      );
      if (!membership) return null;
      membership.role = input.role;
      return membership;
    }
  };
}

describe("community access service", () => {
  test("allows owners and admins to manage a community", async () => {
    const service = createCommunityAccessService({
      store: store([
        { userId: "owner-1", communityId: "community-1", role: "owner", status: "active" },
        { userId: "admin-1", communityId: "community-1", role: "admin", status: "active" }
      ])
    });

    await expect(service.requireCommunityManagement({ actorUserId: "owner-1", communityId: "community-1" })).resolves.toBeUndefined();
    await expect(service.requireCommunityManagement({ actorUserId: "admin-1", communityId: "community-1" })).resolves.toBeUndefined();
  });

  test("rejects regular members from community management", async () => {
    const service = createCommunityAccessService({
      store: store([{ userId: "member-1", communityId: "community-1", role: "member", status: "active" }])
    });

    await expect(service.requireCommunityManagement({ actorUserId: "member-1", communityId: "community-1" })).rejects.toThrow(
      "community admin role required"
    );
  });

  test("allows only owners to assign admin and member roles", async () => {
    const memberships: CommunityMembership[] = [
      { userId: "owner-1", communityId: "community-1", role: "owner", status: "active" },
      { userId: "member-1", communityId: "community-1", role: "member", status: "active" }
    ];
    const service = createCommunityAccessService({ store: store(memberships) });

    await expect(
      service.assignCommunityRole({
        actorUserId: "owner-1",
        targetUserId: "member-1",
        communityId: "community-1",
        role: "admin"
      })
    ).resolves.toMatchObject({ userId: "member-1", role: "admin" });
  });

  test("lists active community members for any active member", async () => {
    const service = createCommunityAccessService({
      store: store([
        { userId: "viewer-1", communityId: "community-1", role: "member", status: "active" },
        { userId: "member-1", communityId: "community-1", role: "member", status: "active" }
      ])
    });

    await expect(service.listCommunityMembers({ actorUserId: "viewer-1", communityId: "community-1" })).resolves.toHaveLength(2);
  });

  test("rejects member lists for users outside the community", async () => {
    const service = createCommunityAccessService({
      store: store([{ userId: "member-1", communityId: "community-1", role: "member", status: "active" }])
    });

    await expect(service.listCommunityMembers({ actorUserId: "outsider-1", communityId: "community-1" })).rejects.toThrow(
      "community membership required"
    );
  });

  test("does not allow admins to assign community roles", async () => {
    const service = createCommunityAccessService({
      store: store([
        { userId: "admin-1", communityId: "community-1", role: "admin", status: "active" },
        { userId: "member-1", communityId: "community-1", role: "member", status: "active" }
      ])
    });

    await expect(
      service.assignCommunityRole({
        actorUserId: "admin-1",
        targetUserId: "member-1",
        communityId: "community-1",
        role: "admin"
      })
    ).rejects.toThrow("community owner role required");
  });
});
