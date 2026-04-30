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

export type RealtimeState = {
  status: "idle" | "connecting" | "connected" | "error";
  snapshot: RealtimeSnapshot | null;
  messages: RoomChatMessage[];
  error: string | null;
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
    connect,
    requestMovement,
    requestTeleport,
    sendChatMessage,
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
    updateState({ status: "connecting", snapshot: null, messages: [], error: null });

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
            error: null
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
            error: null
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
            error: null
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
            error: null
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
            error: null
          });
          return;
        }
        case "error": {
          updateState({
            status: "error",
            snapshot: client.snapshot,
            messages: client.messages,
            error: typeof envelope.payload?.message === "string" ? envelope.payload.message : "Realtime connection failed."
          });
        }
      }
    };

    const handleClose = () => {
      if (activeSocket !== socket) return;
      updateState({ status: "idle", snapshot: null, messages: [], error: null });
    };

    const handleError = () => {
      updateState({ status: "error", snapshot: client.snapshot, messages: client.messages, error: "Realtime connection failed." });
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
      updateState({ status: "idle", snapshot: null, messages: [], error: null });
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

  function updateState(nextState: RealtimeState) {
    client.status = nextState.status;
    client.snapshot = nextState.snapshot;
    client.messages = nextState.messages;
    client.error = nextState.error;
    listeners.forEach((listener) => listener({ ...nextState }));
  }

  return client;
}

function websocketUrl(baseUrl: string, roomSlug: string): string {
  const url = new URL(baseUrl, window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/rooms/${encodeURIComponent(roomSlug)}/ws`;
  return url.toString();
}
