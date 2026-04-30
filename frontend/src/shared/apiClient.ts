import type { RoomChatHistoryResponse, RoomDetailResponse, RoomListResponse } from "../rooms/api";

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
  redeemInvite(code: string): Promise<{ status: "redeemed" | "already-member"; communityId: string }>;
  listRooms(): Promise<RoomListResponse>;
  getRoom(roomSlug: string): Promise<RoomDetailResponse>;
  listRoomMessages(roomSlug: string): Promise<RoomChatHistoryResponse>;
}

export function createApiClient(baseUrl = "/api"): ApiClient {
  return {
    baseUrl,
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
    async getRoom(roomSlug: string) {
      const response = await fetch(`${baseUrl}/rooms/${encodeURIComponent(roomSlug)}`, {
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
