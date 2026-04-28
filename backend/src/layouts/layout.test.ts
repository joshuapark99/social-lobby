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
          teleports: [{ label: "Rooftop", targetRoom: "rooftop" }]
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
      teleports: [{ label: "Rooftop", targetRoom: "rooftop" }]
    });
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
});
