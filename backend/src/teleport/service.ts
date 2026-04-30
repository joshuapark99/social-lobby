import type { RoomMetadataResponse, RoomService } from "../rooms/service.js";

export type TeleportStore = {
  findAccessibleRoom(input: { roomSlug: string; userId: string }): Promise<{ id: string } | null>;
  recordVisit(input: { userId: string; roomId: string }): Promise<void>;
};

export type TeleportService = {
  teleport(input: {
    currentRoom: RoomMetadataResponse;
    targetRoomSlug: string;
    userId: string;
  }): Promise<RoomMetadataResponse>;
};

export class TeleportAccessError extends Error {
  constructor(message = "room access denied") {
    super(message);
    this.name = "TeleportAccessError";
  }
}

export function createTeleportService(options: { roomService: RoomService; store: TeleportStore }): TeleportService {
  return {
    async teleport(input) {
      const allowed = input.currentRoom.room.layout.teleports.some((candidate) => candidate.targetRoom === input.targetRoomSlug);
      if (!allowed) {
        throw new Error("room not found");
      }

      const accessibleRoom = await options.store.findAccessibleRoom({
        roomSlug: input.targetRoomSlug,
        userId: input.userId
      });
      if (!accessibleRoom) {
        const room = await options.roomService.roomBySlug(input.targetRoomSlug, input.userId);
        if (!room) {
          throw new Error("room not found");
        }
        throw new TeleportAccessError();
      }

      await options.store.recordVisit({
        userId: input.userId,
        roomId: accessibleRoom.id
      });

      const room = await options.roomService.roomBySlug(input.targetRoomSlug, input.userId);
      if (!room) {
        throw new Error("room not found");
      }

      return room;
    }
  };
}

export function isTeleportAccessError(error: unknown): error is TeleportAccessError {
  return error instanceof TeleportAccessError;
}

export function disabledTeleportService(): TeleportService {
  return {
    async teleport() {
      throw new Error("teleports are not configured");
    }
  };
}
