import type { RoomChatMessage, RoomDetailResponse } from "./api";

export const personalRoomSlug = "personal-suite";

export function personalRoomFor(displayName: string): RoomDetailResponse {
  return {
    community: {
      id: "private-hub",
      slug: "private-hub",
      name: "Private Hub"
    },
    room: {
      slug: personalRoomSlug,
      name: `${displayName}'s Room`,
      kind: "personal",
      isDefault: true,
      layoutVersion: 1,
      layout: {
        theme: "sunrise-suite",
        backgroundAsset: "rooms/personal-suite.svg",
        avatarStyleSet: "sunlit-soft",
        objectPack: "personal-console-v1",
        width: 1800,
        height: 1200,
        spawnPoints: [{ x: 520, y: 720 }],
        collision: [
          { x: 0, y: 920, w: 1800, h: 280 },
          { x: 1240, y: 520, w: 280, h: 260 },
          { x: 220, y: 520, w: 260, h: 250 }
        ],
        teleports: []
      }
    }
  };
}

export function personalRoomMessages(displayName: string): RoomChatMessage[] {
  return [
    {
      id: "suite-guide-1",
      roomSlug: personalRoomSlug,
      userId: "suite-guide",
      userName: "House Guide",
      body: `Welcome in, ${displayName}. Use the community menu when you want to visit a shared room.`,
      createdAt: "2026-04-30T12:00:00.000Z"
    },
    {
      id: "suite-guide-2",
      roomSlug: personalRoomSlug,
      userId: "suite-guide",
      userName: "House Guide",
      body: "Redeem invite codes there to unlock new communities.",
      createdAt: "2026-04-30T12:00:01.000Z"
    }
  ];
}
