import { type FormEvent, useEffect, useState } from "react";
import type { FrontendIssue } from "../app/App";
import type { RealtimeClient, RealtimeState } from "../realtime/realtimeClient";
import type { ApiClient } from "../shared/apiClient";
import type { NormalizedRoomPoint } from "./pixiRoomCanvasMath";
import { deriveRemoteOccupants, interpolateOccupantPositions } from "./pixiRoomCanvasState";
import { PixiRoomCanvas } from "./PixiRoomCanvas";
import type { RoomChatMessage, RoomDetailResponse } from "./api";

const keyboardStep = 80;
const interpolationStep = 24;

export function RoomView({
  apiClient,
  onNavigate,
  onOperationalIssue,
  realtimeClient,
  roomSlug,
}: {
  apiClient: ApiClient;
  onNavigate?: (pathname: string) => void;
  onOperationalIssue?: (issue: FrontendIssue) => void;
  realtimeClient: RealtimeClient;
  roomSlug: string;
}) {
  const [activeRoomSlug, setActiveRoomSlug] = useState(roomSlug);
  const [room, setRoom] = useState<RoomDetailResponse | null>(null);
  const [messages, setMessages] = useState<RoomChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState("");
  const [realtime, setRealtime] = useState<RealtimeState>(() => ({
    status: realtimeClient.status,
    snapshot: realtimeClient.snapshot,
    messages: realtimeClient.messages,
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
    setActiveRoomSlug(roomSlug);
  }, [roomSlug]);

  useEffect(() => {
    if (!realtime.snapshot?.room.slug || realtime.snapshot.room.slug === activeRoomSlug) return;

    setActiveRoomSlug(realtime.snapshot.room.slug);
    const pathname = `/rooms/${encodeURIComponent(realtime.snapshot.room.slug)}`;
    window.history.pushState({}, "", pathname);
    onNavigate?.(pathname);
  }, [activeRoomSlug, onNavigate, realtime.snapshot?.room.slug]);

  useEffect(() => {
    let active = true;
    setRoom(null);
    setMessages([]);

    apiClient
      .getRoom(activeRoomSlug)
      .then((response) => {
        if (!active) return;
        setRoom(response);
        setError(null);
      })
      .catch((nextError: unknown) => {
        if (!active) return;
        const message = nextError instanceof Error ? nextError.message : "Unable to load room.";
        setError(message);
        onOperationalIssue?.({ source: "room_load", message });
      });

    apiClient
      .listRoomMessages(activeRoomSlug)
      .then((response) => {
        if (!active) return;
        setMessages((current) => mergeMessages(current, response.messages));
      })
      .catch(() => {
        if (!active) return;
      });

    return () => {
      active = false;
    };
  }, [activeRoomSlug, apiClient]);

  useEffect(() => realtimeClient.subscribe((state) => setRealtime(state)), [realtimeClient]);
  useEffect(() => realtimeClient.connect(activeRoomSlug), [activeRoomSlug, realtimeClient]);
  useEffect(() => {
    if (realtime.status !== "error" || !realtime.error) return;

    onOperationalIssue?.({ source: "realtime", message: realtime.error });
  }, [onOperationalIssue, realtime.error, realtime.status]);
  useEffect(() => {
    if (realtime.messages.length === 0) return;

    setMessages((current) => mergeMessages(current, realtime.messages));
  }, [realtime.messages]);
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
  }, [activeRoomSlug, localOccupant, realtimeClient, room]);

  function handlePointerIntent(point: NormalizedRoomPoint) {
    if (!room) return;

    realtimeClient.requestMovement({
      roomSlug: activeRoomSlug,
      destination: {
        x: Math.round(point.x * room.room.layout.width),
        y: Math.round(point.y * room.room.layout.height)
      },
      source: "pointer"
    });
  }

  function handleTeleport(targetRoom: string) {
    realtimeClient.requestTeleport({
      roomSlug: activeRoomSlug,
      targetRoom
    });
  }

  function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = chatDraft.trim();
    if (!body) return;

    realtimeClient.sendChatMessage({ roomSlug: activeRoomSlug, body });
    setChatDraft("");
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
            {room.room.layout.teleports.map((teleport) => (
              <button key={teleport.targetRoom} onClick={() => handleTeleport(teleport.targetRoom)} type="button">
                {`Teleport to ${teleport.label}`}
              </button>
            ))}
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
        <form onSubmit={handleChatSubmit}>
          <label>
            Message
            <input value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} />
          </label>
          <button type="submit">Send</button>
        </form>
        {messages.length === 0 ? <p>No messages yet.</p> : null}
        <ul>
          {messages.map((message) => (
            <li key={message.id}>
              <strong>{message.userName}</strong>
              {`: ${message.body}`}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function mergeMessages(current: RoomChatMessage[], incoming: RoomChatMessage[]): RoomChatMessage[] {
  const merged = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => merged.set(message.id, message));
  return [...merged.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
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
