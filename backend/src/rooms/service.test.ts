import { describe, expect, test } from "vitest";
import { createRoomService, type RoomStore } from "./service.js";

function roomStore(overrides: Partial<RoomStore> = {}): RoomStore {
  return {
    defaultCommunity: async () => ({ id: "community-1", slug: "default-community", name: "Default Community" }),
    communitiesForUser: async () => [{ id: "community-1", slug: "default-community", name: "Default Community" }],
    communityBySlug: async (communitySlug) =>
      communitySlug === "default-community" ? { id: "community-1", slug: "default-community", name: "Default Community" } : null,
    communityById: async (communityId) =>
      communityId === "community-1" ? { id: "community-1", slug: "default-community", name: "Default Community" } : null,
    activeMembershipRole: async () => "member" as const,
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
    roomByCommunitySlug: async (communitySlug, roomSlug) =>
      communitySlug === "default-community" && roomSlug === "main-lobby"
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
    roomByCommunityId: async (communityId, roomSlug) =>
      communityId === "community-1" && roomSlug === "main-lobby"
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
    createRoom: async (input) => ({
      id: "room-3",
      communityId: input.communityId,
      communitySlug: "default-community",
      communityName: "Default Community",
      slug: input.slug,
      name: input.name,
      kind: "permanent",
      isDefault: false,
      layoutVersion: 1,
      layoutJson: input.layout
    }),
    updateRoomLayout: async (input) => ({
      id: input.roomId,
      communityId: "community-1",
      communitySlug: "default-community",
      communityName: "Default Community",
      slug: "main-lobby",
      name: "Main Lobby",
      kind: "permanent",
      isDefault: true,
      layoutVersion: 2,
      layoutJson: input.layout
    }),
    ...overrides
  };
}

describe("room service", () => {
  test("lists validated room metadata for the default community", async () => {
    const service = createRoomService({ store: roomStore() });

    await expect(service.listDefaultCommunityRooms("user-1")).resolves.toEqual({
      community: {
        id: "community-1",
        slug: "default-community",
        name: "Default Community",
        viewerRole: "member"
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

    await expect(service.roomBySlug("main-lobby", "user-1")).resolves.toEqual({
      community: {
        id: "community-1",
        slug: "default-community",
        name: "Default Community",
        viewerRole: "member"
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

  test("lists joined communities with all rooms for each active membership", async () => {
    const service = createRoomService({ store: roomStore() });

    await expect(service.listUserCommunities("user-1")).resolves.toEqual({
      communities: [
        {
          community: {
            id: "community-1",
            slug: "default-community",
            name: "Default Community",
            viewerRole: "member"
          },
          rooms: [
            expect.objectContaining({ slug: "main-lobby" }),
            expect.objectContaining({ slug: "rooftop" })
          ]
        }
      ]
    });
  });

  test("returns community-scoped room detail", async () => {
    const service = createRoomService({ store: roomStore() });

    await expect(service.roomByCommunitySlug("default-community", "main-lobby", "user-1")).resolves.toEqual({
      community: {
        id: "community-1",
        slug: "default-community",
        name: "Default Community",
        viewerRole: "member"
      },
      room: expect.objectContaining({
        slug: "main-lobby",
        name: "Main Lobby"
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

    await expect(service.listDefaultCommunityRooms("user-1")).rejects.toThrow('teleport 0 targets unknown room slug "unknown-room"');
  });

  test("rejects room access when the user is not an active community member", async () => {
    const service = createRoomService({
      store: roomStore({
        activeMembershipRole: async () => null
      })
    });

    await expect(service.listDefaultCommunityRooms("user-1")).rejects.toThrow("room access denied");
    await expect(service.roomBySlug("main-lobby", "user-1")).rejects.toThrow("room access denied");
  });

  test("creates a community room with a generated slug and empty default layout for managers", async () => {
    const store = roomStore({
      activeMembershipRole: async () => "admin",
      roomByCommunityId: async () => null,
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
            teleports: []
          }
        },
        {
          id: "room-3",
          communityId: "community-1",
          communitySlug: "default-community",
          communityName: "Default Community",
          slug: "board-game-room",
          name: "Board Game Room",
          kind: "permanent",
          isDefault: false,
          layoutVersion: 1,
          layoutJson: {
            theme: "community-room",
            backgroundAsset: "rooms/main-lobby.png",
            avatarStyleSet: "soft-rounded",
            objectPack: "empty-room-v1",
            width: 2400,
            height: 1600,
            spawnPoints: [{ x: 320, y: 420 }],
            collision: [],
            teleports: []
          }
        }
      ]
    });
    const service = createRoomService({ store });

    await expect(
      service.createCommunityRoom({ actorUserId: "admin-1", communityId: "community-1", name: " Board Game Room " })
    ).resolves.toEqual({
      community: {
        id: "community-1",
        slug: "default-community",
        name: "Default Community",
        viewerRole: "admin"
      },
      rooms: [
        expect.objectContaining({ slug: "main-lobby", name: "Main Lobby" }),
        expect.objectContaining({
          slug: "board-game-room",
          name: "Board Game Room",
          isDefault: false,
          layout: expect.objectContaining({
            theme: "community-room",
            teleports: []
          })
        })
      ]
    });
  });

  test("rejects room creation for regular members and duplicate slugs", async () => {
    const memberService = createRoomService({ store: roomStore({ activeMembershipRole: async () => "member" }) });
    await expect(
      memberService.createCommunityRoom({ actorUserId: "member-1", communityId: "community-1", name: "Board Game Room" })
    ).rejects.toThrow("community admin role required");

    const duplicateService = createRoomService({ store: roomStore({ activeMembershipRole: async () => "owner" }) });
    await expect(
      duplicateService.createCommunityRoom({ actorUserId: "owner-1", communityId: "community-1", name: "Main Lobby" })
    ).rejects.toThrow("room slug is already taken");
  });

  test("updates room tables for community managers", async () => {
    const service = createRoomService({
      store: roomStore({
        activeMembershipRole: async () => "owner"
      })
    });

    await expect(
      service.updateCommunityRoomTables({
        actorUserId: "owner-1",
        communityId: "community-1",
        roomSlug: "main-lobby",
        tables: [{ id: "table-1", label: "Strategy Table", x: 640, y: 520, seats: 6 }]
      })
    ).resolves.toEqual({
      community: {
        id: "community-1",
        slug: "default-community",
        name: "Default Community",
        viewerRole: "owner"
      },
      room: expect.objectContaining({
        slug: "main-lobby",
        layoutVersion: 2,
        layout: expect.objectContaining({
          tables: [{ id: "table-1", label: "Strategy Table", x: 640, y: 520, w: 320, h: 180, seats: 6 }]
        })
      })
    });
  });

  test("rejects table updates for regular members and invalid table data", async () => {
    const memberService = createRoomService({ store: roomStore({ activeMembershipRole: async () => "member" }) });
    await expect(
      memberService.updateCommunityRoomTables({
        actorUserId: "member-1",
        communityId: "community-1",
        roomSlug: "main-lobby",
        tables: []
      })
    ).rejects.toThrow("community admin role required");

    const managerService = createRoomService({ store: roomStore({ activeMembershipRole: async () => "admin" }) });
    await expect(
      managerService.updateCommunityRoomTables({
        actorUserId: "admin-1",
        communityId: "community-1",
        roomSlug: "main-lobby",
        tables: [{ id: "table-1", label: "Too Far", x: 2300, y: 520, seats: 4 }]
      })
    ).rejects.toThrow("table 0 must be within room bounds");
  });
});
