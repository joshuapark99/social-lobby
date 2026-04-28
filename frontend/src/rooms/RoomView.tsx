import { useEffect, useState } from "react";
import type { RealtimeClient } from "../realtime/realtimeClient";
import type { ApiClient } from "../shared/apiClient";
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
          </>
        ) : null}
        <p className="muted">Realtime: {realtimeClient.status}</p>
      </section>
      <section aria-label="Room chat" className="chat-panel">
        <h2>Chat</h2>
        <p>Room chat placeholder</p>
      </section>
    </div>
  );
}
