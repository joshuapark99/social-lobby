import { useEffect, useMemo, useState } from "react";

import { LoginView } from "../auth/LoginView";
import { SessionBadge } from "../auth/SessionBadge";
import {
  bootstrapSession as defaultBootstrapSession,
  type BootstrapSession,
  type SessionState,
} from "../auth/session";
import { InviteGate } from "../invites/InviteGate";
import type { RealtimeClient } from "../realtime/realtimeClient";
import { createRealtimeClient } from "../realtime/realtimeClient";
import { LobbyView } from "../rooms/LobbyView";
import { RoomView } from "../rooms/RoomView";
import type { ApiClient } from "../shared/apiClient";
import { createApiClient } from "../shared/apiClient";
import { type AppRoute, parseRoute } from "./routing";

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
  realtimeClient,
}: AppProps) {
  const route = useMemo(() => parseRoute(initialPathname), [initialPathname]);
  const [session, setSession] = useState<SessionState>({ status: "loading" });
  const [resolvedRealtimeClient] = useState(() => realtimeClient ?? createRealtimeClient({ baseUrl: apiClient.baseUrl }));
  const resolvedRoute = useMemo(() => routeForSession(route, session), [route, session]);

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
          <h1>{routeTitle(resolvedRoute)}</h1>
        </div>
        <SessionBadge session={session} />
      </header>
      <section className="content-panel">
        <RouteView apiClient={apiClient} realtimeClient={resolvedRealtimeClient} route={resolvedRoute} />
      </section>
    </main>
  );
}

function routeTitle(route: AppRoute) {
  switch (route.name) {
    case "welcome":
      return "Welcome";
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

function routeForSession(route: AppRoute, session: SessionState): AppRoute {
  if ((session.status === "loading" || session.status === "anonymous") && (route.name === "lobby" || route.name === "room")) {
    return { name: "welcome" };
  }

  return route;
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
    case "welcome":
      return <LoginView />;
    case "invite":
      return <InviteGate apiClient={apiClient} initialCode={route.code} />;
    case "lobby":
      return <LobbyView apiClient={apiClient} />;
    case "room":
      return <RoomView apiClient={apiClient} realtimeClient={realtimeClient} roomSlug={route.roomId} />;
    case "not-found":
      return <p>This route does not exist yet.</p>;
  }
}
