import { createHash, randomBytes } from "node:crypto";

export type InviteRecord = {
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
};

export type InviteSummary = {
  id: string;
  communityId: string;
  createdByUserId: string | null;
  targetEmail: string | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  status: "active" | "expired" | "revoked" | "used";
};

export type InviteStore = {
  createInvite(input: {
    codeHash: string;
    communityId: string;
    createdByUserId: string;
    targetEmail: string | null;
    maxRedemptions: number | null;
    expiresAt: Date | null;
  }): Promise<InviteRecord>;
  listInvites(communityId: string): Promise<InviteRecord[]>;
  findInviteByCodeHash(codeHash: string): Promise<InviteRecord | null>;
  hasMembership(userId: string, communityId: string): Promise<boolean>;
  createMembership(userId: string, communityId: string): Promise<void>;
  incrementRedemption(inviteId: string): Promise<void>;
  revokeInvite(input: { inviteId: string; communityId?: string }): Promise<void>;
};

export type InviteService = {
  createInvite(input: {
    createdByUserId: string;
    communityId: string;
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
  listInvites(input: { communityId: string }): Promise<{ invites: InviteSummary[] }>;
  redeemInvite(input: { code: string; userId: string; email: string }): Promise<{
    status: "redeemed" | "already-member";
    communityId: string;
  }>;
  revokeInvite(input: { inviteId: string; communityId?: string }): Promise<{ status: "revoked" }>;
};

export function createInviteService(options: { store: InviteStore; now?: () => Date }): InviteService {
  const now = options.now ?? (() => new Date());

  return {
    async createInvite(input) {
      if (input.communityId.trim() === "") throw new Error("community id is required");
      const code = newInviteCode();
      const targetEmail = normalizeEmail(input.targetEmail ?? null);
      const maxRedemptions = normalizeMaxRedemptions(input.maxRedemptions ?? 1);
      const expiresAt = normalizeExpiry(input.expiresAt ?? defaultInviteExpiry(now()), now());
      const invite = await options.store.createInvite({
        codeHash: hashInviteCode(code),
        communityId: input.communityId,
        createdByUserId: input.createdByUserId,
        targetEmail,
        maxRedemptions,
        expiresAt
      });
      return {
        id: invite.id,
        code,
        targetEmail: invite.targetEmail,
        maxRedemptions: invite.maxRedemptions,
        expiresAt: invite.expiresAt
      };
    },
    async listInvites(input) {
      if (input.communityId.trim() === "") throw new Error("community id is required");
      const invites = await options.store.listInvites(input.communityId);
      return { invites: invites.map((invite) => toInviteSummary(invite, now())) };
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
    async revokeInvite(input) {
      if (input.inviteId.trim() === "") throw new Error("invite id is required");
      await options.store.revokeInvite(input);
      return { status: "revoked" };
    }
  };
}

export function disabledInviteService(): InviteService {
  return {
    async createInvite() {
      throw new Error("invites are not configured");
    },
    async listInvites() {
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

function normalizeMaxRedemptions(maxRedemptions: number | null): number | null {
  if (maxRedemptions === null) return null;
  if (!Number.isInteger(maxRedemptions) || maxRedemptions < 1) throw new Error("invite max uses must be at least 1");
  return maxRedemptions;
}

function normalizeExpiry(expiresAt: Date | null, now: Date): Date | null {
  if (expiresAt === null) return null;
  if (Number.isNaN(expiresAt.getTime())) throw new Error("invite expiry is invalid");
  if (expiresAt.getTime() <= now.getTime()) throw new Error("invite expiry must be in the future");
  return expiresAt;
}

function toInviteSummary(invite: InviteRecord, now: Date): InviteSummary {
  return {
    id: invite.id,
    communityId: invite.communityId,
    createdByUserId: invite.createdByUserId,
    targetEmail: invite.targetEmail,
    maxRedemptions: invite.maxRedemptions,
    redemptionCount: invite.redemptionCount,
    expiresAt: invite.expiresAt,
    revokedAt: invite.revokedAt,
    createdAt: invite.createdAt,
    status: inviteStatus(invite, now)
  };
}

function defaultInviteExpiry(now: Date): Date {
  const expiresAt = new Date(now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 14);
  return expiresAt;
}

function inviteStatus(invite: InviteRecord, now: Date): InviteSummary["status"] {
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt && invite.expiresAt.getTime() <= now.getTime()) return "expired";
  if (invite.maxRedemptions !== null && invite.redemptionCount >= invite.maxRedemptions) return "used";
  return "active";
}
