import { parseRoomLayout, type RoomLayout } from "../layouts/layout.js";

export type RoomMetadata = {
  slug: string;
  name: string;
  kind: string;
  isDefault: boolean;
  layoutVersion: number;
  layout: RoomLayout;
};

export type RoomMetadataResponse = {
  community: {
    slug: string;
    name: string;
  };
  room: RoomMetadata;
};

export type RoomListResponse = {
  community: {
    slug: string;
    name: string;
  };
  rooms: RoomMetadata[];
};

export type RoomRow = {
  id: string;
  communityId: string;
  communitySlug: string;
  communityName: string;
  slug: string;
  name: string;
  kind: string;
  isDefault: boolean;
  layoutVersion: number;
  layoutJson: unknown;
};

export type RoomStore = {
  defaultCommunity(): Promise<{ id: string; slug: string; name: string }>;
  hasActiveMembership(userId: string, communityId: string): Promise<boolean>;
  roomsForCommunity(communityId: string): Promise<RoomRow[]>;
  roomBySlug(roomSlug: string): Promise<RoomRow | null>;
};

export type RoomService = {
  listDefaultCommunityRooms(userId: string): Promise<RoomListResponse>;
  roomBySlug(roomSlug: string, userId: string): Promise<RoomMetadataResponse | null>;
};

export class RoomAccessError extends Error {
  constructor(message = "room access denied") {
    super(message);
    this.name = "RoomAccessError";
  }
}

export function createRoomService(options: { store: RoomStore }): RoomService {
  return {
    async listDefaultCommunityRooms(userId) {
      const community = await options.store.defaultCommunity();
      const hasMembership = await options.store.hasActiveMembership(userId, community.id);
      if (!hasMembership) throw new RoomAccessError();

      const rows = await options.store.roomsForCommunity(community.id);
      const roomSlugs = rows.map((row) => row.slug);

      return {
        community: {
          slug: community.slug,
          name: community.name
        },
        rooms: rows.map((row) => toRoomMetadata(row, roomSlugs))
      };
    },
    async roomBySlug(roomSlug, userId) {
      const row = await options.store.roomBySlug(roomSlug);
      if (!row) return null;

      const hasMembership = await options.store.hasActiveMembership(userId, row.communityId);
      if (!hasMembership) throw new RoomAccessError();

      const communityRows = await options.store.roomsForCommunity(row.communityId);
      const roomSlugs = communityRows.map((candidate) => candidate.slug);

      return {
        community: {
          slug: row.communitySlug,
          name: row.communityName
        },
        room: toRoomMetadata(row, roomSlugs)
      };
    }
  };
}

export function disabledRoomService(): RoomService {
  return {
    async listDefaultCommunityRooms() {
      throw new Error("rooms are not configured");
    },
    async roomBySlug() {
      throw new Error("rooms are not configured");
    }
  };
}

export function isRoomAccessError(error: unknown): error is RoomAccessError {
  return error instanceof RoomAccessError;
}

function toRoomMetadata(row: RoomRow, roomSlugs: string[]): RoomMetadata {
  return {
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    isDefault: row.isDefault,
    layoutVersion: row.layoutVersion,
    layout: parseRoomLayout(row.layoutJson, { roomSlugs })
  };
}
