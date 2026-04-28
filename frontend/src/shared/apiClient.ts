import type { RoomDetailResponse, RoomListResponse } from "../rooms/api";

export interface ApiClient {
  readonly baseUrl: string;
  redeemInvite(code: string): Promise<{ status: "redeemed" | "already-member"; communityId: string }>;
  listRooms(): Promise<RoomListResponse>;
  getRoom(roomSlug: string): Promise<RoomDetailResponse>;
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
        throw new Error(body.error ?? "Unable to redeem invite.");
      }

      return (await response.json()) as { status: "redeemed" | "already-member"; communityId: string };
    },
    async listRooms() {
      const response = await fetch(`${baseUrl}/communities/default/rooms`, {
        credentials: "include"
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({ error: "Unable to load rooms." }))) as { error?: string };
        throw new Error(body.error ?? "Unable to load rooms.");
      }

      return (await response.json()) as RoomListResponse;
    },
    async getRoom(roomSlug: string) {
      const response = await fetch(`${baseUrl}/rooms/${encodeURIComponent(roomSlug)}`, {
        credentials: "include"
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({ error: "Unable to load room." }))) as { error?: string };
        throw new Error(body.error ?? "Unable to load room.");
      }

      return (await response.json()) as RoomDetailResponse;
    },
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
