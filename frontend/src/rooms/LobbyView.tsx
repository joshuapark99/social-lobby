import { useEffect, useState } from "react";
import { ApiError } from "../shared/apiClient";
import type { ApiClient } from "../shared/apiClient";
import type { RoomListResponse } from "./api";

export function LobbyView({ apiClient, onNavigate }: { apiClient: ApiClient; onNavigate?: (pathname: string) => void }) {
  const [rooms, setRooms] = useState<RoomListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    apiClient
      .listRooms()
      .then((response) => {
        if (!active) return;
        setRooms(response);
        setError(null);
      })
      .catch((nextError: unknown) => {
        if (!active) return;
        if (nextError instanceof ApiError && nextError.status === 403) {
          const pathname = "/invite";
          window.history.pushState({}, "", pathname);
          onNavigate?.(pathname);
          return;
        }
        setError(nextError instanceof Error ? nextError.message : "Unable to load rooms.");
      });

    return () => {
      active = false;
    };
  }, [apiClient, onNavigate]);

  if (error) {
    return (
      <div className="stack">
        <p>{error}</p>
      </div>
    );
  }

  if (!rooms) {
    return (
      <div className="stack">
        <p>Loading rooms...</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <h2>{rooms.community.name}</h2>
      {rooms.rooms.map((room) => (
        <section key={room.slug} className="stack">
          <h3>{room.name}</h3>
          <p className="muted">{room.slug}</p>
          <p>{`Theme: ${room.layout.theme}`}</p>
          <p>{`${room.layout.width} x ${room.layout.height}`}</p>
          {room.isDefault ? <p>Default room</p> : null}
        </section>
      ))}
    </div>
  );
}
