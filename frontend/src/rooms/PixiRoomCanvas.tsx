import type { MouseEvent } from "react";
import { useEffect, useRef } from "react";
import { type Application, type Container, Graphics } from "pixi.js";
import type { RealtimeOccupant } from "../realtime/realtimeClient";
import type { RoomLayout } from "./api";
import { normalizePointerPosition, type NormalizedRoomPoint } from "./pixiRoomCanvasMath";

export function PixiRoomCanvas({
  layout,
  localOccupant,
  remoteOccupants,
  onPointerIntent
}: {
  layout: RoomLayout;
  localOccupant?: RealtimeOccupant | null;
  remoteOccupants?: RealtimeOccupant[];
  onPointerIntent: (point: NormalizedRoomPoint) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const layoutRef = useRef(layout);
  const localOccupantRef = useRef(localOccupant);
  const remoteOccupantsRef = useRef(remoteOccupants);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    localOccupantRef.current = localOccupant;
  }, [localOccupant]);

  useEffect(() => {
    remoteOccupantsRef.current = remoteOccupants;
  }, [remoteOccupants]);

  useEffect(() => {
    if (!hostRef.current || appRef.current || !supportsCanvasRendering()) return;

    let disposed = false;
    let initialized = false;

    void import("pixi.js")
      .then(({ Application }) => {
        if (disposed || !hostRef.current || appRef.current) return;

        const app = new Application();
        appRef.current = app;

        return app.init({ backgroundAlpha: 0, resizeTo: hostRef.current }).then(() => {
          initialized = true;

          if (disposed) {
            app.destroy(true, { children: true });
            return;
          }

          const host = hostRef.current;
          if (!host || !app.canvas || host.contains(app.canvas)) return;
          host.appendChild(app.canvas);

          drawScene({
            layout: layoutRef.current,
            localOccupant: localOccupantRef.current ?? null,
            remoteOccupants: remoteOccupantsRef.current ?? [],
            stage: app.stage
          });
        });
      })
      .catch(() => {
        appRef.current = null;
      });

    return () => {
      disposed = true;

      if (initialized) {
        appRef.current?.destroy(true, { children: true });
      }

      appRef.current = null;
    };
  }, []);

  function drawScene(input: {
    layout: RoomLayout;
    localOccupant: RealtimeOccupant | null;
    remoteOccupants: RealtimeOccupant[];
    stage: Container;
  }) {
    input.stage.removeChildren();
    input.stage.addChild(drawBackground(input.layout));
    input.stage.addChild(drawCollisionLayer(input.layout.collision));
    if (input.localOccupant) input.stage.addChild(drawAvatar(input.localOccupant.position, 0x1f6f68));
    input.remoteOccupants.forEach((occupant) => input.stage.addChild(drawAvatar(occupant.position, 0x42657a)));
  }

  function drawBackground(layout: RoomLayout): Graphics {
    const g = new Graphics();
    g.rect(0, 0, layout.width, layout.height);
    g.fill(0xf4efe4);
    return g;
  }

  function drawCollisionLayer(collision: RoomLayout["collision"]): Graphics {
    const g = new Graphics();
    collision.forEach(({ x, y, w, h }) => {
      g.rect(x, y, w, h);
      g.fill(0xd8dee3);
    });
    return g;
  }

  function drawAvatar(position: { x: number; y: number }, color: number): Graphics {
    const g = new Graphics();
    g.circle(position.x, position.y, 20);
    g.fill(color);
    return g;
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    onPointerIntent(
      normalizePointerPosition({
        clientX: event.clientX,
        clientY: event.clientY,
        bounds
      })
    );
  }

  return <div aria-label="Pixi room canvas" className="pixi-room-canvas" onClick={handleClick} ref={hostRef} />;
}

function supportsCanvasRendering() {
  if (typeof navigator !== "undefined" && navigator.userAgent.includes("jsdom")) {
    return false;
  }

  try {
    const context = document.createElement("canvas").getContext("2d");
    return context !== null;
  } catch {
    return false;
  }
}
