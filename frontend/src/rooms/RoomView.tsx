import { useEffect, useState } from "react";
import type { RealtimeClient, RealtimeState } from "../realtime/realtimeClient";
import type { ApiClient } from "../shared/apiClient";
import type { NormalizedRoomPoint } from "./pixiRoomCanvasMath";
import { deriveRemoteOccupants, interpolateOccupantPositions } from "./pixiRoomCanvasState";
import { PixiRoomCanvas } from "./PixiRoomCanvas";
import type { RoomDetailResponse } from "./api";

const keyboardStep = 80;
const interpolationStep = 24;

export function RoomView({
  apiClient,
  realtimeClient,
  roomSlug,
}: {
  apiClient: ApiClient;
  realtimeClient: RealtimeClient;
  roomSlug: string;
}) {
  const [room, setRoom] = useState<RoomDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [realtime, setRealtime] = useState<RealtimeState>(() => ({
    status: realtimeClient.status,
    snapshot: realtimeClient.snapshot,
    error: realtimeClient.error
  }));
  const [renderedOccupants, setRenderedOccupants] = useState(() => realtimeClient.snapshot?.occupants ?? []);

  const localOccupant = realtime.snapshot
    ? renderedOccupants.find((occupant) => occupant.connectionId === realtime.snapshot?.self.connectionId) ?? realtime.snapshot.self
    : null;
  const remoteOccupants =
    realtime.snapshot && localOccupant
      ? deriveRemoteOccupants({
          self: localOccupant,
          occupants: renderedOccupants
        })
      : [];

  useEffect(() => {
    let active = true;

    apiClient
      .getRoom(roomSlug)
      .then((response) => {
        if (!active) return;
        setRoom(response);
        setError(null);
      })
      .catch((nextError: unknown) => {
        if (!active) return;
        setError(nextError instanceof Error ? nextError.message : "Unable to load room.");
      });

    return () => {
      active = false;
    };
  }, [apiClient, roomSlug]);

  useEffect(() => realtimeClient.subscribe((state) => setRealtime(state)), [realtimeClient]);
  useEffect(() => realtimeClient.connect(roomSlug), [realtimeClient, roomSlug]);
  useEffect(() => {
    if (!realtime.snapshot) {
      setRenderedOccupants([]);
      return;
    }

    setRenderedOccupants((current) => interpolateOccupantPositions(current, realtime.snapshot?.occupants ?? [], interpolationStep));
  }, [realtime.snapshot]);
  useEffect(() => {
    if (!realtime.snapshot) return;

    const interval = window.setInterval(() => {
      setRenderedOccupants((current) => interpolateOccupantPositions(current, realtime.snapshot?.occupants ?? [], interpolationStep));
    }, 16);

    return () => window.clearInterval(interval);
  }, [realtime.snapshot]);
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!room || !localOccupant) return;

      const delta = keyboardDelta(event.key);
      if (!delta) return;

      realtimeClient.requestMovement({
        roomSlug,
        destination: {
          x: localOccupant.position.x + delta.x,
          y: localOccupant.position.y + delta.y
        },
        source: "keyboard"
      });
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [localOccupant, realtimeClient, room, roomSlug]);

  function handlePointerIntent(point: NormalizedRoomPoint) {
    if (!room) return;

    realtimeClient.requestMovement({
      roomSlug,
      destination: {
        x: Math.round(point.x * room.room.layout.width),
        y: Math.round(point.y * room.room.layout.height)
      },
      source: "pointer"
    });
  }

  return (
    <div className="room-layout">
      <section aria-label="Room canvas" className="room-surface">
        {!room && !error ? <p>Loading room...</p> : null}
        {error ? <p>{error}</p> : null}
        {room ? (
          <>
            <h2>{room.room.name}</h2>
            <p>{`Theme: ${room.room.layout.theme}`}</p>
            <p>{`Layout version: ${room.room.layoutVersion}`}</p>
            <p>{`${room.room.layout.width} x ${room.room.layout.height}`}</p>
            <p>{`Spawn points: ${room.room.layout.spawnPoints.length}`}</p>
            <p>{`Collision rectangles: ${room.room.layout.collision.length}`}</p>
            <p>{`Teleports: ${room.room.layout.teleports.map((teleport) => teleport.label).join(", ") || "None"}`}</p>
            <p>{`Active occupants: ${realtime.snapshot?.occupants.length ?? 0}`}</p>
            <PixiRoomCanvas
              layout={room.room.layout}
              localOccupant={localOccupant}
              remoteOccupants={remoteOccupants}
              onPointerIntent={handlePointerIntent}
            />
          </>
        ) : null}
        <p className="muted">Realtime: {realtime.status}</p>
        {realtime.error ? <p>{realtime.error}</p> : null}
      </section>
      <section aria-label="Room chat" className="chat-panel">
        <h2>Chat</h2>
        <p>Room chat placeholder</p>
      </section>
    </div>
  );
}

function keyboardDelta(key: string): { x: number; y: number } | null {
  switch (key) {
    case "ArrowUp":
    case "w":
    case "W":
      return { x: 0, y: -keyboardStep };
    case "ArrowDown":
    case "s":
    case "S":
      return { x: 0, y: keyboardStep };
    case "ArrowLeft":
    case "a":
    case "A":
      return { x: -keyboardStep, y: 0 };
    case "ArrowRight":
    case "d":
    case "D":
      return { x: keyboardStep, y: 0 };
    default:
      return null;
  }
}
