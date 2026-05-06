import type WebSocket from "ws";
import type { PresenceOccupant } from "./protocol.js";

export type VoiceParticipant = Pick<PresenceOccupant, "connectionId" | "userId" | "email" | "name">;

type VoiceEntry = {
  participant: VoiceParticipant;
  socket: WebSocket;
};

export class InMemoryVoiceRegistry {
  private readonly rooms = new Map<string, Map<string, VoiceEntry>>();

  join(roomSlug: string, participant: VoiceParticipant, socket: WebSocket): VoiceParticipant[] {
    const room = this.room(roomSlug);
    room.set(participant.connectionId, { participant, socket });
    return this.participants(roomSlug);
  }

  leave(roomSlug: string, connectionId: string): VoiceParticipant | null {
    const room = this.rooms.get(roomSlug);
    if (!room) return null;

    const removed = room.get(connectionId)?.participant ?? null;
    room.delete(connectionId);
    if (room.size === 0) {
      this.rooms.delete(roomSlug);
    }
    return removed;
  }

  participants(roomSlug: string): VoiceParticipant[] {
    return [...(this.rooms.get(roomSlug)?.values() ?? [])].map((entry) => entry.participant);
  }

  has(roomSlug: string, connectionId: string): boolean {
    return this.rooms.get(roomSlug)?.has(connectionId) ?? false;
  }

  peerSockets(roomSlug: string, excludeConnectionId: string): WebSocket[] {
    return [...(this.rooms.get(roomSlug)?.values() ?? [])]
      .filter((entry) => entry.participant.connectionId !== excludeConnectionId)
      .map((entry) => entry.socket);
  }

  socketFor(roomSlug: string, connectionId: string): WebSocket | null {
    return this.rooms.get(roomSlug)?.get(connectionId)?.socket ?? null;
  }

  private room(roomSlug: string): Map<string, VoiceEntry> {
    const existing = this.rooms.get(roomSlug);
    if (existing) return existing;

    const created = new Map<string, VoiceEntry>();
    this.rooms.set(roomSlug, created);
    return created;
  }
}
