import { useEffect, useState } from "react";
import type { RealtimeClient, RealtimeState } from "../realtime/realtimeClient";
import type { ApiClient } from "../shared/apiClient";
import type { NormalizedRoomPoint } from "./pixiRoomCanvasMath";
import { deriveRemoteOccupants } from "./pixiRoomCanvasState";
import { PixiRoomCanvas } from "./PixiRoomCanvas";
import type { RoomDetailResponse } from "./api";

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
  const [lastPointerIntent, setLastPointerIntent] = useState<NormalizedRoomPoint | null>(null);

  const localOccupant = realtime.snapshot?.self ?? null;
  const remoteOccupants = realtime.snapshot ? deriveRemoteOccupants(realtime.snapshot) : [];

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
              onPointerIntent={(point) => setLastPointerIntent(point)}
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
