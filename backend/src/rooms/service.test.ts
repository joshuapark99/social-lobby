import { describe, expect, test } from "vitest";
import { createRoomService, type RoomStore } from "./service.js";

function roomStore(overrides: Partial<RoomStore> = {}): RoomStore {
  return {
    defaultCommunity: async () => ({ id: "community-1", slug: "default-community", name: "Default Community" }),
    roomsForCommunity: async () => [
      {
        id: "room-1",
        communityId: "community-1",
        communitySlug: "default-community",
        communityName: "Default Community",
        slug: "main-lobby",
        name: "Main Lobby",
        kind: "permanent",
        isDefault: true,
        layoutVersion: 1,
        layoutJson: {
          theme: "cozy-lobby",
          backgroundAsset: "rooms/main-lobby.png",
          avatarStyleSet: "soft-rounded",
          objectPack: "lobby-furniture-v1",
          width: 2400,
          height: 1600,
          spawnPoints: [{ x: 320, y: 420 }],
          collision: [],
          teleports: [{ label: "Rooftop", targetRoom: "rooftop" }]
        }
      },
      {
        id: "room-2",
        communityId: "community-1",
        communitySlug: "default-community",
        communityName: "Default Community",
        slug: "rooftop",
        name: "Rooftop",
        kind: "permanent",
        isDefault: false,
        layoutVersion: 1,
        layoutJson: {
          theme: "evening-rooftop",
          backgroundAsset: "rooms/rooftop.png",
          avatarStyleSet: "soft-rounded",
          objectPack: "rooftop-furniture-v1",
          width: 2200,
          height: 1400,
          spawnPoints: [{ x: 280, y: 380 }],
          collision: [],
          teleports: [{ label: "Lobby", targetRoom: "main-lobby" }]
        }
      }
    ],
    roomBySlug: async (roomSlug) =>
      roomSlug === "main-lobby"
        ? {
            id: "room-1",
            communityId: "community-1",
            communitySlug: "default-community",
            communityName: "Default Community",
            slug: "main-lobby",
            name: "Main Lobby",
            kind: "permanent",
            isDefault: true,
            layoutVersion: 1,
            layoutJson: {
              theme: "cozy-lobby",
              backgroundAsset: "rooms/main-lobby.png",
              avatarStyleSet: "soft-rounded",
              objectPack: "lobby-furniture-v1",
              width: 2400,
              height: 1600,
              spawnPoints: [{ x: 320, y: 420 }],
              collision: [],
              teleports: [{ label: "Rooftop", targetRoom: "rooftop" }]
            }
          }
        : null,
    ...overrides
  };
}

describe("room service", () => {
  test("lists validated room metadata for the default community", async () => {
    const service = createRoomService({ store: roomStore() });

    await expect(service.listDefaultCommunityRooms()).resolves.toEqual({
      community: {
        slug: "default-community",
        name: "Default Community"
      },
      rooms: [
        expect.objectContaining({
          slug: "main-lobby",
          name: "Main Lobby",
          layoutVersion: 1,
          layout: expect.objectContaining({ theme: "cozy-lobby" })
        }),
        expect.objectContaining({
          slug: "rooftop",
          name: "Rooftop",
          layoutVersion: 1,
          layout: expect.objectContaining({ theme: "evening-rooftop" })
        })
      ]
    });
  });

  test("returns room detail for a known room slug", async () => {
    const service = createRoomService({ store: roomStore() });

    await expect(service.roomBySlug("main-lobby")).resolves.toEqual({
      community: {
        slug: "default-community",
        name: "Default Community"
      },
      room: expect.objectContaining({
        slug: "main-lobby",
        name: "Main Lobby",
        layoutVersion: 1,
        layout: expect.objectContaining({
          teleports: [{ label: "Rooftop", targetRoom: "rooftop" }]
        })
      })
    });
  });

  test("throws when stored room layout data is invalid", async () => {
    const service = createRoomService({
      store: roomStore({
        roomsForCommunity: async () => [
          {
            id: "room-1",
            communityId: "community-1",
            communitySlug: "default-community",
            communityName: "Default Community",
            slug: "main-lobby",
            name: "Main Lobby",
            kind: "permanent",
            isDefault: true,
            layoutVersion: 1,
            layoutJson: {
              theme: "cozy-lobby",
              backgroundAsset: "rooms/main-lobby.png",
              avatarStyleSet: "soft-rounded",
              objectPack: "lobby-furniture-v1",
              width: 2400,
              height: 1600,
              spawnPoints: [{ x: 320, y: 420 }],
              collision: [],
              teleports: [{ label: "Unknown", targetRoom: "unknown-room" }]
            }
          }
        ]
      })
    });

    await expect(service.listDefaultCommunityRooms()).rejects.toThrow('teleport 0 targets unknown room slug "unknown-room"');
  });
});
