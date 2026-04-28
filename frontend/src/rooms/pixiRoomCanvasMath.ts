export type NormalizedRoomPoint = {
  x: number;
  y: number;
};

export function normalizePointerPosition(input: {
  clientX: number;
  clientY: number;
  bounds: { left: number; top: number; width: number; height: number };
}): NormalizedRoomPoint {
  const x = clamp((input.clientX - input.bounds.left) / input.bounds.width);
  const y = clamp((input.clientY - input.bounds.top) / input.bounds.height);
  return { x, y };
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}
