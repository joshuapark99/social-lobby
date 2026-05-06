import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type WebSocket from "ws";
import { sessionCookieName } from "../auth/cookies.js";
import { requireIdentity } from "../auth/http.js";
import type { AuthService, OidcIdentity } from "../auth/service.js";
import { isChatAccessError, type ChatService } from "../chat/service.js";
import { isRoomAccessError, type RoomMetadataResponse, type RoomService } from "../rooms/service.js";
import type { EventLogger, Observability } from "../server/observability.js";
import { isTeleportAccessError, type TeleportService } from "../teleport/service.js";
import { resolveMovementDestination } from "./movement.js";
import { InMemoryPresenceRegistry } from "./presence.js";
import {
  buildErrorEvent,
  buildServerEvent,
  parseChatSendEvent,
  parseClientEnvelope,
  parseMoveRequestEvent,
  parseRoomJoinEvent,
  parseTeleportRequestEvent,
  parseVoiceJoinEvent,
  parseVoiceLeaveEvent,
  parseVoiceSignalEvent,
  type PresenceOccupant
} from "./protocol.js";
import { InMemoryVoiceRegistry, type VoiceParticipant } from "./voice.js";

export function registerRealtimeRoutes(
  server: FastifyInstance,
  options: {
    authService: AuthService;
    chatService: ChatService;
    roomService: RoomService;
    teleportService: TeleportService;
    presenceRegistry?: InMemoryPresenceRegistry;
    voiceRegistry?: InMemoryVoiceRegistry;
    observability: Observability;
    eventLogger: EventLogger;
  }
): void {
  const presenceRegistry = options.presenceRegistry ?? new InMemoryPresenceRegistry();
  const voiceRegistry = options.voiceRegistry ?? new InMemoryVoiceRegistry();

  server.route<{ Params: { roomSlug: string } }>({
    method: "GET",
    url: "/api/rooms/:roomSlug/ws",
    handler: async (_request, reply) => reply.status(426).send({ error: "websocket upgrade required" }),
    preValidation: async (request, reply) => {
      const identity = await requireRealtimeIdentity(request, reply, options.authService);
      if (!identity) return reply;

      try {
        const room = await options.roomService.roomBySlug(request.params.roomSlug, identity.userId);
        if (!room) {
          return reply.status(404).send({ error: "room not found" });
        }
      } catch (error) {
        if (isRoomAccessError(error)) {
          return reply.status(403).send({ error: error.message });
        }

        throw error;
      }

      request.headers["x-room-slug"] = request.params.roomSlug;
    },
    wsHandler: (socket, request) => {
      const connection = websocketConnection(socket);
      if (!connection) {
        return;
      }
      const activeConnection = connection;

      let joinedConnectionId: string | null = null;
      let cleanedUp = false;
      const sessionToken = cookieValue(request.headers.cookie, sessionCookieName) ?? "";
      const initialRoomSlug = typeof request.headers["x-room-slug"] === "string" ? request.headers["x-room-slug"] : undefined;
      if (!initialRoomSlug) {
        return;
      }
      options.observability.connectionOpened();
      options.eventLogger({
        event: "realtime.connection.opened",
        roomSlug: initialRoomSlug
      });

      const identityPromise = options.authService.session(sessionToken);
      let currentRoomSlug = initialRoomSlug;

      connection.on("message", async (message) => {
        try {
          const envelope = parseClientEnvelope(message.toString());
          const identity = await identityPromise;
          switch (envelope.type) {
            case "room.join": {
              if (joinedConnectionId) {
                send(connection, buildErrorEvent("already_joined", "room.join has already been processed", envelope.requestId));
                return;
              }

              const join = parseRoomJoinEvent(message.toString());
              if (join.payload.roomSlug !== currentRoomSlug) {
                send(connection, buildErrorEvent("room_mismatch", "room.join roomSlug must match the websocket room", join.requestId));
                connection.close(1008, "room mismatch");
                return;
              }

              if (!identity?.userId) {
                send(connection, buildErrorEvent("session_required", "session required", join.requestId));
                connection.close(1008, "session required");
                return;
              }

              let room;
              try {
                room = await options.roomService.roomBySlug(currentRoomSlug, identity.userId);
              } catch (error) {
                if (isRoomAccessError(error)) {
                  send(connection, buildErrorEvent("access_denied", error.message, join.requestId));
                  connection.close(1008, "room access denied");
                  return;
                }

                throw error;
              }

              if (!room) {
                send(connection, buildErrorEvent("room_not_found", "room not found", join.requestId));
                connection.close(1008, "room not found");
                return;
              }

              const authenticatedIdentity = identity as OidcIdentity & { userId: string };
              const occupant = createOccupant(authenticatedIdentity, room);
              const connectionId = occupant.connectionId;
              joinedConnectionId = connectionId;
              const occupants = presenceRegistry.join(room.room.slug, occupant, connection);
              options.observability.recordRealtimeEvent({ direction: "in", eventType: envelope.type, result: "accepted" });
              options.observability.roomOccupancyChanged(room.room.slug, occupants.length);
              options.eventLogger({
                event: "realtime.room.joined",
                roomSlug: room.room.slug,
                userId: occupant.userId,
                connectionId
              });

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

              if (!identity?.userId) {
                send(connection, buildErrorEvent("session_required", "session required", envelope.requestId));
                return;
              }

              const move = parseMoveRequestEvent(message.toString());
              if (move.payload.roomSlug !== currentRoomSlug) {
                send(connection, buildErrorEvent("room_mismatch", "move.request roomSlug must match the websocket room", move.requestId));
                return;
              }

              let room;
              try {
                room = await options.roomService.roomBySlug(currentRoomSlug, identity.userId);
              } catch (error) {
                if (isRoomAccessError(error)) {
                  send(connection, buildErrorEvent("access_denied", error.message, move.requestId));
                  return;
                }

                throw error;
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
              options.observability.recordRealtimeEvent({ direction: "in", eventType: envelope.type, result: "accepted" });

              const accepted = buildServerEvent("movement.accepted", { occupant }, move.requestId);
              send(connection, accepted);
              broadcast(presenceRegistry.peers(room.room.slug, joinedConnectionId), accepted);
              return;
            }
            case "teleport.request": {
              if (!joinedConnectionId) {
                send(connection, buildErrorEvent("join_required", "room.join must be processed before teleport", envelope.requestId));
                return;
              }

              const teleport = parseTeleportRequestEvent(message.toString());
              if (teleport.payload.roomSlug !== currentRoomSlug) {
                send(connection, buildErrorEvent("room_mismatch", "teleport.request roomSlug must match the active room", teleport.requestId));
                return;
              }

              if (!identity?.userId) {
                send(connection, buildErrorEvent("session_required", "session required", teleport.requestId));
                return;
              }

              let room;
              try {
                room = await options.roomService.roomBySlug(currentRoomSlug, identity.userId);
              } catch (error) {
                if (isRoomAccessError(error)) {
                  send(connection, buildErrorEvent("access_denied", error.message, teleport.requestId));
                  return;
                }

                throw error;
              }

              if (!room) {
                send(connection, buildErrorEvent("room_not_found", "room not found", teleport.requestId));
                return;
              }

              const authenticatedIdentity = identity as OidcIdentity & { userId: string };
              let targetRoom;
              try {
                targetRoom = await options.teleportService.teleport({
                  currentRoom: room,
                  targetRoomSlug: teleport.payload.targetRoom,
                  userId: authenticatedIdentity.userId
                });
              } catch (error) {
                if (isTeleportAccessError(error)) {
                  send(connection, buildErrorEvent("access_denied", error.message, teleport.requestId));
                  return;
                }

                if (error instanceof Error && error.message === "room not found") {
                  send(connection, buildErrorEvent("room_not_found", error.message, teleport.requestId));
                  return;
                }

                throw error;
              }

              removeVoiceParticipant(currentRoomSlug, joinedConnectionId);
              const removed = presenceRegistry.leave(currentRoomSlug, joinedConnectionId);
              if (removed) {
                options.observability.roomOccupancyChanged(currentRoomSlug, presenceRegistry.occupants(currentRoomSlug).length);
                broadcast(
                  presenceRegistry.peers(currentRoomSlug, removed.connectionId),
                  buildServerEvent("presence.left", {
                    connectionId: removed.connectionId,
                    userId: removed.userId
                  })
                );
              }

              currentRoomSlug = targetRoom.room.slug;
              const occupant = createOccupant(authenticatedIdentity, targetRoom, joinedConnectionId);
              const occupants = presenceRegistry.join(currentRoomSlug, occupant, connection);
              options.observability.recordRealtimeEvent({ direction: "in", eventType: envelope.type, result: "accepted" });
              options.observability.roomOccupancyChanged(currentRoomSlug, occupants.length);

              send(
                connection,
                buildServerEvent("room.snapshot", {
                  room: {
                    slug: targetRoom.room.slug,
                    name: targetRoom.room.name,
                    layoutVersion: targetRoom.room.layoutVersion
                  },
                  self: occupant,
                  occupants
                }, teleport.requestId)
              );

              broadcast(
                presenceRegistry.peers(currentRoomSlug, joinedConnectionId),
                buildServerEvent("presence.joined", { occupant })
              );
              return;
            }
            case "chat.send": {
              if (!joinedConnectionId) {
                send(connection, buildErrorEvent("join_required", "room.join must be processed before chat", envelope.requestId));
                return;
              }

              const chat = parseChatSendEvent(message.toString());
              if (chat.payload.roomSlug !== currentRoomSlug) {
                send(connection, buildErrorEvent("room_mismatch", "chat.send roomSlug must match the websocket room", chat.requestId));
                return;
              }

              if (!identity?.userId) {
                send(connection, buildErrorEvent("session_required", "session required", chat.requestId));
                return;
              }

              let created;
              try {
                created = await options.chatService.createMessage({
                  roomSlug: currentRoomSlug,
                  userId: identity.userId,
                  body: chat.payload.body
                });
              } catch (error) {
                if (isChatAccessError(error)) {
                  send(connection, buildErrorEvent("access_denied", error.message, chat.requestId));
                  return;
                }

                throw error;
              }
              options.observability.recordRealtimeEvent({ direction: "in", eventType: envelope.type, result: "accepted" });
              const createdEvent = buildServerEvent("chat.message", { message: created }, chat.requestId);
              send(connection, createdEvent);
              broadcast(presenceRegistry.peers(currentRoomSlug, joinedConnectionId), createdEvent);
              return;
            }
            case "voice.join": {
              if (!joinedConnectionId) {
                send(connection, buildErrorEvent("join_required", "room.join must be processed before voice", envelope.requestId));
                return;
              }

              const voiceJoin = parseVoiceJoinEvent(message.toString());
              if (voiceJoin.payload.roomSlug !== currentRoomSlug) {
                send(connection, buildErrorEvent("room_mismatch", "voice roomSlug must match the active room", voiceJoin.requestId));
                return;
              }

              const room = await validateActiveRoomAccess(identity, currentRoomSlug, voiceJoin.requestId);
              if (!room) return;

              const occupant = presenceRegistry.occupants(currentRoomSlug).find((candidate) => candidate.connectionId === joinedConnectionId);
              if (!occupant) {
                send(connection, buildErrorEvent("join_required", "room.join must be processed before voice", voiceJoin.requestId));
                return;
              }

              const participant = voiceParticipantFor(occupant);
              const participants = voiceRegistry.join(room.room.slug, participant, connection);
              send(
                connection,
                buildServerEvent("voice.snapshot", {
                  roomSlug: room.room.slug,
                  self: participant,
                  participants
                }, voiceJoin.requestId)
              );
              broadcast(
                voiceRegistry.peerSockets(room.room.slug, participant.connectionId),
                buildServerEvent("voice.joined", { roomSlug: room.room.slug, participant })
              );
              return;
            }
            case "voice.leave": {
              if (!joinedConnectionId) {
                send(connection, buildErrorEvent("join_required", "room.join must be processed before voice", envelope.requestId));
                return;
              }

              const voiceLeave = parseVoiceLeaveEvent(message.toString());
              if (voiceLeave.payload.roomSlug !== currentRoomSlug) {
                send(connection, buildErrorEvent("room_mismatch", "voice roomSlug must match the active room", voiceLeave.requestId));
                return;
              }

              const room = await validateActiveRoomAccess(identity, currentRoomSlug, voiceLeave.requestId);
              if (!room) return;
              removeVoiceParticipant(room.room.slug, joinedConnectionId);
              return;
            }
            case "voice.signal": {
              if (!joinedConnectionId) {
                send(connection, buildErrorEvent("join_required", "room.join must be processed before voice", envelope.requestId));
                return;
              }

              const voiceSignal = parseVoiceSignalEvent(message.toString());
              if (voiceSignal.payload.roomSlug !== currentRoomSlug) {
                send(connection, buildErrorEvent("room_mismatch", "voice roomSlug must match the active room", voiceSignal.requestId));
                return;
              }

              const room = await validateActiveRoomAccess(identity, currentRoomSlug, voiceSignal.requestId);
              if (!room) return;
              if (!voiceRegistry.has(room.room.slug, joinedConnectionId)) {
                send(connection, buildErrorEvent("voice_join_required", "voice.join must be processed before signaling", voiceSignal.requestId));
                return;
              }

              const target = voiceRegistry.socketFor(room.room.slug, voiceSignal.payload.targetConnectionId);
              if (!target) {
                send(connection, buildErrorEvent("voice_peer_not_found", "target voice peer not found", voiceSignal.requestId));
                return;
              }

              send(
                target,
                buildServerEvent("voice.signal", {
                  fromConnectionId: joinedConnectionId,
                  targetConnectionId: voiceSignal.payload.targetConnectionId,
                  signal: voiceSignal.payload.signal
                }, voiceSignal.requestId)
              );
              return;
            }
            default: {
              send(connection, buildErrorEvent("unsupported_event", `unsupported realtime event type: ${envelope.type}`, envelope.requestId));
              return;
            }
          }
        } catch (error) {
          options.observability.recordRealtimeEvent({ direction: "in", eventType: "invalid_event", result: "rejected" });
          send(connection, buildErrorEvent("invalid_event", errorMessage(error)));
          connection.close(1008, "invalid event");
        }
      });

      connection.on("close", () => {
        if (cleanedUp) return;
        cleanedUp = true;
        options.observability.connectionClosed();
        if (!joinedConnectionId) return;
        const connectionId = joinedConnectionId;
        const roomSlug = currentRoomSlug;

        if (!identityPromise) return;
        void identityPromise.then(() => {
          removeVoiceParticipant(roomSlug, connectionId);
          const removed = presenceRegistry.leave(roomSlug, connectionId);
          if (!removed) return;
          options.observability.roomOccupancyChanged(roomSlug, presenceRegistry.occupants(roomSlug).length);
          options.eventLogger({
            event: "realtime.connection.closed",
            roomSlug,
            userId: removed.userId,
            connectionId: removed.connectionId
          });

          broadcast(
            presenceRegistry.peers(roomSlug, removed.connectionId),
            buildServerEvent("presence.left", {
              connectionId: removed.connectionId,
              userId: removed.userId
            })
          );
        });
      });

      async function validateActiveRoomAccess(
        identity: OidcIdentity | null,
        roomSlug: string,
        requestId?: string
      ): Promise<RoomMetadataResponse | null> {
        if (!identity?.userId) {
          send(activeConnection, buildErrorEvent("session_required", "session required", requestId));
          return null;
        }

        let room;
        try {
          room = await options.roomService.roomBySlug(roomSlug, identity.userId);
        } catch (error) {
          if (isRoomAccessError(error)) {
            send(activeConnection, buildErrorEvent("access_denied", error.message, requestId));
            return null;
          }

          throw error;
        }

        if (!room) {
          send(activeConnection, buildErrorEvent("room_not_found", "room not found", requestId));
          return null;
        }

        return room;
      }

      function removeVoiceParticipant(roomSlug: string, connectionId: string): void {
        const participant = voiceRegistry.leave(roomSlug, connectionId);
        if (!participant) return;

        broadcast(
          voiceRegistry.peerSockets(roomSlug, participant.connectionId),
          buildServerEvent("voice.left", {
            roomSlug,
            connectionId: participant.connectionId,
            userId: participant.userId
          })
        );
      }
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

function voiceParticipantFor(occupant: PresenceOccupant): VoiceParticipant {
  return {
    connectionId: occupant.connectionId,
    userId: occupant.userId,
    email: occupant.email,
    name: occupant.name
  };
}

function createOccupant(
  identity: OidcIdentity & { userId: string },
  room: RoomMetadataResponse,
  connectionId: string = randomUUID()
): PresenceOccupant {
  const spawn = room.room.layout.spawnPoints[0];
  return {
    connectionId,
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
