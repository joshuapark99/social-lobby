export type SessionState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: { displayName: string; email: string; username: string | null; needsUsername: boolean } }
  | { status: "error"; message: string };

export type BootstrapSession = () => Promise<SessionState>;

export async function bootstrapSession(): Promise<SessionState> {
  const response = await fetch("/api/auth/session", {
    credentials: "include"
  });

  if (response.ok) {
    const body = (await response.json()) as {
      email?: string;
      displayName?: string;
      username?: string | null;
      needsUsername?: boolean;
    };
    return {
      status: "authenticated",
      user: {
        displayName: body.displayName ?? body.email ?? "Signed-in user",
        email: body.email ?? "",
        username: body.username ?? null,
        needsUsername: body.needsUsername ?? !body.username
      }
    };
  }

  if (response.status === 401) {
    return { status: "anonymous" };
  }

  throw new Error("Unable to check session.");
}
