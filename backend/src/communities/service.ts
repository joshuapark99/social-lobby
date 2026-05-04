export const communityRoles = ["member", "admin", "owner"] as const;

export type CommunityRole = (typeof communityRoles)[number];

export type CommunityMembership = {
  userId: string;
  communityId: string;
  role: CommunityRole;
  status: "active" | string;
};

export type CommunityMember = {
  userId: string;
  displayName: string;
  username: string | null;
  email: string | null;
  role: CommunityRole;
  status: string;
};

export type CommunityAccessStore = {
  defaultCommunity(): Promise<{ id: string; slug: string; name: string }>;
  membershipForUser(userId: string, communityId: string): Promise<CommunityMembership | null>;
  listMembers(communityId: string): Promise<CommunityMember[]>;
  updateMembershipRole(input: {
    userId: string;
    communityId: string;
    role: Exclude<CommunityRole, "owner">;
  }): Promise<CommunityMembership | null>;
};

export type CommunityAccessService = {
  requireCommunityManagement(input: { actorUserId: string; communityId: string }): Promise<void>;
  requireDefaultCommunityManagement(actorUserId: string): Promise<{ id: string; slug: string; name: string }>;
  listCommunityMembers(input: { actorUserId: string; communityId: string }): Promise<CommunityMember[]>;
  assignCommunityRole(input: {
    actorUserId: string;
    targetUserId: string;
    communityId: string;
    role: Exclude<CommunityRole, "owner">;
  }): Promise<CommunityMembership>;
};

export class CommunityAccessError extends Error {
  constructor(message = "community access denied") {
    super(message);
    this.name = "CommunityAccessError";
  }
}

export function createCommunityAccessService(options: { store: CommunityAccessStore }): CommunityAccessService {
  async function requireActiveMembership(input: { actorUserId: string; communityId: string }): Promise<CommunityMembership> {
    const membership = await options.store.membershipForUser(input.actorUserId, input.communityId);
    if (!membership || membership.status !== "active") {
      throw new CommunityAccessError("community membership required");
    }
    return membership;
  }

  async function requireCommunityManagement(input: { actorUserId: string; communityId: string }): Promise<void> {
    const membership = await requireActiveMembership(input);
    if (!canManageCommunity(membership.role)) {
      throw new CommunityAccessError("community admin role required");
    }
  }

  return {
    requireCommunityManagement,
    async requireDefaultCommunityManagement(actorUserId) {
      const community = await options.store.defaultCommunity();
      await requireCommunityManagement({ actorUserId, communityId: community.id });
      return community;
    },
    async listCommunityMembers(input) {
      await requireActiveMembership(input);
      return options.store.listMembers(input.communityId);
    },
    async assignCommunityRole(input) {
      const actorMembership = await options.store.membershipForUser(input.actorUserId, input.communityId);
      if (!actorMembership || actorMembership.status !== "active" || actorMembership.role !== "owner") {
        throw new CommunityAccessError("community owner role required");
      }

      const targetMembership = await options.store.updateMembershipRole({
        userId: input.targetUserId,
        communityId: input.communityId,
        role: input.role
      });
      if (!targetMembership) throw new CommunityAccessError("target membership required");
      return targetMembership;
    }
  };
}

export function disabledCommunityAccessService(): CommunityAccessService {
  return {
    async requireCommunityManagement() {
      throw new CommunityAccessError("communities are not configured");
    },
    async requireDefaultCommunityManagement() {
      throw new CommunityAccessError("communities are not configured");
    },
    async listCommunityMembers() {
      throw new CommunityAccessError("communities are not configured");
    },
    async assignCommunityRole() {
      throw new CommunityAccessError("communities are not configured");
    }
  };
}

export function canManageCommunity(role: CommunityRole): boolean {
  return role === "owner" || role === "admin";
}

export function isCommunityAccessError(error: unknown): error is CommunityAccessError {
  return error instanceof CommunityAccessError;
}
