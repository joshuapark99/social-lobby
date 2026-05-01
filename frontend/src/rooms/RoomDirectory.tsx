import { useEffect, useState } from "react";
import { InviteGate } from "../invites/InviteGate";
import { ApiError, type ApiClient } from "../shared/apiClient";
import type { RoomListResponse } from "./api";

export function RoomDirectory({
  apiClient,
  currentRoomSlug,
  isOpen,
  onClose,
  onSelectRoom
}: {
  apiClient: ApiClient;
  currentRoomSlug?: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectRoom: (roomSlug: string) => void;
}) {
  const [rooms, setRooms] = useState<RoomListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

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
          setRooms({ community: { slug: "pending-access", name: "Unlocked Rooms" }, rooms: [] });
          setError(null);
          return;
        }
        setError(nextError instanceof Error ? nextError.message : "Unable to load rooms.");
      });

    return () => {
      active = false;
    };
  }, [apiClient, isOpen]);

  return (
    <aside aria-hidden={!isOpen} className={`room-directory${isOpen ? " room-directory-open" : ""}`}>
      <div className="room-directory__scrim" onClick={onClose} />
      <div className="room-directory__panel">
        <div className="room-directory__header">
          <div>
            <p className="section-kicker">Transit console</p>
            <h3>Pick your next room</h3>
          </div>
          <button className="ghost-button" onClick={onClose} type="button">
            Close
          </button>
        </div>
        <p className="section-copy">Walk into a new scene instantly. Invite codes unlock additional destinations when you need them.</p>
        {error ? <p className="form-message form-message-error">{error}</p> : null}
        <div className="room-directory__list">
          {rooms?.rooms.length ? null : <p className="muted">No shared rooms unlocked yet. Redeem an invite to add one.</p>}
          {rooms?.rooms.map((room) => (
            <button
              className={`room-card${room.slug === currentRoomSlug ? " room-card-active" : ""}`}
              key={room.slug}
              onClick={() => onSelectRoom(room.slug)}
              type="button"
            >
              <img alt="" className="room-card__thumb" src={`/${room.layout.backgroundAsset.replace(/\.png$/u, ".svg")}`} />
              <span className="room-card__meta">
                <strong>{room.name}</strong>
                <span>{room.isDefault ? "Default arrival" : "Unlocked room"}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="room-directory__invite">
          <p className="section-kicker">Redeem invite</p>
          <InviteGate apiClient={apiClient} initialCode="" />
        </div>
      </div>
    </aside>
  );
}
