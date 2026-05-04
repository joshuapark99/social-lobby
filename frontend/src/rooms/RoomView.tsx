import { type FormEvent, useEffect, useState } from "react";
import type { FrontendIssue } from "../app/App";
import type { RealtimeClient, RealtimeOccupant, RealtimeState } from "../realtime/realtimeClient";
import { ApiError, type ApiClient } from "../shared/apiClient";
import type { NormalizedRoomPoint } from "./pixiRoomCanvasMath";
import { deriveRemoteOccupants } from "./pixiRoomCanvasState";
import { PixiRoomCanvas } from "./PixiRoomCanvas";
import type { RoomChatMessage, RoomDetailResponse } from "./api";
import { CommunityNavigation } from "./CommunityNavigation";
import { RoomChatPanel } from "./RoomChatPanel";

const keyboardStep = 80;

export function RoomView({
  apiClient,
  onNavigate,
  onOperationalIssue,
  realtimeClient,
  communitySlug,
  roomSlug,
}: {
  apiClient: ApiClient;
  communitySlug?: string;
  onNavigate?: (pathname: string) => void;
  onOperationalIssue?: (issue: FrontendIssue) => void;
  realtimeClient: RealtimeClient;
  roomSlug: string;
}) {
  const [activeRoomSlug, setActiveRoomSlug] = useState(roomSlug);
  const [room, setRoom] = useState<RoomDetailResponse | null>(null);
  const [joinedRoomSlug, setJoinedRoomSlug] = useState<string | null>(null);
  const [messages, setMessages] = useState<RoomChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState("");
  const [displayedLocalOccupant, setDisplayedLocalOccupant] = useState<RealtimeOccupant | null>(null);
  const [displayedRemoteOccupants, setDisplayedRemoteOccupants] = useState<RealtimeOccupant[]>([]);
  const [realtime, setRealtime] = useState<RealtimeState>(() => ({
    status: realtimeClient.status,
    snapshot: realtimeClient.snapshot,
    messages: realtimeClient.messages,
    error: realtimeClient.error
  }));

  useEffect(() => {
    setActiveRoomSlug(roomSlug);
  }, [roomSlug]);

  useEffect(() => {
    let active = true;
    setRoom(null);
    setMessages([]);
    setJoinedRoomSlug(null);

    apiClient
      .getRoom(activeRoomSlug, communitySlug)
      .then((response) => {
        if (!active) return;
        setRoom(response);
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
        const message = nextError instanceof Error ? nextError.message : "Unable to load room.";
        setError(message);
        onOperationalIssue?.({ source: "room_load", message });
      });

    return () => {
      active = false;
    };
  }, [activeRoomSlug, apiClient, communitySlug, onNavigate, onOperationalIssue]);

  useEffect(() => {
    if (joinedRoomSlug !== activeRoomSlug) return;

    let active = true;
    apiClient
      .listRoomMessages(activeRoomSlug)
      .then((response) => {
        if (!active) return;
        setMessages((current) => mergeMessages(current, response.messages));
      })
      .catch((nextError: unknown) => {
        if (!active) return;
        if (nextError instanceof ApiError && nextError.status === 403) {
          const pathname = "/invite";
          window.history.pushState({}, "", pathname);
          onNavigate?.(pathname);
        }
      });

    return () => {
      active = false;
    };
  }, [activeRoomSlug, apiClient, joinedRoomSlug, onNavigate]);

  useEffect(() => realtimeClient.subscribe((state) => setRealtime(state)), [realtimeClient]);
  useEffect(() => {
    if (!room || error || joinedRoomSlug !== activeRoomSlug) return;

    return realtimeClient.connect(activeRoomSlug);
  }, [activeRoomSlug, error, joinedRoomSlug, realtimeClient, room]);
  useEffect(() => {
    if (realtime.status !== "error" || !realtime.error) return;

    onOperationalIssue?.({ source: "realtime", message: realtime.error });
  }, [onOperationalIssue, realtime.error, realtime.status]);
  useEffect(() => {
    if (joinedRoomSlug !== activeRoomSlug || realtime.messages.length === 0) return;

    setMessages((current) => mergeMessages(current, realtime.messages));
  }, [activeRoomSlug, joinedRoomSlug, realtime.messages]);
  useEffect(() => {
    if (joinedRoomSlug !== activeRoomSlug || !realtime.snapshot) {
      setDisplayedLocalOccupant(null);
      setDisplayedRemoteOccupants([]);
      return;
    }

    const nextLocalOccupant =
      realtime.snapshot.occupants.find((occupant) => occupant.connectionId === realtime.snapshot?.self.connectionId) ?? realtime.snapshot.self;
    setDisplayedLocalOccupant(nextLocalOccupant);
    setDisplayedRemoteOccupants(
      deriveRemoteOccupants({
        self: nextLocalOccupant,
        occupants: realtime.snapshot.occupants
      })
    );
  }, [activeRoomSlug, joinedRoomSlug, realtime.snapshot]);
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!room || joinedRoomSlug !== activeRoomSlug || !displayedLocalOccupant) return;

      const delta = keyboardDelta(event.key);
      if (!delta) return;

      realtimeClient.requestMovement({
        roomSlug: activeRoomSlug,
        destination: {
          x: displayedLocalOccupant.position.x + delta.x,
          y: displayedLocalOccupant.position.y + delta.y
        },
        source: "keyboard"
      });
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeRoomSlug, displayedLocalOccupant, joinedRoomSlug, realtimeClient, room]);

  function handlePointerIntent(point: NormalizedRoomPoint) {
    if (!room || joinedRoomSlug !== activeRoomSlug) return;

    realtimeClient.requestMovement({
      roomSlug: activeRoomSlug,
      destination: {
        x: Math.round(point.x * room.room.layout.width),
        y: Math.round(point.y * room.room.layout.height)
      },
      source: "pointer"
    });
  }

  function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (joinedRoomSlug !== activeRoomSlug) return;
    const body = chatDraft.trim();
    if (!body) return;

    realtimeClient.sendChatMessage({ roomSlug: activeRoomSlug, body });
    setChatDraft("");
  }

  return (
    <div className="social-room-app">
      <CommunityNavigation
        activeCommunitySlug={room?.community.slug ?? communitySlug}
        activeRoomSlug={activeRoomSlug}
        apiClient={apiClient}
        onNavigate={onNavigate}
      />
      <div className="room-layout">
        <section aria-label="Room canvas" className="room-stage">
        {!room && !error ? <p>Loading room...</p> : null}
        {error ? <p>{error}</p> : null}
        {room ? (
          <>
            <img alt="" className="room-stage__background" src={`/${room.room.layout.backgroundAsset.replace(/\.png$/u, ".svg")}`} />
            <div className="room-stage__hud">
              <h2>{room.room.name}</h2>
              {joinedRoomSlug === activeRoomSlug ? (
                <p>Joined room</p>
              ) : (
                <button className="room-stage__join" onClick={() => setJoinedRoomSlug(activeRoomSlug)} type="button">
                  Join room
                </button>
              )}
            </div>
            <div className="room-stage__canvas-shell">
              <PixiRoomCanvas
                layout={room.room.layout}
                localOccupant={displayedLocalOccupant}
                remoteOccupants={displayedRemoteOccupants}
                onPointerIntent={handlePointerIntent}
              />
            </div>
          </>
        ) : null}
        <p className="room-stage__hint">Realtime: {realtime.status}</p>
        {realtime.error ? <p className="form-message form-message-error">{realtime.error}</p> : null}
        </section>
        <RoomChatPanel
          draft={chatDraft}
          disabled={joinedRoomSlug !== activeRoomSlug}
          messages={messages}
          onDraftChange={setChatDraft}
          onSubmit={handleChatSubmit}
          subtitle={`${room?.room.name ?? "Room"} chat`}
          title="Room chat"
        />
      </div>
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
