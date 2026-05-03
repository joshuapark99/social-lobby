export interface RoomLayout {
  theme: string;
  backgroundAsset: string;
  avatarStyleSet: string;
  objectPack: string;
  width: number;
  height: number;
  spawnPoints: Array<{ x: number; y: number }>;
  collision: Array<{ x: number; y: number; w: number; h: number }>;
  teleports: Array<{ label: string; targetRoom: string }>;
}

export interface RoomMetadata {
  slug: string;
  name: string;
  kind: string;
  isDefault: boolean;
  layoutVersion: number;
  layout: RoomLayout;
}

export interface RoomListResponse {
  community: {
    id: string;
    slug: string;
    name: string;
  };
  rooms: RoomMetadata[];
}

export interface CommunityRoomsResponse {
  communities: RoomListResponse[];
}

export interface RoomDetailResponse {
  community: {
    id: string;
    slug: string;
    name: string;
  };
  room: RoomMetadata;
}

export interface RoomChatMessage {
  id: string;
  roomSlug: string;
  userId: string;
  userName: string;
  body: string;
  createdAt: string;
}

export interface RoomChatHistoryResponse {
  messages: RoomChatMessage[];
}
