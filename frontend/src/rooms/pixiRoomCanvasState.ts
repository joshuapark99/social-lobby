import type { RealtimeOccupant, RealtimeSnapshot } from "../realtime/realtimeClient";

export function deriveRemoteOccupants(snapshot: Pick<RealtimeSnapshot, "self" | "occupants">): RealtimeOccupant[] {
  return snapshot.occupants.filter((occupant) => occupant.connectionId !== snapshot.self.connectionId);
}

export function interpolateOccupantPositions(
  current: RealtimeOccupant[],
  target: RealtimeOccupant[],
  stepSize: number
): RealtimeOccupant[] {
  const currentByConnectionId = new Map(current.map((occupant) => [occupant.connectionId, occupant]));

  return target.map((targetOccupant) => {
    const currentOccupant = currentByConnectionId.get(targetOccupant.connectionId);
    if (!currentOccupant) {
      return targetOccupant;
    }

    return {
      ...targetOccupant,
      position: stepPosition(currentOccupant.position, targetOccupant.position, stepSize)
    };
  });
}

function stepPosition(
  current: { x: number; y: number },
  target: { x: number; y: number },
  stepSize: number
): { x: number; y: number } {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const distance = Math.hypot(dx, dy);

  if (distance <= stepSize || distance === 0) {
    return target;
  }

  const scale = stepSize / distance;
  return {
    x: Math.round(current.x + dx * scale),
    y: Math.round(current.y + dy * scale)
  };
}
