import { parseRoomLayout, type RoomLayout } from "../layouts/layout.js";
import type { CommunityRole } from "../communities/service.js";

export type CommunitySummary = {
  id: string;
  slug: string;
  name: string;
  viewerRole?: CommunityRole;
};

export type RoomMetadata = {
  slug: string;
  name: string;
  kind: string;
  isDefault: boolean;
  layoutVersion: number;
  layout: RoomLayout;
};

export type RoomMetadataResponse = {
  community: CommunitySummary;
  room: RoomMetadata;
};

export type RoomListResponse = {
  community: CommunitySummary;
  rooms: RoomMetadata[];
};

export type CommunityRoomsResponse = {
  communities: RoomListResponse[];
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
  communitiesForUser(userId: string): Promise<CommunitySummary[]>;
  activeMembershipRole(userId: string, communityId: string): Promise<CommunityRole | null>;
  roomsForCommunity(communityId: string): Promise<RoomRow[]>;
  communityBySlug(communitySlug: string): Promise<{ id: string; slug: string; name: string } | null>;
  communityById(communityId: string): Promise<{ id: string; slug: string; name: string } | null>;
  roomBySlug(roomSlug: string): Promise<RoomRow | null>;
  roomByCommunitySlug(communitySlug: string, roomSlug: string): Promise<RoomRow | null>;
  roomByCommunityId(communityId: string, roomSlug: string): Promise<RoomRow | null>;
};

export type RoomService = {
  listDefaultCommunityRooms(userId: string): Promise<RoomListResponse>;
  listUserCommunities(userId: string): Promise<CommunityRoomsResponse>;
  listCommunityRooms(communitySlug: string, userId: string): Promise<RoomListResponse | null>;
  listCommunityRoomsById(communityId: string, userId: string): Promise<RoomListResponse | null>;
  roomBySlug(roomSlug: string, userId: string): Promise<RoomMetadataResponse | null>;
  roomByCommunitySlug(communitySlug: string, roomSlug: string, userId: string): Promise<RoomMetadataResponse | null>;
  roomByCommunityId(communityId: string, roomSlug: string, userId: string): Promise<RoomMetadataResponse | null>;
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
      return accessibleCommunityRooms(options.store, community, userId);
    },
    async listUserCommunities(userId) {
      const communities = await options.store.communitiesForUser(userId);

      return {
        communities: await Promise.all(
          communities.map((community) => accessibleCommunityRooms(options.store, community, userId))
        )
      };
    },
    async listCommunityRooms(communitySlug, userId) {
      const community = await options.store.communityBySlug(communitySlug);
      if (!community) return null;

      return accessibleCommunityRooms(options.store, community, userId);
    },
    async listCommunityRoomsById(communityId, userId) {
      const community = await options.store.communityById(communityId);
      if (!community) return null;

      return accessibleCommunityRooms(options.store, community, userId);
    },
    async roomBySlug(roomSlug, userId) {
      const row = await options.store.roomBySlug(roomSlug);
      if (!row) return null;

      return accessibleRoomMetadata(options.store, row, userId);
    },
    async roomByCommunitySlug(communitySlug, roomSlug, userId) {
      const row = await options.store.roomByCommunitySlug(communitySlug, roomSlug);
      if (!row) return null;

      return accessibleRoomMetadata(options.store, row, userId);
    },
    async roomByCommunityId(communityId, roomSlug, userId) {
      const row = await options.store.roomByCommunityId(communityId, roomSlug);
      if (!row) return null;

      return accessibleRoomMetadata(options.store, row, userId);
    }
  };
}

export function disabledRoomService(): RoomService {
  return {
    async listDefaultCommunityRooms() {
      throw new Error("rooms are not configured");
    },
    async listUserCommunities() {
      throw new Error("rooms are not configured");
    },
    async listCommunityRooms() {
      throw new Error("rooms are not configured");
    },
    async listCommunityRoomsById() {
      throw new Error("rooms are not configured");
    },
    async roomBySlug() {
      throw new Error("rooms are not configured");
    },
    async roomByCommunitySlug() {
      throw new Error("rooms are not configured");
    },
    async roomByCommunityId() {
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

async function accessibleCommunityRooms(
  store: RoomStore,
  community: { id: string; slug: string; name: string },
  userId: string
): Promise<RoomListResponse> {
  const role = await store.activeMembershipRole(userId, community.id);
  if (!role) throw new RoomAccessError();

  const rows = await store.roomsForCommunity(community.id);
  const roomSlugs = rows.map((row) => row.slug);

  return {
    community: {
      id: community.id,
      slug: community.slug,
      name: community.name,
      viewerRole: role
    },
    rooms: rows.map((row) => toRoomMetadata(row, roomSlugs))
  };
}

async function accessibleRoomMetadata(store: RoomStore, row: RoomRow, userId: string): Promise<RoomMetadataResponse> {
  const role = await store.activeMembershipRole(userId, row.communityId);
  if (!role) throw new RoomAccessError();

  const communityRows = await store.roomsForCommunity(row.communityId);
  const roomSlugs = communityRows.map((candidate) => candidate.slug);

  return {
    community: {
      id: row.communityId,
      slug: row.communitySlug,
      name: row.communityName,
      viewerRole: role
    },
    room: toRoomMetadata(row, roomSlugs)
  };
}
