export const communityRoles = ["member", "admin", "owner"] as const;

export type CommunityRole = (typeof communityRoles)[number];

export type CommunityMembership = {
  userId: string;
  communityId: string;
  role: CommunityRole;
  status: "active" | string;
};

export type CommunitySummary = {
  id: string;
  slug: string;
  name: string;
  viewerRole?: CommunityRole;
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
  createCommunity(input: { actorUserId: string; name: string; slug: string }): Promise<CommunitySummary>;
  membershipForUser(userId: string, communityId: string): Promise<CommunityMembership | null>;
  listMembers(communityId: string): Promise<CommunityMember[]>;
  updateMembershipRole(input: {
    userId: string;
    communityId: string;
    role: Exclude<CommunityRole, "owner">;
  }): Promise<CommunityMembership | null>;
};

export type CommunityAccessService = {
  createCommunity(input: { actorUserId: string; name: string }): Promise<CommunitySummary>;
  requireCommunityManagement(input: { actorUserId: string; communityId: string }): Promise<void>;
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

export class CommunityValidationError extends Error {
  constructor(message = "invalid community") {
    super(message);
    this.name = "CommunityValidationError";
  }
}

export class CommunitySlugConflictError extends Error {
  constructor(message = "community slug is already taken") {
    super(message);
    this.name = "CommunitySlugConflictError";
  }
}

const reservedCommunitySlugs = new Set(["admin", "api", "auth", "community", "communities", "default", "invite", "invites", "rooms"]);

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
    async createCommunity(input) {
      const name = normalizeCommunityName(input.name);
      const slug = communitySlugForName(name);
      return options.store.createCommunity({ actorUserId: input.actorUserId, name, slug });
    },
    requireCommunityManagement,
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
    async createCommunity() {
      throw new CommunityAccessError("communities are not configured");
    },
    async requireCommunityManagement() {
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

export function isCommunityValidationError(error: unknown): error is CommunityValidationError {
  return error instanceof CommunityValidationError;
}

export function isCommunitySlugConflictError(error: unknown): error is CommunitySlugConflictError {
  return error instanceof CommunitySlugConflictError;
}

export function communitySlugForName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/-{2,}/gu, "-");

  if (slug.length < 3) throw new CommunityValidationError("community name must include at least three URL-safe characters");
  if (reservedCommunitySlugs.has(slug)) throw new CommunityValidationError("community name creates a reserved URL slug");
  return slug;
}

function normalizeCommunityName(name: string): string {
  const normalized = name.trim().replace(/\s+/gu, " ");
  if (normalized.length < 3) throw new CommunityValidationError("community name must be at least 3 characters");
  if (normalized.length > 80) throw new CommunityValidationError("community name must be 80 characters or fewer");
  return normalized;
}
