import { type FormEvent, useState } from "react";
import type { ApiClient } from "../shared/apiClient";
import type { SessionState } from "../auth/session";
import { CommunityNavigation } from "./CommunityNavigation";
import { RoomChatPanel } from "./RoomChatPanel";
import { personalRoomFor, personalRoomMessages } from "./personalRoom";

export function LobbyView({
  apiClient,
  onNavigate,
  session
}: {
  apiClient: ApiClient;
  onNavigate?: (pathname: string) => void;
  session: Extract<SessionState, { status: "authenticated" }>;
}) {
  const room = personalRoomFor(session.user.username ?? session.user.displayName);
  const [chatDraft, setChatDraft] = useState("");
  const [messages, setMessages] = useState(() => personalRoomMessages(session.user.username ?? session.user.displayName));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = chatDraft.trim();
    if (!body) return;

    setMessages((current) => [
      ...current,
      {
        id: `personal-${current.length + 1}`,
        roomSlug: room.room.slug,
        userId: "self",
        userName: session.user.username ?? session.user.displayName,
        body,
        createdAt: new Date().toISOString()
      }
    ]);
    setChatDraft("");
  }

  return (
    <div className="social-room-app">
      <CommunityNavigation apiClient={apiClient} onNavigate={onNavigate} />
      <div className="room-layout">
        <section aria-label="Room canvas" className="room-stage room-stage-personal">
          <img alt="" className="room-stage__background" src="/rooms/personal-suite.svg" />
          <div className="room-stage__hud">
            <div>
              <p className="section-kicker">Personal room</p>
              <h2>{room.room.name}</h2>
              <p className="section-copy">Your landing space. Use the community menu to enter shared rooms or redeem a fresh invite code.</p>
            </div>
          </div>
          <div className="room-stage__avatar-card">
            <img alt="" src="/avatars/default-user.svg" />
            <div>
              <strong>{session.user.username ?? session.user.displayName}</strong>
              <p>Spawned and ready</p>
            </div>
          </div>
        </section>
        <RoomChatPanel
          draft={chatDraft}
          messages={messages}
          onDraftChange={setChatDraft}
          onSubmit={handleSubmit}
          subtitle="Personal room feed"
          title="Room chat"
        />
      </div>
    </div>
  );
}
