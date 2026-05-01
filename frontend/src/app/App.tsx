import { useEffect, useMemo, useState } from "react";

import { LoginView } from "../auth/LoginView";
import { SessionBadge } from "../auth/SessionBadge";
import { UsernameSetupView } from "../auth/UsernameSetupView";
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
  const [resolvedRealtimeClient] = useState(() =>
    realtimeClient ??
    createRealtimeClient({
      baseUrl: apiClient.baseUrl,
      webSocketBaseUrl: resolveRealtimeBaseUrl(apiClient.baseUrl)
    })
  );
  const resolvedRoute = useMemo(() => routeForSession(route, session), [route, session]);
  const immersiveShell = resolvedRoute.name === "lobby" || resolvedRoute.name === "room";

  function reportIssue(nextIssue: FrontendIssue) {
    setIssue(nextIssue);
    errorReporter?.(nextIssue);
  }

  useEffect(() => {
    setPathname(initialPathname);
  }, [initialPathname]);

  useEffect(() => {
    if (session.status !== "authenticated" || session.user.needsUsername) return;
    if (route.name !== "welcome") return;

    const correctedPathname = routePath(resolvedRoute);
    if (pathname === correctedPathname) return;

    window.history.replaceState({}, "", correctedPathname);
    setPathname(correctedPathname);
  }, [pathname, resolvedRoute, route.name, session]);

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
    <main className={`app-shell${immersiveShell ? " app-shell-immersive" : ""}`}>
      {immersiveShell ? (
        <header className="top-bar top-bar-immersive">
          <div>
            <p className="eyebrow">Social Lobby</p>
            <h1>{routeTitle(resolvedRoute, session)}</h1>
          </div>
          <SessionBadge session={session} />
        </header>
      ) : (
        <header className="top-bar">
          <div>
            <p className="eyebrow">Social Lobby</p>
            <h1>{routeTitle(resolvedRoute, session)}</h1>
          </div>
          <SessionBadge session={session} />
        </header>
      )}
      {issue ? <p className={`app-alert${immersiveShell ? " app-alert-immersive" : ""}`} role="alert">{formatIssue(issue)}</p> : null}
      <section className={`content-panel${immersiveShell ? " content-panel-immersive" : ""}`}>
        <RouteView
          apiClient={apiClient}
          onNavigate={setPathname}
          realtimeClient={resolvedRealtimeClient}
          route={resolvedRoute}
          session={session}
          setSession={setSession}
          reportIssue={reportIssue}
        />
      </section>
    </main>
  );
}

function routePath(route: AppRoute): string {
  switch (route.name) {
    case "welcome":
      return "/welcome";
    case "invite":
      return route.code ? `/invite/${encodeURIComponent(route.code)}` : "/invite";
    case "lobby":
      return "/lobby";
    case "room":
      return `/rooms/${encodeURIComponent(route.roomId)}`;
    case "not-found":
      return "/missing";
  }
}

function resolveRealtimeBaseUrl(apiBaseUrl: string): string {
  if (typeof window === "undefined") return apiBaseUrl;
  if (apiBaseUrl !== "/api") return apiBaseUrl;
  if (!/^517\d$/.test(window.location.port)) return apiBaseUrl;

  return `${window.location.protocol}//${window.location.hostname}:8081/api`;
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

function routeTitle(route: AppRoute, session: SessionState) {
  switch (route.name) {
    case "welcome":
      return session.status === "authenticated" && session.user.needsUsername ? "Choose your username" : "Welcome";
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
  if (session.status !== "authenticated" && (route.name === "lobby" || route.name === "room")) {
    return { name: "welcome" };
  }

  if (session.status === "authenticated" && !session.user.needsUsername && route.name === "welcome") {
    return { name: "lobby" };
  }

  return route;
}

function RouteView({
  apiClient,
  onNavigate,
  reportIssue,
  realtimeClient,
  route,
  session,
  setSession,
}: {
  apiClient: ApiClient;
  onNavigate: (pathname: string) => void;
  realtimeClient: RealtimeClient;
  route: AppRoute;
  session: SessionState;
  setSession: (session: SessionState) => void;
  reportIssue: (issue: FrontendIssue) => void;
}) {
  if (session.status === "authenticated" && session.user.needsUsername) {
    return (
      <UsernameSetupView
        apiClient={apiClient}
        onComplete={(profile) => {
          setSession({
            status: "authenticated",
            user: {
              ...session.user,
              displayName: profile.displayName,
              username: profile.username,
              needsUsername: false
            }
          });
          const pathname = "/lobby";
          window.history.pushState({}, "", pathname);
          onNavigate(pathname);
        }}
        session={session}
      />
    );
  }

  switch (route.name) {
    case "welcome":
      return <LoginView />;
    case "invite":
      return <InviteGate apiClient={apiClient} initialCode={route.code} />;
    case "lobby":
      return <LobbyView apiClient={apiClient} onNavigate={onNavigate} session={session as Extract<SessionState, { status: "authenticated" }>} />;
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
