import { createHash, randomBytes } from "node:crypto";

export type InviteRecord = {
  id: string;
  codeHash: string;
  communityId: string;
  targetEmail: string | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

export type InviteStore = {
  defaultCommunity(): Promise<{ id: string; slug: string }>;
  createInvite(input: {
    codeHash: string;
    communityId: string;
    createdByUserId: string;
    targetEmail: string | null;
    maxRedemptions: number | null;
    expiresAt: Date | null;
  }): Promise<InviteRecord>;
  findInviteByCodeHash(codeHash: string): Promise<InviteRecord | null>;
  hasMembership(userId: string, communityId: string): Promise<boolean>;
  createMembership(userId: string, communityId: string): Promise<void>;
  incrementRedemption(inviteId: string): Promise<void>;
  revokeInvite(inviteId: string): Promise<void>;
};

export type InviteService = {
  createInvite(input: {
    createdByUserId: string;
    targetEmail?: string | null;
    maxRedemptions?: number | null;
    expiresAt?: Date | null;
  }): Promise<{
    id: string;
    code: string;
    targetEmail: string | null;
    maxRedemptions: number | null;
    expiresAt: Date | null;
  }>;
  redeemInvite(input: { code: string; userId: string; email: string }): Promise<{
    status: "redeemed" | "already-member";
    communityId: string;
  }>;
  revokeInvite(inviteId: string): Promise<{ status: "revoked" }>;
};

export function createInviteService(options: { store: InviteStore; now?: () => Date }): InviteService {
  const now = options.now ?? (() => new Date());

  return {
    async createInvite(input) {
      const community = await options.store.defaultCommunity();
      const code = newInviteCode();
      const targetEmail = normalizeEmail(input.targetEmail ?? null);
      const invite = await options.store.createInvite({
        codeHash: hashInviteCode(code),
        communityId: community.id,
        createdByUserId: input.createdByUserId,
        targetEmail,
        maxRedemptions: input.maxRedemptions ?? 1,
        expiresAt: input.expiresAt ?? null
      });
      return {
        id: invite.id,
        code,
        targetEmail: invite.targetEmail,
        maxRedemptions: invite.maxRedemptions,
        expiresAt: invite.expiresAt
      };
    },
    async redeemInvite(input) {
      if (input.code.trim() === "") throw new Error("invite code is required");
      const invite = await options.store.findInviteByCodeHash(hashInviteCode(input.code));
      if (!invite) throw new Error("invite not found");
      if (invite.revokedAt) throw new Error("invite revoked");
      if (invite.expiresAt && invite.expiresAt.getTime() <= now().getTime()) throw new Error("invite expired");
      if (invite.targetEmail && invite.targetEmail !== normalizeEmail(input.email)) throw new Error("invite email mismatch");

      const alreadyMember = await options.store.hasMembership(input.userId, invite.communityId);
      if (alreadyMember) return { status: "already-member", communityId: invite.communityId };

      if (invite.maxRedemptions !== null && invite.redemptionCount >= invite.maxRedemptions) {
        throw new Error("invite already used");
      }

      await options.store.createMembership(input.userId, invite.communityId);
      await options.store.incrementRedemption(invite.id);
      return { status: "redeemed", communityId: invite.communityId };
    },
    async revokeInvite(inviteId) {
      if (inviteId.trim() === "") throw new Error("invite id is required");
      await options.store.revokeInvite(inviteId);
      return { status: "revoked" };
    }
  };
}

export function disabledInviteService(): InviteService {
  return {
    async createInvite() {
      throw new Error("invites are not configured");
    },
    async redeemInvite() {
      throw new Error("invites are not configured");
    },
    async revokeInvite() {
      throw new Error("invites are not configured");
    }
  };
}

export function hashInviteCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function newInviteCode(): string {
  return randomBytes(18).toString("base64url");
}

function normalizeEmail(email: string | null): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}
