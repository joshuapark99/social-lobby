export type RoomChatMessage = {
  id: string;
  roomSlug: string;
  userId: string;
  userName: string;
  body: string;
  createdAt: string;
};

export type ChatStore = {
  findAccessibleRoom(input: { roomSlug: string; userId: string }): Promise<{ id: string; slug: string } | null>;
  listRecentMessages(input: { roomId: string; limit: number }): Promise<RoomChatMessage[]>;
  createMessage(input: { roomId: string; roomSlug: string; userId: string; body: string }): Promise<RoomChatMessage>;
};

export type ChatService = {
  listRecentMessages(input: { roomSlug: string; userId: string }): Promise<RoomChatMessage[]>;
  createMessage(input: { roomSlug: string; userId: string; body: string }): Promise<RoomChatMessage>;
};

export class ChatAccessError extends Error {
  constructor(message = "room access denied") {
    super(message);
    this.name = "ChatAccessError";
  }
}

export function createChatService(options: { store: ChatStore; historyLimit?: number }): ChatService {
  const historyLimit = options.historyLimit ?? 20;

  return {
    async listRecentMessages(input) {
      const room = await options.store.findAccessibleRoom({ roomSlug: input.roomSlug, userId: input.userId });
      if (!room) throw new ChatAccessError();

      const messages = await options.store.listRecentMessages({ roomId: room.id, limit: historyLimit });
      return [...messages].reverse();
    },
    async createMessage(input) {
      const body = input.body.trim();
      if (!body) throw new Error("message body is required");

      const room = await options.store.findAccessibleRoom({ roomSlug: input.roomSlug, userId: input.userId });
      if (!room) throw new ChatAccessError();

      return options.store.createMessage({
        roomId: room.id,
        roomSlug: room.slug,
        userId: input.userId,
        body
      });
    }
  };
}

export function isChatAccessError(error: unknown): error is ChatAccessError {
  return error instanceof ChatAccessError;
}

export function disabledChatService(): ChatService {
  return {
    async listRecentMessages() {
      throw new Error("chat is not configured");
    },
    async createMessage() {
      throw new Error("chat is not configured");
    }
  };
}
