import { z } from "zod";

const positionSchema = z.object({
  x: z.number().int(),
  y: z.number().int()
});

export const clientEnvelopeSchema = z.object({
  version: z.literal(1),
  type: z.string().trim().min(1),
  requestId: z.string().trim().min(1).optional(),
  occurredAt: z.string().datetime().optional(),
  payload: z.record(z.string(), z.unknown())
});

export const roomJoinPayloadSchema = z.object({
  roomSlug: z.string().trim().min(1)
});

export const moveRequestPayloadSchema = z.object({
  roomSlug: z.string().trim().min(1),
  destination: positionSchema,
  source: z.enum(["pointer", "keyboard"])
});

export const chatSendPayloadSchema = z.object({
  roomSlug: z.string().trim().min(1),
  body: z.string().trim().min(1)
});

export const teleportRequestPayloadSchema = z.object({
  roomSlug: z.string().trim().min(1),
  targetRoom: z.string().trim().min(1)
});

export const voiceJoinPayloadSchema = z.object({
  roomSlug: z.string().trim().min(1)
});

export const voiceLeavePayloadSchema = z.object({
  roomSlug: z.string().trim().min(1)
});

export const voiceSignalPayloadSchema = z.object({
  roomSlug: z.string().trim().min(1),
  targetConnectionId: z.string().trim().min(1),
  signal: z.unknown()
});

export const roomJoinEventSchema = clientEnvelopeSchema.extend({
  type: z.literal("room.join"),
  payload: roomJoinPayloadSchema
});

export const moveRequestEventSchema = clientEnvelopeSchema.extend({
  type: z.literal("move.request"),
  payload: moveRequestPayloadSchema
});

export const chatSendEventSchema = clientEnvelopeSchema.extend({
  type: z.literal("chat.send"),
  payload: chatSendPayloadSchema
});

export const teleportRequestEventSchema = clientEnvelopeSchema.extend({
  type: z.literal("teleport.request"),
  payload: teleportRequestPayloadSchema
});

export const voiceJoinEventSchema = clientEnvelopeSchema.extend({
  type: z.literal("voice.join"),
  payload: voiceJoinPayloadSchema
});

export const voiceLeaveEventSchema = clientEnvelopeSchema.extend({
  type: z.literal("voice.leave"),
  payload: voiceLeavePayloadSchema
});

export const voiceSignalEventSchema = clientEnvelopeSchema.extend({
  type: z.literal("voice.signal"),
  payload: voiceSignalPayloadSchema
});

export type ClientEnvelope = z.infer<typeof clientEnvelopeSchema>;
export type RoomJoinEvent = z.infer<typeof roomJoinEventSchema>;
export type MoveRequestEvent = z.infer<typeof moveRequestEventSchema>;
export type ChatSendEvent = z.infer<typeof chatSendEventSchema>;
export type TeleportRequestEvent = z.infer<typeof teleportRequestEventSchema>;
export type VoiceJoinEvent = z.infer<typeof voiceJoinEventSchema>;
export type VoiceLeaveEvent = z.infer<typeof voiceLeaveEventSchema>;
export type VoiceSignalEvent = z.infer<typeof voiceSignalEventSchema>;

export type PresenceOccupant = {
  connectionId: string;
  userId: string;
  email: string;
  name?: string;
  position: z.infer<typeof positionSchema>;
};

export type ServerEnvelope<TType extends string, TPayload extends object> = {
  version: 1;
  type: TType;
  requestId?: string;
  occurredAt: string;
  payload: TPayload;
};

export type RoomSnapshotEvent = ServerEnvelope<
  "room.snapshot",
  {
    room: { slug: string; name: string; layoutVersion: number };
    self: PresenceOccupant;
    occupants: PresenceOccupant[];
  }
>;

export type PresenceJoinedEvent = ServerEnvelope<"presence.joined", { occupant: PresenceOccupant }>;
export type PresenceLeftEvent = ServerEnvelope<"presence.left", { connectionId: string; userId: string }>;
export type MovementAcceptedEvent = ServerEnvelope<"movement.accepted", { occupant: PresenceOccupant }>;
export type ChatMessageEvent = ServerEnvelope<
  "chat.message",
  {
    message: {
      id: string;
      roomSlug: string;
      userId: string;
      userName: string;
      body: string;
      createdAt: string;
    };
  }
>;
export type ErrorEvent = ServerEnvelope<"error", { code: string; message: string }>;

export function parseClientEnvelope(input: string): ClientEnvelope {
  return clientEnvelopeSchema.parse(JSON.parse(input));
}

export function parseRoomJoinEvent(input: string): RoomJoinEvent {
  return roomJoinEventSchema.parse(JSON.parse(input));
}

export function parseMoveRequestEvent(input: string): MoveRequestEvent {
  return moveRequestEventSchema.parse(JSON.parse(input));
}

export function parseChatSendEvent(input: string): ChatSendEvent {
  return chatSendEventSchema.parse(JSON.parse(input));
}

export function parseTeleportRequestEvent(input: string): TeleportRequestEvent {
  return teleportRequestEventSchema.parse(JSON.parse(input));
}

export function parseVoiceJoinEvent(input: string): VoiceJoinEvent {
  return voiceJoinEventSchema.parse(JSON.parse(input));
}

export function parseVoiceLeaveEvent(input: string): VoiceLeaveEvent {
  return voiceLeaveEventSchema.parse(JSON.parse(input));
}

export function parseVoiceSignalEvent(input: string): VoiceSignalEvent {
  return voiceSignalEventSchema.parse(JSON.parse(input));
}

export function buildServerEvent<TType extends string, TPayload extends object>(
  type: TType,
  payload: TPayload,
  requestId?: string
): ServerEnvelope<TType, TPayload> {
  return {
    version: 1,
    type,
    requestId,
    occurredAt: new Date().toISOString(),
    payload
  };
}

export function buildErrorEvent(code: string, message: string, requestId?: string): ErrorEvent {
  return buildServerEvent("error", { code, message }, requestId);
}
