import { describe, expect, test, vi } from "vitest";
import { createTeleportService, TeleportAccessError, type TeleportStore } from "./service.js";
import type { RoomService } from "../rooms/service.js";

function roomService(): RoomService {
  return {
    listDefaultCommunityRooms: vi.fn(),
    roomBySlug: vi.fn(async (roomSlug: string) =>
      roomSlug === "main-lobby"
        ? {
            community: { slug: "default-community", name: "Default Community" },
            room: {
              slug: "main-lobby",
              name: "Main Lobby",
              kind: "permanent",
              isDefault: true,
              layoutVersion: 1,
              layout: {
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
          }
        : roomSlug === "rooftop"
          ? {
              community: { slug: "default-community", name: "Default Community" },
              room: {
                slug: "rooftop",
                name: "Rooftop",
                kind: "permanent",
                isDefault: false,
                layoutVersion: 1,
                layout: {
                  theme: "sunset-rooftop",
                  backgroundAsset: "rooms/rooftop.png",
                  avatarStyleSet: "soft-rounded",
                  objectPack: "rooftop-v1",
                  width: 1800,
                  height: 1200,
                  spawnPoints: [{ x: 180, y: 240 }],
                  collision: [],
                  teleports: [{ label: "Lobby", targetRoom: "main-lobby" }]
                }
              }
            }
          : null
    )
  };
}

function teleportStore(overrides: Partial<TeleportStore> = {}): TeleportStore {
  return {
    findAccessibleRoom: vi.fn(async ({ roomSlug }) => (roomSlug === "rooftop" ? { id: "room-2" } : null)),
    recordVisit: vi.fn(async () => undefined),
    ...overrides
  };
}

describe("createTeleportService", () => {
  test("returns the target room and records a visit for allowed teleports", async () => {
    const rooms = roomService();
    const store = teleportStore();
    const service = createTeleportService({ roomService: rooms, store });

    const currentRoom = await rooms.roomBySlug("main-lobby");
    const target = await service.teleport({
      currentRoom: currentRoom!,
      targetRoomSlug: "rooftop",
      userId: "user-1"
    });

    expect(target.room.slug).toBe("rooftop");
    expect(store.findAccessibleRoom).toHaveBeenCalledWith({
      roomSlug: "rooftop",
      userId: "user-1"
    });
    expect(store.recordVisit).toHaveBeenCalledWith({
      userId: "user-1",
      roomId: "room-2"
    });
  });

  test("throws room not found when the target is not listed on the current layout", async () => {
    const rooms = roomService();
    const service = createTeleportService({ roomService: rooms, store: teleportStore() });
    const currentRoom = await rooms.roomBySlug("main-lobby");

    await expect(service.teleport({
      currentRoom: currentRoom!,
      targetRoomSlug: "basement",
      userId: "user-1"
    })).rejects.toThrow("room not found");
  });

  test("throws TeleportAccessError when the room exists but the user cannot access it", async () => {
    const rooms = roomService();
    const service = createTeleportService({
      roomService: rooms,
      store: teleportStore({
        findAccessibleRoom: vi.fn(async () => null)
      })
    });
    const currentRoom = await rooms.roomBySlug("main-lobby");

    await expect(service.teleport({
      currentRoom: currentRoom!,
      targetRoomSlug: "rooftop",
      userId: "user-1"
    })).rejects.toBeInstanceOf(TeleportAccessError);
  });
});
