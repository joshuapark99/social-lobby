export interface RealtimeClient {
  readonly status: "idle";
}

export function createRealtimeClient(): RealtimeClient {
  return { status: "idle" };
}
