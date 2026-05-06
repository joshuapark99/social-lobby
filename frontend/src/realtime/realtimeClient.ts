import type { RoomChatMessage } from "../rooms/api";

export type RealtimeOccupant = {
  connectionId: string;
  userId: string;
  email: string;
  position: { x: number; y: number };
};

export type RealtimeSnapshot = {
  room: { slug: string; name: string; layoutVersion: number };
  self: RealtimeOccupant;
  occupants: RealtimeOccupant[];
};

export type VoiceParticipant = {
  connectionId: string;
  userId: string;
  email: string;
  name?: string;
};

export type VoiceSignal = {
  fromConnectionId: string;
  targetConnectionId: string;
  signal: unknown;
};

export type RealtimeVoiceState = {
  self: VoiceParticipant | null;
  participants: VoiceParticipant[];
  error: string | null;
  signals: VoiceSignal[];
};

export type RealtimeState = {
  status: "idle" | "connecting" | "connected" | "error";
  snapshot: RealtimeSnapshot | null;
  messages: RoomChatMessage[];
  error: string | null;
  voice: RealtimeVoiceState;
};

export type MovementRequest = {
  roomSlug: string;
  destination: { x: number; y: number };
  source: "pointer" | "keyboard";
};

export type TeleportRequest = {
  roomSlug: string;
  targetRoom: string;
};

export interface RealtimeClient extends RealtimeState {
  connect(roomSlug: string): () => void;
  requestMovement(input: MovementRequest): void;
  requestTeleport(input: TeleportRequest): void;
  sendChatMessage(input: { roomSlug: string; body: string }): void;
  joinVoice(input: { roomSlug: string }): void;
  leaveVoice(input: { roomSlug: string }): void;
  sendVoiceSignal(input: { roomSlug: string; targetConnectionId: string; signal: unknown }): void;
  subscribe(listener: (state: RealtimeState) => void): () => void;
}

type RealtimeSocket = {
  addEventListener(type: "open" | "message" | "close" | "error", listener: (event: { data?: string }) => void): void;
  removeEventListener(type: "open" | "message" | "close" | "error", listener: (event: { data?: string }) => void): void;
  send(payload: string): void;
  close(): void;
};

