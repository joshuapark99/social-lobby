import type { CommunityRoomsResponse, RoomChatHistoryResponse, RoomDetailResponse, RoomListResponse } from "../rooms/api";

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
  redeemInvite(code: string): Promise<{ status: "redeemed" | "already-member"; communityId: string }>;
  listCommunities(): Promise<CommunityRoomsResponse>;
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
