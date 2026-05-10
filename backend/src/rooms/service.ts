import { randomUUID } from "node:crypto";
import { parseRoomLayout, type RoomLayout } from "../layouts/layout.js";
import { canManageCommunity, type CommunityRole } from "../communities/service.js";

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

export type RoomTableInput = {
  id?: string;
  label: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  seats: number;
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
  createRoom(input: { communityId: string; slug: string; name: string; layout: RoomLayout }): Promise<RoomRow>;
  updateRoomLayout(input: { roomId: string; layout: RoomLayout }): Promise<RoomRow>;
};

export type RoomService = {
  listDefaultCommunityRooms(userId: string): Promise<RoomListResponse>;
  listUserCommunities(userId: string): Promise<CommunityRoomsResponse>;
  listCommunityRooms(communitySlug: string, userId: string): Promise<RoomListResponse | null>;
  listCommunityRoomsById(communityId: string, userId: string): Promise<RoomListResponse | null>;
  roomBySlug(roomSlug: string, userId: string): Promise<RoomMetadataResponse | null>;
  roomByCommunitySlug(communitySlug: string, roomSlug: string, userId: string): Promise<RoomMetadataResponse | null>;
  roomByCommunityId(communityId: string, roomSlug: string, userId: string): Promise<RoomMetadataResponse | null>;
  createCommunityRoom(input: { actorUserId: string; communityId: string; name: string }): Promise<RoomListResponse>;
  updateCommunityRoomTables(input: {
    actorUserId: string;
    communityId: string;
    roomSlug: string;
    tables: RoomTableInput[];
  }): Promise<RoomMetadataResponse>;
};

export class RoomAccessError extends Error {
  constructor(message = "room access denied") {
    super(message);
    this.name = "RoomAccessError";
  }
}

export class RoomValidationError extends Error {
  constructor(message = "invalid room") {
    super(message);
    this.name = "RoomValidationError";
  }
}

export class RoomSlugConflictError extends Error {
  constructor(message = "room slug is already taken") {
    super(message);
    this.name = "RoomSlugConflictError";
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
    },
    async createCommunityRoom(input) {
      const community = await options.store.communityById(input.communityId);
      if (!community) throw new RoomValidationError("community not found");

      const role = await options.store.activeMembershipRole(input.actorUserId, community.id);
      if (!role || !canManageCommunity(role)) throw new RoomAccessError("community admin role required");

      const name = normalizeRoomName(input.name);
      const slug = roomSlugForName(name);
      const existingRoom = await options.store.roomByCommunityId(community.id, slug);
      if (existingRoom) throw new RoomSlugConflictError();

      await options.store.createRoom({
        communityId: community.id,
        slug,
        name,
        layout: defaultRoomLayout()
      });

      return accessibleCommunityRooms(options.store, community, input.actorUserId);
    },
    async updateCommunityRoomTables(input) {
      const row = await options.store.roomByCommunityId(input.communityId, input.roomSlug);
      if (!row) throw new RoomValidationError("room not found");

      const role = await options.store.activeMembershipRole(input.actorUserId, input.communityId);
      if (!role || !canManageCommunity(role)) throw new RoomAccessError("community admin role required");

      const communityRows = await options.store.roomsForCommunity(row.communityId);
      const roomSlugs = communityRows.map((candidate) => candidate.slug);
      const currentLayout = parseRoomLayout(row.layoutJson, { roomSlugs });
      const nextLayout = parseRoomLayout(
        {
          ...currentLayout,
          tables: input.tables.map((table, index) => normalizeRoomTable(table, index))
        },
        { roomSlugs }
      );
      const updatedRow = await options.store.updateRoomLayout({ roomId: row.id, layout: nextLayout });
      return accessibleRoomMetadata(options.store, updatedRow, input.actorUserId);
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
    },
    async createCommunityRoom() {
      throw new Error("rooms are not configured");
    },
    async updateCommunityRoomTables() {
      throw new Error("rooms are not configured");
    }
  };
}

export function isRoomAccessError(error: unknown): error is RoomAccessError {
  return error instanceof RoomAccessError;
}

export function isRoomValidationError(error: unknown): error is RoomValidationError {
  return error instanceof RoomValidationError;
}

export function isRoomSlugConflictError(error: unknown): error is RoomSlugConflictError {
  return error instanceof RoomSlugConflictError;
}

export function roomSlugForName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/-{2,}/gu, "-");

  if (slug.length < 2) throw new RoomValidationError("room name must include at least two URL-safe characters");
  return slug;
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

function normalizeRoomName(name: string): string {
  const normalized = name.trim().replace(/\s+/gu, " ");
  if (normalized.length < 2) throw new RoomValidationError("room name must be at least 2 characters");
  if (normalized.length > 80) throw new RoomValidationError("room name must be 80 characters or fewer");
  return normalized;
}

function defaultRoomLayout(): RoomLayout {
  return {
    theme: "community-room",
    backgroundAsset: "rooms/main-lobby.png",
    avatarStyleSet: "soft-rounded",
    objectPack: "empty-room-v1",
    width: 2400,
    height: 1600,
    spawnPoints: [{ x: 320, y: 420 }],
    collision: [],
    teleports: [],
    tables: []
  };
}

function normalizeRoomTable(table: RoomTableInput, index: number): NonNullable<RoomLayout["tables"]>[number] {
  const label = table.label.trim().replace(/\s+/gu, " ");
  if (label.length < 1) throw new RoomValidationError(`table ${index + 1} label is required`);
  if (label.length > 60) throw new RoomValidationError(`table ${index + 1} label must be 60 characters or fewer`);
  if (!Number.isInteger(table.x) || !Number.isInteger(table.y)) throw new RoomValidationError(`table ${index + 1} position is invalid`);
  if (!Number.isInteger(table.seats) || table.seats < 1 || table.seats > 12) {
    throw new RoomValidationError(`table ${index + 1} seats must be between 1 and 12`);
  }

  return {
    id: table.id?.trim() || randomUUID(),
    label,
    x: table.x,
    y: table.y,
    w: table.w ?? 320,
    h: table.h ?? 180,
    seats: table.seats
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
