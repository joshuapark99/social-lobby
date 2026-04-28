import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { PixiRoomCanvas } from "./PixiRoomCanvas";
import { normalizePointerPosition } from "./pixiRoomCanvasMath";
import { deriveRemoteOccupants } from "./pixiRoomCanvasState";
import type { RoomLayout } from "./api";
import type { RealtimeOccupant } from "../realtime/realtimeClient";

const layout: RoomLayout = {
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

const localOccupant: RealtimeOccupant = {
  connectionId: "conn-1",
  userId: "user-1",
  email: "person@example.com",
  position: { x: 320, y: 420 }
};

const remoteOccupants: RealtimeOccupant[] = [
  {
    connectionId: "conn-2",
    userId: "user-2",
    email: "other@example.com",
    position: { x: 640, y: 420 }
  }
];

describe("normalizePointerPosition", () => {
  it("maps pointer coordinates into normalized canvas-space values", () => {
    expect(
      normalizePointerPosition({
        clientX: 250,
        clientY: 150,
        bounds: { left: 50, top: 50, width: 400, height: 200 }
      })
    ).toEqual({ x: 0.5, y: 0.5 });
  });

  it("clamps coordinates outside the room bounds", () => {
    expect(
      normalizePointerPosition({
        clientX: -10,
        clientY: 500,
        bounds: { left: 50, top: 50, width: 400, height: 200 }
      })
    ).toEqual({ x: 0, y: 1 });
  });
});

describe("deriveRemoteOccupants", () => {
  it("removes the local occupant from the remote list", () => {
    expect(
      deriveRemoteOccupants({
        self: { connectionId: "conn-1", userId: "user-1", email: "a@example.com", position: { x: 320, y: 420 } },
        occupants: [
          { connectionId: "conn-1", userId: "user-1", email: "a@example.com", position: { x: 320, y: 420 } },
          { connectionId: "conn-2", userId: "user-2", email: "b@example.com", position: { x: 640, y: 420 } }
        ]
      })
    ).toEqual([
      { connectionId: "conn-2", userId: "user-2", email: "b@example.com", position: { x: 640, y: 420 } }
    ]);
  });
});

describe("PixiRoomCanvas", () => {
  it("renders a room canvas container for the provided layout", () => {
    render(
      createElement(PixiRoomCanvas, {
        layout,
        localOccupant,
        remoteOccupants,
        onPointerIntent: vi.fn()
      })
    );

    expect(screen.getByLabelText("Pixi room canvas")).toBeInTheDocument();
  });

  it("emits normalized click coordinates through the callback", () => {
    const onPointerIntent = vi.fn();

    render(
      createElement(PixiRoomCanvas, {
        layout,
        localOccupant,
        remoteOccupants,
        onPointerIntent
      })
    );

    const canvasHost = screen.getByLabelText("Pixi room canvas");
    Object.defineProperty(canvasHost, "getBoundingClientRect", {
      value: () => ({
        left: 0,
        top: 0,
        width: 400,
        height: 200,
        right: 400,
        bottom: 200,
        x: 0,
        y: 0,
        toJSON() {}
      })
    });

    fireEvent.click(canvasHost, { clientX: 200, clientY: 100 });

    expect(onPointerIntent).toHaveBeenCalledWith({ x: 0.5, y: 0.5 });
  });

  it("updates the scene when realtime occupants change", () => {
    const { rerender } = render(
      createElement(PixiRoomCanvas, {
        layout,
        localOccupant,
        remoteOccupants: [],
        onPointerIntent: vi.fn()
      })
    );

    rerender(
      createElement(PixiRoomCanvas, {
        layout,
        localOccupant,
        remoteOccupants: [{ connectionId: "conn-2", userId: "user-2", email: "b@example.com", position: { x: 640, y: 420 } }],
        onPointerIntent: vi.fn()
      })
    );

    expect(screen.getByLabelText("Pixi room canvas")).toBeInTheDocument();
  });
});
