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

export const roomJoinEventSchema = clientEnvelopeSchema.extend({
  type: z.literal("room.join"),
  payload: roomJoinPayloadSchema
});

export type ClientEnvelope = z.infer<typeof clientEnvelopeSchema>;
export type RoomJoinEvent = z.infer<typeof roomJoinEventSchema>;

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
export type ErrorEvent = ServerEnvelope<"error", { code: string; message: string }>;

export function parseClientEnvelope(input: string): ClientEnvelope {
  return clientEnvelopeSchema.parse(JSON.parse(input));
}

export function parseRoomJoinEvent(input: string): RoomJoinEvent {
  return roomJoinEventSchema.parse(JSON.parse(input));
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
