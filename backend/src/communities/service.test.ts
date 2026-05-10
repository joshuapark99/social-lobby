import { describe, expect, test } from "vitest";
import {
  communitySlugForName,
  createCommunityAccessService,
  type CommunityAccessStore,
  type CommunityMembership
} from "./service.js";

function store(memberships: CommunityMembership[]): CommunityAccessStore {
  return {
    createCommunity: async (input) => ({
      id: "created-community",
      slug: input.slug,
      name: input.name,
      viewerRole: "owner"
    }),
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
  test("normalizes community names into URL-safe slugs", async () => {
    const created: Array<{ name: string; slug: string }> = [];
    const service = createCommunityAccessService({
      store: {
        ...store([]),
        createCommunity: async (input) => {
          created.push({ name: input.name, slug: input.slug });
          return { id: "community-2", name: input.name, slug: input.slug, viewerRole: "owner" };
        }
      }
    });

    await expect(service.createCommunity({ actorUserId: "owner-1", name: "  Friday Game Night!  " })).resolves.toMatchObject({
      slug: "friday-game-night",
      viewerRole: "owner"
    });
    expect(created).toEqual([{ name: "Friday Game Night!", slug: "friday-game-night" }]);
  });

  test("rejects community names that create invalid or reserved slugs", () => {
    expect(() => communitySlugForName("API")).toThrow("reserved URL slug");
    expect(() => communitySlugForName("!!")).toThrow("at least three URL-safe characters");
  });

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
