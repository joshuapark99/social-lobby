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
    slug: string;
    name: string;
  };
  rooms: RoomMetadata[];
}

export interface RoomDetailResponse {
  community: {
    slug: string;
    name: string;
  };
  room: RoomMetadata;
}
