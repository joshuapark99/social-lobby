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

export type FrontendIssue = {
  source: string;
  message: string;
};

export interface AppProps {
  apiClient?: ApiClient;
  bootstrapSession?: BootstrapSession;
  errorReporter?: (issue: FrontendIssue) => void;
  initialPathname?: string;
  realtimeClient?: RealtimeClient;
}

export function App({
  apiClient = createApiClient(),
  bootstrapSession = defaultBootstrapSession,
  errorReporter,
  initialPathname = window.location.pathname,
  realtimeClient,
}: AppProps) {
  const [pathname, setPathname] = useState(initialPathname);
  const route = useMemo(() => parseRoute(pathname), [pathname]);
  const [session, setSession] = useState<SessionState>({ status: "loading" });
  const [issue, setIssue] = useState<FrontendIssue | null>(null);
  const [resolvedRealtimeClient] = useState(() => realtimeClient ?? createRealtimeClient({ baseUrl: apiClient.baseUrl }));
  const resolvedRoute = useMemo(() => routeForSession(route, session), [route, session]);

  function reportIssue(nextIssue: FrontendIssue) {
    setIssue(nextIssue);
    errorReporter?.(nextIssue);
  }

  useEffect(() => {
    setPathname(initialPathname);
  }, [initialPathname]);

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
          reportIssue({ source: "session", message: "Unable to check session." });
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
      {issue ? <p role="alert">{formatIssue(issue)}</p> : null}
      <section className="content-panel">
        <RouteView
          apiClient={apiClient}
          onNavigate={setPathname}
          realtimeClient={resolvedRealtimeClient}
          route={resolvedRoute}
          reportIssue={reportIssue}
        />
      </section>
    </main>
  );
}

function formatIssue(issue: FrontendIssue): string {
  switch (issue.source) {
    case "room_load":
      return `Room load failed: ${issue.message}`;
    case "realtime":
      return `Realtime issue: ${issue.message}`;
    case "session":
      return `Session issue: ${issue.message}`;
    default:
      return issue.message;
  }
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
  onNavigate,
  reportIssue,
  realtimeClient,
  route,
}: {
  apiClient: ApiClient;
  onNavigate: (pathname: string) => void;
  realtimeClient: RealtimeClient;
  route: AppRoute;
  reportIssue: (issue: FrontendIssue) => void;
}) {
  switch (route.name) {
    case "welcome":
      return <LoginView />;
    case "invite":
      return <InviteGate apiClient={apiClient} initialCode={route.code} />;
    case "lobby":
      return <LobbyView apiClient={apiClient} />;
    case "room":
      return (
        <RoomView
          apiClient={apiClient}
          onNavigate={onNavigate}
          onOperationalIssue={reportIssue}
          realtimeClient={realtimeClient}
          roomSlug={route.roomId}
        />
      );
    case "not-found":
      return <p>This route does not exist yet.</p>;
  }
}
