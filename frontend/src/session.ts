export type SessionState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: { displayName: string } }
  | { status: "error"; message: string };

export type BootstrapSession = () => Promise<SessionState>;

export async function bootstrapSession(): Promise<SessionState> {
  return { status: "anonymous" };
}
