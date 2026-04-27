import type { SessionState } from "./session";

export function SessionBadge({ session }: { session: SessionState }) {
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
