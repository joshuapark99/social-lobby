export type NormalizedRoomPoint = {
  x: number;
  y: number;
};

export function normalizePointerPosition(input: {
  clientX: number;
  clientY: number;
  bounds: { left: number; top: number; width: number; height: number };
  contentAspectRatio?: number;
}): NormalizedRoomPoint {
  const contentBounds = fitContentBounds(input.bounds, input.contentAspectRatio);
  const x = clamp((input.clientX - contentBounds.left) / contentBounds.width);
  const y = clamp((input.clientY - contentBounds.top) / contentBounds.height);
  return { x, y };
}

export function fitContentBounds(
  bounds: { left: number; top: number; width: number; height: number },
  contentAspectRatio = bounds.width / bounds.height
) {
  const hostAspectRatio = bounds.width / bounds.height;

  if (hostAspectRatio > contentAspectRatio) {
    const width = bounds.height * contentAspectRatio;
    const left = bounds.left + (bounds.width - width) / 2;
    return { left, top: bounds.top, width, height: bounds.height };
  }

  const height = bounds.width / contentAspectRatio;
  const top = bounds.top + (bounds.height - height) / 2;
  return { left: bounds.left, top, width: bounds.width, height };
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}
