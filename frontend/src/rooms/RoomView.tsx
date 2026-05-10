import { type FormEvent, useEffect, useState } from "react";
import type { FrontendIssue } from "../app/App";
import type { RealtimeClient, RealtimeOccupant, RealtimeState } from "../realtime/realtimeClient";
import { ApiError, type ApiClient } from "../shared/apiClient";
import type { NormalizedRoomPoint } from "./pixiRoomCanvasMath";
import { deriveRemoteOccupants } from "./pixiRoomCanvasState";
import { PixiRoomCanvas } from "./PixiRoomCanvas";
import type { RoomChatMessage, RoomDetailResponse, RoomTable } from "./api";
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
  const [tableDraft, setTableDraft] = useState({ label: "", seats: "4", x: "720", y: "560" });
  const [tableStatus, setTableStatus] = useState<"idle" | "saving" | "error">("idle");
  const [displayedLocalOccupant, setDisplayedLocalOccupant] = useState<RealtimeOccupant | null>(null);
  const [displayedRemoteOccupants, setDisplayedRemoteOccupants] = useState<RealtimeOccupant[]>([]);
  const [realtime, setRealtime] = useState<RealtimeState>(() => ({
    status: realtimeClient.status,
    snapshot: realtimeClient.snapshot,
    messages: realtimeClient.messages,
    error: realtimeClient.error,
    voice: realtimeClient.voice
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

  async function publishTables(nextTables: RoomTable[]) {
    if (!room) return;

    setTableStatus("saving");
    setError(null);

    try {
      const response = await apiClient.updateCommunityRoomTables(room.community.id, room.room.slug, nextTables);
      setRoom(response);
      setTableStatus("idle");
    } catch (nextError) {
      setTableStatus("error");
      setError(nextError instanceof Error ? nextError.message : "Unable to update tables.");
    }
  }

  function handleTableSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!room) return;

    const label = tableDraft.label.trim();
    const seats = Number(tableDraft.seats);
    const x = Number(tableDraft.x);
    const y = Number(tableDraft.y);
    if (!label || !Number.isInteger(seats) || !Number.isInteger(x) || !Number.isInteger(y)) return;

    const nextTable: RoomTable = {
      id: nextTableId(),
      label,
      x,
      y,
      w: 320,
      h: 180,
      seats
    };
    void publishTables([...(room.room.layout.tables ?? []), nextTable]);
    setTableDraft({ label: "", seats: "4", x: String(Math.min(x + 80, room.room.layout.width - nextTable.w)), y: String(y) });
  }

  const canManageRoom = room?.community.viewerRole === "owner" || room?.community.viewerRole === "admin";
  const placedTables = room?.room.layout.tables ?? [];

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
            <header className="room-stage__header">
              <h2>{room.room.name}</h2>
              <p>{joinedRoomSlug === activeRoomSlug ? "Joined room" : "Previewing room"}</p>
            </header>
            <div className="room-stage__canvas-shell">
              <PixiRoomCanvas
                layout={room.room.layout}
                localOccupant={displayedLocalOccupant}
                remoteOccupants={displayedRemoteOccupants}
                onPointerIntent={handlePointerIntent}
              />
            </div>
            {canManageRoom ? (
              <section className="room-table-editor" aria-label="Room table editor">
                <div>
                  <h3>Tables</h3>
                  <p>{placedTables.length} placed</p>
                </div>
                <form onSubmit={handleTableSubmit}>
                  <input
                    aria-label="Table label"
                    maxLength={60}
                    onChange={(event) => setTableDraft((current) => ({ ...current, label: event.target.value }))}
                    placeholder="Table label"
                    value={tableDraft.label}
                  />
                  <input
                    aria-label="Seats"
                    max={12}
                    min={1}
                    onChange={(event) => setTableDraft((current) => ({ ...current, seats: event.target.value }))}
                    type="number"
                    value={tableDraft.seats}
                  />
                  <input
                    aria-label="X position"
                    min={0}
                    onChange={(event) => setTableDraft((current) => ({ ...current, x: event.target.value }))}
                    type="number"
                    value={tableDraft.x}
                  />
                  <input
                    aria-label="Y position"
                    min={0}
                    onChange={(event) => setTableDraft((current) => ({ ...current, y: event.target.value }))}
                    type="number"
                    value={tableDraft.y}
                  />
                  <button disabled={tableStatus === "saving" || tableDraft.label.trim() === ""} type="submit">
                    Add table
                  </button>
                </form>
                {placedTables.length > 0 ? (
                  <div className="room-table-editor__list">
                    {placedTables.map((table) => (
                      <div className="room-table-editor__row" key={table.id}>
                        <span>
                          {table.label} · {table.seats} seats
                        </span>
                        <button
                          disabled={tableStatus === "saving"}
                          onClick={() => void publishTables(placedTables.filter((candidate) => candidate.id !== table.id))}
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}
        <p className="room-stage__hint">Realtime: {realtime.status}</p>
        {realtime.error ? <p className="form-message form-message-error">{realtime.error}</p> : null}
        </section>
        <RoomChatPanel
          draft={chatDraft}
          disabled={joinedRoomSlug !== activeRoomSlug}
          onJoin={() => setJoinedRoomSlug(activeRoomSlug)}
          messages={messages}
          onDraftChange={setChatDraft}
          onSubmit={handleChatSubmit}
          subtitle={`${room?.room.name ?? "Room"} chat`}
          title="Room chat"
        />
      </div>
      <section aria-label="Table voice" className="room-voice">
        <div className="room-voice__header">
          <div>
            <p className="section-kicker">Table voice</p>
            <h2>Voice starts at a table</h2>
          </div>
        </div>
        <p className="room-voice__status">
          {placedTables.length > 0
            ? "Choose a table once table seating is enabled. Room-wide voice is off."
            : "This room has no tables yet. Room-wide voice is off."}
        </p>
      </section>
    </div>
  );
}

function nextTableId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `table-${Date.now().toString(36)}`;
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
