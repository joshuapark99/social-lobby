import { describe, expect, test } from "vitest";
import { parseRoomLayout } from "./layout.js";

describe("room layout validation", () => {
  test("accepts a valid room layout", () => {
    expect(
      parseRoomLayout(
        {
          theme: "cozy-lobby",
          backgroundAsset: "rooms/main-lobby.png",
          avatarStyleSet: "soft-rounded",
          objectPack: "lobby-furniture-v1",
          width: 2400,
          height: 1600,
          spawnPoints: [{ x: 320, y: 420 }],
          collision: [{ x: 520, y: 360, w: 220, h: 90 }],
          teleports: [{ label: "Rooftop", targetRoom: "rooftop" }],
          tables: [{ id: "table-1", label: "Table 1", x: 800, y: 600, w: 320, h: 180, seats: 4 }]
        },
        { roomSlugs: ["main-lobby", "rooftop"] }
      )
    ).toEqual({
      theme: "cozy-lobby",
      backgroundAsset: "rooms/main-lobby.png",
      avatarStyleSet: "soft-rounded",
      objectPack: "lobby-furniture-v1",
      width: 2400,
      height: 1600,
      spawnPoints: [{ x: 320, y: 420 }],
      collision: [{ x: 520, y: 360, w: 220, h: 90 }],
      teleports: [{ label: "Rooftop", targetRoom: "rooftop" }],
      tables: [{ id: "table-1", label: "Table 1", x: 800, y: 600, w: 320, h: 180, seats: 4 }]
    });
  });

  test("defaults older layouts to zero tables", () => {
    expect(
      parseRoomLayout(
        {
          theme: "cozy-lobby",
          backgroundAsset: "rooms/main-lobby.png",
          avatarStyleSet: "soft-rounded",
          objectPack: "lobby-furniture-v1",
          width: 2400,
          height: 1600,
          spawnPoints: [{ x: 320, y: 420 }],
          collision: [],
          teleports: []
        },
        { roomSlugs: ["main-lobby"] }
      ).tables
    ).toEqual([]);
  });

  test("rejects spawn points outside room bounds", () => {
    expect(() =>
      parseRoomLayout(
        {
          theme: "cozy-lobby",
          backgroundAsset: "rooms/main-lobby.png",
          avatarStyleSet: "soft-rounded",
          objectPack: "lobby-furniture-v1",
          width: 2400,
          height: 1600,
          spawnPoints: [{ x: 2800, y: 420 }],
          collision: [],
          teleports: []
        },
        { roomSlugs: ["main-lobby"] }
      )
    ).toThrow("spawn point 0 must be within room bounds");
  });

  test("rejects collision rectangles outside room bounds", () => {
    expect(() =>
      parseRoomLayout(
        {
          theme: "cozy-lobby",
          backgroundAsset: "rooms/main-lobby.png",
          avatarStyleSet: "soft-rounded",
          objectPack: "lobby-furniture-v1",
          width: 2400,
          height: 1600,
          spawnPoints: [{ x: 320, y: 420 }],
          collision: [{ x: 2380, y: 360, w: 40, h: 90 }],
          teleports: []
        },
        { roomSlugs: ["main-lobby"] }
      )
    ).toThrow("collision rectangle 0 must be within room bounds");
  });

  test("rejects teleports that target unknown rooms", () => {
    expect(() =>
      parseRoomLayout(
        {
          theme: "cozy-lobby",
          backgroundAsset: "rooms/main-lobby.png",
          avatarStyleSet: "soft-rounded",
          objectPack: "lobby-furniture-v1",
          width: 2400,
          height: 1600,
          spawnPoints: [{ x: 320, y: 420 }],
          collision: [],
          teleports: [{ label: "Basement", targetRoom: "basement" }]
        },
        { roomSlugs: ["main-lobby", "rooftop"] }
      )
    ).toThrow('teleport 0 targets unknown room slug "basement"');
  });

  test("rejects tables outside room bounds and duplicate table ids", () => {
    expect(() =>
      parseRoomLayout(
        {
          theme: "cozy-lobby",
          backgroundAsset: "rooms/main-lobby.png",
          avatarStyleSet: "soft-rounded",
          objectPack: "lobby-furniture-v1",
          width: 2400,
          height: 1600,
          spawnPoints: [{ x: 320, y: 420 }],
          collision: [],
          teleports: [],
          tables: [{ id: "table-1", label: "Table 1", x: 2300, y: 600, w: 320, h: 180, seats: 4 }]
        },
        { roomSlugs: ["main-lobby"] }
      )
    ).toThrow("table 0 must be within room bounds");

    expect(() =>
      parseRoomLayout(
        {
          theme: "cozy-lobby",
          backgroundAsset: "rooms/main-lobby.png",
          avatarStyleSet: "soft-rounded",
          objectPack: "lobby-furniture-v1",
          width: 2400,
          height: 1600,
          spawnPoints: [{ x: 320, y: 420 }],
          collision: [],
          teleports: [],
          tables: [
            { id: "table-1", label: "Table 1", x: 800, y: 600, w: 320, h: 180, seats: 4 },
            { id: "table-1", label: "Table 2", x: 1200, y: 600, w: 320, h: 180, seats: 4 }
          ]
        },
        { roomSlugs: ["main-lobby"] }
      )
    ).toThrow('table 1 has duplicate id "table-1"');
  });
});
