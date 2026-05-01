import { type FormEvent, useState } from "react";
import type { ApiClient } from "../shared/apiClient";
import type { SessionState } from "./session";

export function UsernameSetupView({
  apiClient,
  session,
  onComplete
}: {
  apiClient: ApiClient;
  session: Extract<SessionState, { status: "authenticated" }>;
  onComplete: (input: { displayName: string; username: string }) => void;
}) {
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      const profile = await apiClient.updateProfile(username);
      onComplete(profile);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to save username.");
    }
  }

  return (
    <section className="onboarding-shell">
      <div className="onboarding-card">
        <p className="section-kicker">First entry</p>
        <h2>Choose the name people will see in every room.</h2>
        <p className="section-copy">
          Your Google account signs you in. Your username is the room identity that appears in chat, invitations, and presence.
        </p>
        <div className="identity-chip">
          <img alt="" className="identity-chip__avatar" src="/avatars/default-user.svg" />
          <div>
            <strong>{session.user.email}</strong>
            <p>{session.user.displayName}</p>
          </div>
        </div>
        <form className="username-form" onSubmit={handleSubmit}>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            maxLength={24}
            minLength={3}
            onChange={(event) => setUsername(event.target.value)}
            pattern="[A-Za-z0-9_]{3,24}"
            placeholder="Pick something memorable"
            value={username}
          />
          <button disabled={status === "submitting" || username.trim() === ""} type="submit">
            Enter my room
          </button>
        </form>
        <p className="section-footnote">Use 3-24 letters, numbers, or underscores.</p>
        {message ? <p className="form-message form-message-error">{message}</p> : null}
      </div>
      <div aria-hidden="true" className="onboarding-art">
        <img src="/illustrations/username-lounge.svg" />
      </div>
    </section>
  );
}
