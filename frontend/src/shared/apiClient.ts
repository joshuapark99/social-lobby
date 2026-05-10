import type {
  CommunityMembersResponse,
  CommunityInvitesResponse,
  CreatedCommunityInvite,
  CommunityRoomsResponse,
  RoomChatHistoryResponse,
  RoomDetailResponse,
  RoomListResponse
} from "../rooms/api";
import type { RoomTable } from "../rooms/api";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiClient {
  readonly baseUrl: string;
  updateProfile(username: string): Promise<{ displayName: string; username: string }>;
  createCommunity(name: string): Promise<RoomListResponse>;
  createCommunityRoom(communityId: string, name: string): Promise<RoomListResponse>;
  updateCommunityRoomTables(communityId: string, roomSlug: string, tables: RoomTable[]): Promise<RoomDetailResponse>;
  redeemInvite(code: string): Promise<{ status: "redeemed" | "already-member"; communityId: string }>;
  listCommunities(): Promise<CommunityRoomsResponse>;
  listCommunityMembers(communityId: string): Promise<CommunityMembersResponse>;
  updateCommunityMemberRole(communityId: string, userId: string, role: "admin" | "member"): Promise<{ userId: string; communityId: string; role: "admin" | "member" }>;
  listCommunityInvites(communityId: string): Promise<CommunityInvitesResponse>;
  createCommunityInvite(communityId: string, input: { targetEmail?: string | null; maxRedemptions?: number | null; expiresAt?: string | null }): Promise<CreatedCommunityInvite>;
  revokeCommunityInvite(communityId: string, inviteId: string): Promise<{ status: "revoked" }>;
  listRooms(): Promise<RoomListResponse>;
  listCommunityRooms(communitySlug: string): Promise<RoomListResponse>;
  getRoom(roomSlug: string, communitySlug?: string): Promise<RoomDetailResponse>;
  listRoomMessages(roomSlug: string): Promise<RoomChatHistoryResponse>;
}

