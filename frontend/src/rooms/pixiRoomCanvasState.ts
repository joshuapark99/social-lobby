import type { RealtimeOccupant, RealtimeSnapshot } from "../realtime/realtimeClient";

export function deriveRemoteOccupants(snapshot: Pick<RealtimeSnapshot, "self" | "occupants">): RealtimeOccupant[] {
  return snapshot.occupants.filter((occupant) => occupant.connectionId !== snapshot.self.connectionId);
}
