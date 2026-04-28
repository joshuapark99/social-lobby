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
  roomsForCommunity(communityId: string): Promise<RoomRow[]>;
  roomBySlug(roomSlug: string): Promise<RoomRow | null>;
};

export type RoomService = {
  listDefaultCommunityRooms(): Promise<RoomListResponse>;
  roomBySlug(roomSlug: string): Promise<RoomMetadataResponse | null>;
};

export function createRoomService(options: { store: RoomStore }): RoomService {
  return {
    async listDefaultCommunityRooms() {
      const community = await options.store.defaultCommunity();
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
    async roomBySlug(roomSlug) {
      const row = await options.store.roomBySlug(roomSlug);
      if (!row) return null;

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
