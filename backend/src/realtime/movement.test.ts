import { describe, expect, test } from "vitest";
import { resolveMovementDestination } from "./movement.js";

const layout = {
  theme: "cozy-lobby",
  backgroundAsset: "rooms/main-lobby.png",
  avatarStyleSet: "soft-rounded",
  objectPack: "lobby-furniture-v1",
  width: 2400,
  height: 1600,
  spawnPoints: [{ x: 320, y: 420 }],
  collision: [{ x: 520, y: 360, w: 220, h: 90 }],
  teleports: [{ label: "Rooftop", targetRoom: "rooftop" }]
};

describe("resolveMovementDestination", () => {
  test("keeps an in-bounds point outside collision rectangles unchanged", () => {
    expect(resolveMovementDestination(layout, { x: 480, y: 420 })).toEqual({ x: 480, y: 420 });
  });

  test("clamps out-of-bounds points into room bounds", () => {
    expect(resolveMovementDestination(layout, { x: -50, y: 1800 })).toEqual({ x: 0, y: 1600 });
  });

  test("clamps a point inside a collision rectangle to the nearest valid edge", () => {
    expect(resolveMovementDestination(layout, { x: 600, y: 400 })).toEqual({ x: 600, y: 359 });
  });
});
