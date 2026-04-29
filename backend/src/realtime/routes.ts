import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type WebSocket from "ws";
import { sessionCookieName } from "../auth/cookies.js";
import { requireIdentity } from "../auth/http.js";
import type { AuthService, OidcIdentity } from "../auth/service.js";
import type { RoomMetadataResponse, RoomService } from "../rooms/service.js";
import { resolveMovementDestination } from "./movement.js";
import { InMemoryPresenceRegistry } from "./presence.js";
import { buildErrorEvent, buildServerEvent, parseClientEnvelope, parseMoveRequestEvent, parseRoomJoinEvent, type PresenceOccupant } from "./protocol.js";

export function registerRealtimeRoutes(
  server: FastifyInstance,
  options: {
    authService: AuthService;
    roomService: RoomService;
    presenceRegistry?: InMemoryPresenceRegistry;
  }
): void {
  const presenceRegistry = options.presenceRegistry ?? new InMemoryPresenceRegistry();

  server.route<{ Params: { roomSlug: string } }>({
    method: "GET",
    url: "/api/rooms/:roomSlug/ws",
    handler: async (_request, reply) => reply.status(426).send({ error: "websocket upgrade required" }),
    preValidation: async (request, reply) => {
      const identity = await requireRealtimeIdentity(request, reply, options.authService);
      if (!identity) return reply;

      const room = await options.roomService.roomBySlug(request.params.roomSlug);
      if (!room) {
        return reply.status(404).send({ error: "room not found" });
      }

      request.headers["x-room-slug"] = request.params.roomSlug;
    },
    wsHandler: (socket, request) => {
      const connection = websocketConnection(socket);
      if (!connection) {
        return;
      }

      let joinedConnectionId: string | null = null;
      let cleanedUp = false;
      const sessionToken = cookieValue(request.headers.cookie, sessionCookieName) ?? "";
      const roomSlug = typeof request.headers["x-room-slug"] === "string" ? request.headers["x-room-slug"] : undefined;
      if (!roomSlug) {
        return;
      }

      const identityPromise = options.authService.session(sessionToken);
      const roomPromise = options.roomService.roomBySlug(roomSlug);

      connection.on("message", async (message) => {
        try {
          const envelope = parseClientEnvelope(message.toString());
          const identity = await identityPromise;
          const room = await roomPromise;
          switch (envelope.type) {
            case "room.join": {
              if (joinedConnectionId) {
                send(connection, buildErrorEvent("already_joined", "room.join has already been processed", envelope.requestId));
                return;
              }

              const join = parseRoomJoinEvent(message.toString());
              if (join.payload.roomSlug !== roomSlug) {
                send(connection, buildErrorEvent("room_mismatch", "room.join roomSlug must match the websocket room", join.requestId));
                connection.close(1008, "room mismatch");
                return;
              }

              if (!identity?.userId || !room) {
                send(connection, buildErrorEvent("session_required", "session required", join.requestId));
                connection.close(1008, "session required");
                return;
              }

              const authenticatedIdentity = identity as OidcIdentity & { userId: string };
              const occupant = createOccupant(authenticatedIdentity, room);
              const connectionId = occupant.connectionId;
              joinedConnectionId = connectionId;
              const occupants = presenceRegistry.join(room.room.slug, occupant, connection);

              send(
                connection,
                buildServerEvent("room.snapshot", {
                  room: {
                    slug: room.room.slug,
                    name: room.room.name,
                    layoutVersion: room.room.layoutVersion
                  },
                  self: occupant,
                  occupants
                }, join.requestId)
              );

              broadcast(
                presenceRegistry.peers(room.room.slug, connectionId),
                buildServerEvent("presence.joined", { occupant })
              );
              return;
            }
            case "move.request": {
              if (!joinedConnectionId) {
                send(connection, buildErrorEvent("join_required", "room.join must be processed before movement", envelope.requestId));
                return;
              }

              const move = parseMoveRequestEvent(message.toString());
              if (move.payload.roomSlug !== roomSlug) {
                send(connection, buildErrorEvent("room_mismatch", "move.request roomSlug must match the websocket room", move.requestId));
                return;
              }

              if (!room) {
                send(connection, buildErrorEvent("room_not_found", "room not found", move.requestId));
                return;
              }

              const position = resolveMovementDestination(room.room.layout, move.payload.destination);
              const occupant = presenceRegistry.move(room.room.slug, joinedConnectionId, position);
              if (!occupant) {
                send(connection, buildErrorEvent("join_required", "room.join must be processed before movement", move.requestId));
                return;
              }

              const accepted = buildServerEvent("movement.accepted", { occupant }, move.requestId);
              send(connection, accepted);
              broadcast(presenceRegistry.peers(room.room.slug, joinedConnectionId), accepted);
              return;
            }
            default: {
              send(connection, buildErrorEvent("unsupported_event", `unsupported realtime event type: ${envelope.type}`, envelope.requestId));
              return;
            }
          }
        } catch (error) {
          send(connection, buildErrorEvent("invalid_event", errorMessage(error)));
          connection.close(1008, "invalid event");
        }
      });

      connection.on("close", () => {
        if (cleanedUp || !joinedConnectionId) return;
        cleanedUp = true;
        const connectionId = joinedConnectionId;

        void roomPromise.then((room) => {
          if (!room) return;

          const removed = presenceRegistry.leave(room.room.slug, connectionId);
          if (!removed) return;

          broadcast(
            presenceRegistry.peers(room.room.slug, removed.connectionId),
            buildServerEvent("presence.left", {
              connectionId: removed.connectionId,
              userId: removed.userId
            })
          );
        });
      });
    }
  });
}

async function requireRealtimeIdentity(
  request: FastifyRequest,
  reply: FastifyReply,
  authService: AuthService
): Promise<(OidcIdentity & { userId: string }) | null> {
  const identity = await requireIdentity(request, reply, authService);
  if (!identity) return null;
  if (!identity.userId) {
    await reply.status(401).send("session required");
    return null;
  }
  return identity as OidcIdentity & { userId: string };
}

function createOccupant(identity: OidcIdentity & { userId: string }, room: RoomMetadataResponse): PresenceOccupant {
  const spawn = room.room.layout.spawnPoints[0];
  return {
    connectionId: randomUUID(),
    userId: identity.userId,
    email: identity.email,
    name: identity.name,
    position: { x: spawn.x, y: spawn.y }
  };
}

function broadcast(sockets: WebSocket[], event: object): void {
  const payload = JSON.stringify(event);
  sockets.forEach((socket) => socket.send(payload));
}

function send(socket: WebSocket, event: object): void {
  socket.send(JSON.stringify(event));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "invalid realtime event";
}

function websocketConnection(input: unknown): WebSocket | null {
  if (hasWebsocketMethods(input)) {
    return input;
  }
  if (typeof input === "object" && input !== null && "socket" in input && hasWebsocketMethods((input as { socket?: unknown }).socket)) {
    return (input as { socket: WebSocket }).socket;
  }
  return null;
}

function hasWebsocketMethods(input: unknown): input is WebSocket {
  return (
    typeof input === "object" &&
    input !== null &&
    typeof (input as { send?: unknown }).send === "function" &&
    typeof (input as { on?: unknown }).on === "function" &&
    typeof (input as { close?: unknown }).close === "function"
  );
}

function cookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
