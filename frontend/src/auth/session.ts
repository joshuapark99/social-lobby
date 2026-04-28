export type SessionState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: { displayName: string } }
  | { status: "error"; message: string };

export type BootstrapSession = () => Promise<SessionState>;

export async function bootstrapSession(): Promise<SessionState> {
  const response = await fetch("/api/auth/session", {
    credentials: "include"
  });

  if (response.ok) {
    const body = (await response.json()) as { email?: string };
    return {
      status: "authenticated",
      user: { displayName: body.email ?? "Signed-in user" }
    };
  }

  if (response.status === 401) {
    return { status: "anonymous" };
  }

  throw new Error("Unable to check session.");
}
