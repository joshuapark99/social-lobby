import type { RoomLayout } from "../layouts/layout.js";

type Point = {
  x: number;
  y: number;
};

export function resolveMovementDestination(layout: RoomLayout, requested: Point): Point {
  let resolved = {
    x: clamp(requested.x, 0, layout.width),
    y: clamp(requested.y, 0, layout.height)
  };

  for (const rectangle of layout.collision) {
    if (!isInsideRectangle(resolved, rectangle)) {
      continue;
    }

    const candidates = [
      { x: resolved.x, y: rectangle.y - 1 },
      { x: resolved.x, y: rectangle.y + rectangle.h },
      { x: rectangle.x - 1, y: resolved.y },
      { x: rectangle.x + rectangle.w, y: resolved.y }
    ].map((candidate) => ({
      x: clamp(candidate.x, 0, layout.width),
      y: clamp(candidate.y, 0, layout.height)
    }));

    resolved = candidates.reduce((best, candidate) =>
      squaredDistance(candidate, resolved) < squaredDistance(best, resolved) ? candidate : best
    );
  }

  return resolved;
}

function isInsideRectangle(
  point: Point,
  rectangle: {
    x: number;
    y: number;
    w: number;
    h: number;
  }
): boolean {
  return point.x >= rectangle.x && point.x < rectangle.x + rectangle.w && point.y >= rectangle.y && point.y < rectangle.y + rectangle.h;
}

function squaredDistance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
