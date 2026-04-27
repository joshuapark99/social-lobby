import type { RealtimeClient } from "../realtime/realtimeClient";

export function RoomView({ realtimeClient }: { realtimeClient: RealtimeClient }) {
  return (
    <div className="room-layout">
      <section aria-label="Room canvas" className="room-surface">
        <p>Pixi room surface placeholder</p>
        <p className="muted">Realtime: {realtimeClient.status}</p>
      </section>
      <section aria-label="Room chat" className="chat-panel">
        <h2>Chat</h2>
        <p>Room chat placeholder</p>
      </section>
    </div>
  );
}