export function createRealtimeClient(options: {
  baseUrl?: string;
  webSocketBaseUrl?: string;
  webSocketFactory?: (url: string) => RealtimeSocket;
} = {}): RealtimeClient {
  const listeners = new Set<(state: RealtimeState) => void>();
  const client: RealtimeClient = {
    status: "idle",
    snapshot: null,
    messages: [],
    error: null,
    voice: emptyVoiceState(),
    connect,
    requestMovement,
    requestTeleport,
    sendChatMessage,
    joinVoice,
    leaveVoice,
    sendVoiceSignal,
    subscribe
  };

  const webSocketFactory = options.webSocketFactory ?? ((url: string) => new WebSocket(url));
  let activeSocket: RealtimeSocket | null = null;

  function subscribe(listener: (state: RealtimeState) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function connect(roomSlug: string): () => void {
    activeSocket?.close();

    const socket = webSocketFactory(websocketUrl(options.webSocketBaseUrl ?? options.baseUrl ?? "/api", roomSlug));
    activeSocket = socket;
    updateState({ status: "connecting", snapshot: null, messages: [], error: null, voice: emptyVoiceState() });

    const handleOpen = () => {
      socket.send(
        JSON.stringify({
          version: 1,
          type: "room.join",
          payload: { roomSlug }
        })
      );
    };

    const handleMessage = (event: { data?: string }) => {
      if (!event.data) return;

      const envelope = JSON.parse(event.data) as {
        type: string;
        payload?: Record<string, unknown>;
      };

      switch (envelope.type) {
        case "room.snapshot": {
          updateState({
            status: "connected",
            snapshot: envelope.payload as unknown as RealtimeSnapshot,
            messages: client.messages,
            error: null,
            voice: client.voice
          });
          return;
        }
        case "presence.joined": {
          const occupant = envelope.payload?.occupant as RealtimeOccupant | undefined;
          if (!occupant || !client.snapshot) return;
          updateState({
            status: "connected",
            snapshot: {
              ...client.snapshot,
              occupants: [...client.snapshot.occupants.filter((candidate) => candidate.connectionId !== occupant.connectionId), occupant]
            },
            messages: client.messages,
            error: null,
            voice: client.voice
          });
          return;
        }
        case "presence.left": {
          const connectionId = envelope.payload?.connectionId;
          if (typeof connectionId !== "string" || !client.snapshot) return;
          updateState({
            status: "connected",
            snapshot: {
              ...client.snapshot,
              occupants: client.snapshot.occupants.filter((occupant) => occupant.connectionId !== connectionId)
            },
            messages: client.messages,
            error: null,
            voice: client.voice
          });
          return;
        }
        case "movement.accepted": {
          const occupant = envelope.payload?.occupant as RealtimeOccupant | undefined;
          if (!occupant || !client.snapshot) return;
          updateState({
            status: "connected",
            snapshot: {
              ...client.snapshot,
              self: client.snapshot.self.connectionId === occupant.connectionId ? occupant : client.snapshot.self,
              occupants: client.snapshot.occupants.map((candidate) =>
                candidate.connectionId === occupant.connectionId ? occupant : candidate
              )
            },
            messages: client.messages,
            error: null,
            voice: client.voice
          });
          return;
        }
        case "chat.message": {
          const message = envelope.payload?.message as RoomChatMessage | undefined;
          if (!message) return;
          updateState({
            status: client.status === "idle" ? "connected" : client.status,
            snapshot: client.snapshot,
            messages: [...client.messages.filter((candidate) => candidate.id !== message.id), message],
            error: null,
            voice: client.voice
          });
          return;
        }
        case "voice.snapshot": {
          const payload = envelope.payload as unknown as {
            self?: VoiceParticipant;
            participants?: VoiceParticipant[];
          };
          updateState({
            status: client.status,
            snapshot: client.snapshot,
            messages: client.messages,
            error: null,
            voice: {
              self: payload.self ?? null,
              participants: payload.participants ?? [],
              error: null,
              signals: client.voice.signals
            }
          });
          return;
        }
        case "voice.joined": {
          const participant = envelope.payload?.participant as VoiceParticipant | undefined;
          if (!participant) return;
          updateState({
            status: client.status,
            snapshot: client.snapshot,
            messages: client.messages,
            error: null,
            voice: {
              ...client.voice,
              participants: [...client.voice.participants.filter((candidate) => candidate.connectionId !== participant.connectionId), participant],
              error: null
            }
          });
          return;
        }
        case "voice.left": {
          const connectionId = envelope.payload?.connectionId;
          if (typeof connectionId !== "string") return;
          updateState({
            status: client.status,
            snapshot: client.snapshot,
            messages: client.messages,
            error: null,
            voice: {
              ...client.voice,
              self: client.voice.self?.connectionId === connectionId ? null : client.voice.self,
              participants: client.voice.participants.filter((participant) => participant.connectionId !== connectionId),
              error: null
            }
          });
          return;
        }
        case "voice.signal": {
          const signal = envelope.payload as unknown as VoiceSignal | undefined;
          if (!signal) return;
          updateState({
            status: client.status,
            snapshot: client.snapshot,
            messages: client.messages,
            error: null,
            voice: {
              ...client.voice,
              signals: [signal],
              error: null
            }
          });
          return;
        }
        case "error": {
          const message = typeof envelope.payload?.message === "string" ? envelope.payload.message : "Realtime connection failed.";
          updateState({
            status: "error",
            snapshot: client.snapshot,
            messages: client.messages,
            error: message,
            voice: { ...client.voice, error: message }
          });
        }
      }
    };

    const handleClose = () => {
      if (activeSocket !== socket) return;
      updateState({ status: "idle", snapshot: null, messages: [], error: null, voice: emptyVoiceState() });
    };

    const handleError = () => {
      updateState({
        status: "error",
        snapshot: client.snapshot,
        messages: client.messages,
        error: "Realtime connection failed.",
        voice: { ...client.voice, error: "Realtime connection failed." }
      });
    };

    socket.addEventListener("open", handleOpen);
    socket.addEventListener("message", handleMessage);
    socket.addEventListener("close", handleClose);
    socket.addEventListener("error", handleError);

    return () => {
      if (activeSocket === socket) {
        activeSocket = null;
      }
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("message", handleMessage);
      socket.removeEventListener("close", handleClose);
      socket.removeEventListener("error", handleError);
      socket.close();
      updateState({ status: "idle", snapshot: null, messages: [], error: null, voice: emptyVoiceState() });
    };
  }

  function requestMovement(input: MovementRequest): void {
    activeSocket?.send(
      JSON.stringify({
        version: 1,
        type: "move.request",
        payload: input
      })
    );
  }

  function requestTeleport(input: TeleportRequest): void {
    activeSocket?.send(
      JSON.stringify({
        version: 1,
        type: "teleport.request",
        payload: input
      })
    );
  }

  function sendChatMessage(input: { roomSlug: string; body: string }): void {
    activeSocket?.send(
      JSON.stringify({
        version: 1,
        type: "chat.send",
        payload: input
      })
    );
  }

  function joinVoice(input: { roomSlug: string }): void {
    activeSocket?.send(
      JSON.stringify({
        version: 1,
        type: "voice.join",
        payload: input
      })
    );
  }

  function leaveVoice(input: { roomSlug: string }): void {
    activeSocket?.send(
      JSON.stringify({
        version: 1,
        type: "voice.leave",
        payload: input
      })
    );
  }

  function sendVoiceSignal(input: { roomSlug: string; targetConnectionId: string; signal: unknown }): void {
    activeSocket?.send(
      JSON.stringify({
        version: 1,
        type: "voice.signal",
        payload: input
      })
    );
  }

  function updateState(nextState: RealtimeState) {
    client.status = nextState.status;
    client.snapshot = nextState.snapshot;
    client.messages = nextState.messages;
    client.error = nextState.error;
    client.voice = nextState.voice;
    listeners.forEach((listener) => listener({ ...nextState }));
  }

  return client;
}

function emptyVoiceState(): RealtimeVoiceState {
  return {
    self: null,
    participants: [],
    error: null,
    signals: []
  };
}

function websocketUrl(baseUrl: string, roomSlug: string): string {
  const url = new URL(baseUrl, window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/rooms/${encodeURIComponent(roomSlug)}/ws`;
  return url.toString();
}
