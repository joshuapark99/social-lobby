import type { MouseEvent } from "react";
import { useEffect, useRef } from "react";
import type { Application, Container, Graphics } from "pixi.js";
import type { RealtimeOccupant } from "../realtime/realtimeClient";
import type { RoomLayout } from "./api";
import { fitContentBounds, normalizePointerPosition, type NormalizedRoomPoint } from "./pixiRoomCanvasMath";

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
  const graphicsRef = useRef<typeof import("pixi.js").Graphics | null>(null);
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
      .then(({ Application, Graphics }) => {
        if (disposed || !hostRef.current || appRef.current) return;

        graphicsRef.current = Graphics;
        const app = new Application();
        appRef.current = app;

        return app
          .init({
            antialias: true,
            autoStart: false,
            autoDensity: true,
            backgroundAlpha: 0,
            resizeTo: hostRef.current,
            resolution: typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 1.25)
          })
          .then(() => {
          initialized = true;

          if (disposed) {
            app.destroy(true, { children: true });
            return;
          }

          const host = hostRef.current;
          if (!host || !app.canvas || host.contains(app.canvas)) return;
          host.appendChild(app.canvas);
          app.stop();

          drawScene({
            layout: layoutRef.current,
            localOccupant: localOccupantRef.current ?? null,
            remoteOccupants: remoteOccupantsRef.current ?? [],
            stage: app.stage,
            app,
            GraphicsCtor: Graphics
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

  useEffect(() => {
    if (!appRef.current) return;
    if (!graphicsRef.current) return;

    drawScene({
      layout,
      localOccupant: localOccupant ?? null,
      remoteOccupants: remoteOccupants ?? [],
      stage: appRef.current.stage,
      app: appRef.current,
      GraphicsCtor: graphicsRef.current
    });
  }, [layout, localOccupant, remoteOccupants]);

  function drawScene(input: {
    layout: RoomLayout;
    localOccupant: RealtimeOccupant | null;
    remoteOccupants: RealtimeOccupant[];
    stage: Container;
    app: Application;
    GraphicsCtor: typeof import("pixi.js").Graphics;
  }) {
    const host = hostRef.current;
    if (!host) return;

    const contentBounds = fitContentBounds(
      {
        left: 0,
        top: 0,
        width: host.clientWidth,
        height: host.clientHeight
      },
      input.layout.width / input.layout.height
    );
    const scale = Math.min(contentBounds.width / input.layout.width, contentBounds.height / input.layout.height);

    input.stage.removeChildren();
    input.stage.scale.set(scale);
    input.stage.position.set(contentBounds.left, contentBounds.top);
    input.stage.addChild(drawBackground(input.layout, input.GraphicsCtor));
    input.stage.addChild(drawCollisionLayer(input.layout.collision, input.GraphicsCtor));
    if (input.localOccupant) input.stage.addChild(drawAvatar(input.localOccupant.position, 0x1f6f68, input.GraphicsCtor));
    input.remoteOccupants.forEach((occupant) => input.stage.addChild(drawAvatar(occupant.position, 0x42657a, input.GraphicsCtor)));
    input.app.render();
  }

  function drawBackground(layout: RoomLayout, GraphicsCtor: typeof import("pixi.js").Graphics): Graphics {
    const g = new GraphicsCtor();
    g.rect(0, 0, layout.width, layout.height);
    g.fill({ color: 0x0f1115, alpha: 0.08 });
    return g;
  }

  function drawCollisionLayer(collision: RoomLayout["collision"], GraphicsCtor: typeof import("pixi.js").Graphics): Graphics {
    const g = new GraphicsCtor();
    collision.forEach(({ x, y, w, h }) => {
      g.rect(x, y, w, h);
      g.fill({ color: 0x120f0c, alpha: 0.14 });
    });
    return g;
  }

  function drawAvatar(
    position: { x: number; y: number },
    color: number,
    GraphicsCtor: typeof import("pixi.js").Graphics
  ): Graphics {
    const g = new GraphicsCtor();
    g.circle(position.x, position.y, 20);
    g.fill(color);
    g.stroke({ color: 0xf6efe4, width: 4 });
    g.circle(position.x, position.y - 28, 10);
    g.fill(color);
    return g;
  }

  function emitPointerIntent(event: MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    onPointerIntent(
      normalizePointerPosition({
        clientX: event.clientX,
        clientY: event.clientY,
        bounds,
        contentAspectRatio: layout.width / layout.height
      })
    );
  }

  return (
    <div
      aria-label="Pixi room canvas"
      className="pixi-room-canvas"
      onMouseDown={emitPointerIntent}
      ref={hostRef}
    />
  );
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
