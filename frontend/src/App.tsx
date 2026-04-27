import { type FormEvent, useEffect, useMemo, useState } from "react";

import type { ApiClient } from "./apiClient";
import { createApiClient } from "./apiClient";
import type { RealtimeClient } from "./realtimeClient";
import { createRealtimeClient } from "./realtimeClient";
import { type AppRoute, parseRoute } from "./routing";
import {
  bootstrapSession as defaultBootstrapSession,
  type BootstrapSession,
  type SessionState,
} from "./session";

interface AppProps {
  apiClient?: ApiClient;
  bootstrapSession?: BootstrapSession;
  initialPathname?: string;
  realtimeClient?: RealtimeClient;
}

export function App({
  apiClient = createApiClient(),
  bootstrapSession = defaultBootstrapSession,
  initialPathname = window.location.pathname,
  realtimeClient = createRealtimeClient(),
}: AppProps) {
  const route = useMemo(() => parseRoute(initialPathname), [initialPathname]);
  const [session, setSession] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    bootstrapSession()
      .then((nextSession) => {
        if (active) {
          setSession(nextSession);
        }
      })
      .catch(() => {
        if (active) {
          setSession({ status: "error", message: "Unable to check session." });
        }
      });

    return () => {
      active = false;
    };
  }, [bootstrapSession]);

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">Social Lobby</p>
          <h1>{routeTitle(route)}</h1>
        </div>
        <SessionBadge session={session} />
      </header>
      <section className="content-panel">
        <RouteView apiClient={apiClient} realtimeClient={realtimeClient} route={route} />
      </section>
    </main>
  );
}

function routeTitle(route: AppRoute) {
  switch (route.name) {
    case "login":
      return "Sign in";
    case "invite":
      return "Redeem invite";
    case "lobby":
      return "Lobby";
    case "room":
      return `Room: ${route.roomId}`;
    case "not-found":
      return "Not found";
  }
}

function SessionBadge({ session }: { session: SessionState }) {
  if (session.status === "loading") {
    return <p className="session-badge">Checking session...</p>;
  }

  if (session.status === "authenticated") {
    return <p className="session-badge">Signed in as {session.user.displayName}</p>;
  }

  if (session.status === "error") {
    return <p className="session-badge session-badge-error">{session.message}</p>;
  }

  return <p className="session-badge">Not signed in</p>;
}

function RouteView({
  apiClient,
  realtimeClient,
  route,
}: {
  apiClient: ApiClient;
  realtimeClient: RealtimeClient;
  route: AppRoute;
}) {
  switch (route.name) {
    case "login":
      return <p>Continue with Google to enter the lobby.</p>;
    case "invite":
      return <InviteGate apiClient={apiClient} initialCode={route.code} />;
    case "lobby":
      return (
        <div className="stack">
          <p>Room list placeholder</p>
          <p className="muted">API boundary: {apiClient.baseUrl}</p>
        </div>
      );
    case "room":
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
    case "not-found":
      return <p>This route does not exist yet.</p>;
  }
}

function InviteGate({ apiClient, initialCode }: { apiClient: ApiClient; initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [status, setStatus] = useState<"idle" | "submitting" | "redeemed" | "already-member" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      const result = await apiClient.redeemInvite(code.trim());
      setStatus(result.status);
      setMessage(result.status === "already-member" ? "Invite already accepted." : "Invite accepted.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to redeem invite.");
    }
  }

  return (
    <form className="invite-form" onSubmit={submitInvite}>
      <label htmlFor="invite-code">Invite code</label>
      <div className="inline-form">
        <input
          id="invite-code"
          name="invite-code"
          onChange={(event) => setCode(event.target.value)}
          type="text"
          value={code}
        />
        <button disabled={status === "submitting" || code.trim() === ""} type="submit">
          Redeem
        </button>
      </div>
      {message ? <p className={status === "error" ? "form-message form-message-error" : "form-message"}>{message}</p> : null}
    </form>
  );
}
