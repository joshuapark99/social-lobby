import { type FormEvent } from "react";
import type { RoomChatMessage } from "./api";

export function RoomChatPanel({
  title,
  subtitle,
  messages,
  draft,
  disabled = false,
  disabledMessage = "Join the room to participate in chat.",
  joinLabel = "Join room",
  onJoin,
  onDraftChange,
  onSubmit
}: {
  title: string;
  subtitle: string;
  messages: RoomChatMessage[];
  draft: string;
  disabled?: boolean;
  disabledMessage?: string;
  joinLabel?: string;
  onJoin?: () => void;
  onDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section aria-label="Room chat" className="chat-panel twitch-chat">
      <div className="chat-panel__header">
        <p className="section-kicker">{title}</p>
        <h2>{subtitle}</h2>
      </div>
      <div className="twitch-chat__messages">
        {messages.length === 0 ? <p className="muted">The room is quiet right now.</p> : null}
        <ul>
          {messages.map((message) => (
            <li key={message.id}>
              <time className="twitch-chat__timestamp" dateTime={message.createdAt}>
                {formatMessageTime(message.createdAt)}
              </time>
              <span className="twitch-chat__name">{message.userName}</span>
              <span className="twitch-chat__separator">: </span>
              <span className="twitch-chat__body">{message.body}</span>
            </li>
          ))}
        </ul>
      </div>
      <form className="twitch-chat__composer" onSubmit={onSubmit}>
        <label htmlFor="room-chat-input">Message</label>
        {disabled ? (
          <div className="twitch-chat__join-row">
            <p className="muted">{disabledMessage}</p>
            <button onClick={onJoin} type="button">
              {joinLabel}
            </button>
          </div>
        ) : (
          <div className="twitch-chat__input-row">
            <input id="room-chat-input" onChange={(event) => onDraftChange(event.target.value)} value={draft} />
            <button type="submit">Send</button>
          </div>
        )}
      </form>
    </section>
  );
}

function formatMessageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}
