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
  error: string | null;
};

export interface RealtimeClient extends RealtimeState {
  connect(roomSlug: string): () => void;
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
  webSocketFactory?: (url: string) => RealtimeSocket;
} = {}): RealtimeClient {
  const listeners = new Set<(state: RealtimeState) => void>();
  const client: RealtimeClient = {
    status: "idle",
    snapshot: null,
    error: null,
    connect,
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

    const socket = webSocketFactory(websocketUrl(options.baseUrl ?? "/api", roomSlug));
    activeSocket = socket;
    updateState({ status: "connecting", snapshot: null, error: null });

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
            error: null
          });
          return;
        }
        case "error": {
          updateState({
            status: "error",
            snapshot: client.snapshot,
            error: typeof envelope.payload?.message === "string" ? envelope.payload.message : "Realtime connection failed."
          });
        }
      }
    };

    const handleClose = () => {
      if (activeSocket !== socket) return;
      updateState({ status: "idle", snapshot: null, error: null });
    };

    const handleError = () => {
      updateState({ status: "error", snapshot: client.snapshot, error: "Realtime connection failed." });
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
      updateState({ status: "idle", snapshot: null, error: null });
    };
  }

  function updateState(nextState: RealtimeState) {
    client.status = nextState.status;
    client.snapshot = nextState.snapshot;
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
