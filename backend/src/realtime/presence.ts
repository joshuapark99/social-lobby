import type WebSocket from "ws";
import type { PresenceOccupant } from "./protocol.js";

type PresenceEntry = {
  occupant: PresenceOccupant;
  socket: WebSocket;
};

export class InMemoryPresenceRegistry {
  private readonly rooms = new Map<string, Map<string, PresenceEntry>>();

  join(roomSlug: string, occupant: PresenceOccupant, socket: WebSocket): PresenceOccupant[] {
    const room = this.room(roomSlug);
    room.set(occupant.connectionId, { occupant, socket });
    return this.occupants(roomSlug);
  }

  leave(roomSlug: string, connectionId: string): PresenceOccupant | null {
    const room = this.rooms.get(roomSlug);
    if (!room) return null;

    const removed = room.get(connectionId)?.occupant ?? null;
    room.delete(connectionId);
    if (room.size === 0) {
      this.rooms.delete(roomSlug);
    }
    return removed;
  }

  occupants(roomSlug: string): PresenceOccupant[] {
    return [...(this.rooms.get(roomSlug)?.values() ?? [])].map((entry) => entry.occupant);
  }

  move(roomSlug: string, connectionId: string, position: PresenceOccupant["position"]): PresenceOccupant | null {
    const room = this.rooms.get(roomSlug);
    const entry = room?.get(connectionId);
    if (!entry) return null;

    entry.occupant = {
      ...entry.occupant,
      position
    };

    room?.set(connectionId, entry);
    return entry.occupant;
  }

  peers(roomSlug: string, excludeConnectionId: string): WebSocket[] {
    return [...(this.rooms.get(roomSlug)?.values() ?? [])]
      .filter((entry) => entry.occupant.connectionId !== excludeConnectionId)
      .map((entry) => entry.socket);
  }

  private room(roomSlug: string): Map<string, PresenceEntry> {
    const existing = this.rooms.get(roomSlug);
    if (existing) return existing;

    const created = new Map<string, PresenceEntry>();
    this.rooms.set(roomSlug, created);
    return created;
  }
}