export function createApiClient(baseUrl = "/api"): ApiClient {
  return {
    baseUrl,
    async updateProfile(username: string) {
      const response = await fetch(`${baseUrl}/auth/profile`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...csrfHeader()
        },
        body: JSON.stringify({ username })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({ error: "Unable to save username." }))) as { error?: string };
        throw new ApiError(body.error ?? "Unable to save username.", response.status);
      }

      return (await response.json()) as { displayName: string; username: string };
    },
    async createCommunity(name: string) {
      const response = await fetch(`${baseUrl}/communities`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...csrfHeader()
        },
        body: JSON.stringify({ name })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({ error: "Unable to create community." }))) as { error?: string };
        throw new ApiError(body.error ?? "Unable to create community.", response.status);
      }

      return (await response.json()) as RoomListResponse;
    },
    async createCommunityRoom(communityId: string, name: string) {
      const response = await fetch(`${baseUrl}/communities/${encodeURIComponent(communityId)}/rooms`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...csrfHeader()
        },
        body: JSON.stringify({ name })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({ error: "Unable to create room." }))) as { error?: string };
        throw new ApiError(body.error ?? "Unable to create room.", response.status);
      }

      return (await response.json()) as RoomListResponse;
    },
    async updateCommunityRoomTables(communityId: string, roomSlug: string, tables: RoomTable[]) {
      const response = await fetch(`${baseUrl}/communities/${encodeURIComponent(communityId)}/rooms/${encodeURIComponent(roomSlug)}/tables`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...csrfHeader()
        },
        body: JSON.stringify({ tables })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({ error: "Unable to update tables." }))) as { error?: string };
        throw new ApiError(body.error ?? "Unable to update tables.", response.status);
      }

      return (await response.json()) as RoomDetailResponse;
    },
    async redeemInvite(code: string) {
      const response = await fetch(`${baseUrl}/invites/redeem`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...csrfHeader(),
        },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({ error: "Unable to redeem invite." }))) as {
          error?: string;
        };
        throw new ApiError(body.error ?? "Unable to redeem invite.", response.status);
      }

      return (await response.json()) as { status: "redeemed" | "already-member"; communityId: string };
    },
    async listCommunities() {
      const response = await fetch(`${baseUrl}/communities`, {
        credentials: "include"
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({ error: "Unable to load communities." }))) as { error?: string };
        throw new ApiError(body.error ?? "Unable to load communities.", response.status);
      }

      return (await response.json()) as CommunityRoomsResponse;
    },
    async listCommunityMembers(communityId: string) {
      const response = await fetch(`${baseUrl}/communities/${encodeURIComponent(communityId)}/members`, {
        credentials: "include"
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({ error: "Unable to load community members." }))) as { error?: string };
        throw new ApiError(body.error ?? "Unable to load community members.", response.status);
      }

      return (await response.json()) as CommunityMembersResponse;
    },
    async updateCommunityMemberRole(communityId: string, userId: string, role: "admin" | "member") {
      const response = await fetch(`${baseUrl}/communities/${encodeURIComponent(communityId)}/members/${encodeURIComponent(userId)}/role`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...csrfHeader()
        },
        body: JSON.stringify({ role })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({ error: "Unable to update member role." }))) as { error?: string };
        throw new ApiError(body.error ?? "Unable to update member role.", response.status);
      }

      return (await response.json()) as { userId: string; communityId: string; role: "admin" | "member" };
    },
    async listCommunityInvites(communityId: string) {
      const response = await fetch(`${baseUrl}/communities/${encodeURIComponent(communityId)}/invites`, {
        credentials: "include"
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({ error: "Unable to load invites." }))) as { error?: string };
        throw new ApiError(body.error ?? "Unable to load invites.", response.status);
      }

      return (await response.json()) as CommunityInvitesResponse;
    },
    async createCommunityInvite(communityId, input) {
      const response = await fetch(`${baseUrl}/communities/${encodeURIComponent(communityId)}/invites`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...csrfHeader()
        },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({ error: "Unable to create invite." }))) as { error?: string };
        throw new ApiError(body.error ?? "Unable to create invite.", response.status);
      }

      return (await response.json()) as CreatedCommunityInvite;
    },
    async revokeCommunityInvite(communityId, inviteId) {
      const response = await fetch(
        `${baseUrl}/communities/${encodeURIComponent(communityId)}/invites/${encodeURIComponent(inviteId)}/revoke`,
        {
          method: "POST",
          credentials: "include",
          headers: csrfHeader()
        }
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => ({ error: "Unable to revoke invite." }))) as { error?: string };
        throw new ApiError(body.error ?? "Unable to revoke invite.", response.status);
      }

      return (await response.json()) as { status: "revoked" };
    },
    async listRooms() {
      const response = await fetch(`${baseUrl}/communities/default/rooms`, {
        credentials: "include"
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({ error: "Unable to load rooms." }))) as { error?: string };
        throw new ApiError(body.error ?? "Unable to load rooms.", response.status);
      }

      return (await response.json()) as RoomListResponse;
    },
    async listCommunityRooms(communitySlug: string) {
      const response = await fetch(`${baseUrl}/communities/${encodeURIComponent(communitySlug)}/rooms`, {
        credentials: "include"
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({ error: "Unable to load rooms." }))) as { error?: string };
        throw new ApiError(body.error ?? "Unable to load rooms.", response.status);
      }

      return (await response.json()) as RoomListResponse;
    },
    async getRoom(roomSlug: string, communitySlug?: string) {
      const roomPath = communitySlug
        ? `${baseUrl}/communities/${encodeURIComponent(communitySlug)}/rooms/${encodeURIComponent(roomSlug)}`
        : `${baseUrl}/rooms/${encodeURIComponent(roomSlug)}`;
      const response = await fetch(roomPath, {
        credentials: "include"
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({ error: "Unable to load room." }))) as { error?: string };
        throw new ApiError(body.error ?? "Unable to load room.", response.status);
      }

      return (await response.json()) as RoomDetailResponse;
    },
    async listRoomMessages(roomSlug: string) {
      const response = await fetch(`${baseUrl}/rooms/${encodeURIComponent(roomSlug)}/messages`, {
        credentials: "include"
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({ error: "Unable to load room chat." }))) as { error?: string };
        throw new ApiError(body.error ?? "Unable to load room chat.", response.status);
      }

      return (await response.json()) as RoomChatHistoryResponse;
    }
  };
}

function csrfHeader(): Record<string, string> {
  const csrf = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("sl_csrf="))
    ?.split("=")[1];

  return csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {};
}
