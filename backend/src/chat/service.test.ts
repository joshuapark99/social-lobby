import { describe, expect, test, vi } from "vitest";
import { ChatAccessError, createChatService, type ChatStore } from "./service.js";

function store(overrides: Partial<ChatStore> = {}): ChatStore {
  return {
    findAccessibleRoom: vi.fn(async () => ({ id: "room-1", slug: "main-lobby" })),
    listRecentMessages: vi.fn(async () => [
      {
        id: "message-2",
        roomSlug: "main-lobby",
        userId: "user-2",
        userName: "Other Person",
        body: "Welcome back",
        createdAt: "2026-04-29T10:05:00.000Z"
      },
      {
        id: "message-1",
        roomSlug: "main-lobby",
        userId: "user-1",
        userName: "Person Example",
        body: "Hello room",
        createdAt: "2026-04-29T10:00:00.000Z"
      }
    ]),
    createMessage: vi.fn(async ({ roomSlug, userId, body }) => ({
      id: "message-3",
      roomSlug,
      userId,
      userName: "Person Example",
      body,
      createdAt: "2026-04-29T10:10:00.000Z"
    })),
    ...overrides
  };
}

describe("createChatService", () => {
  test("returns history in ascending order for room entry rendering", async () => {
    const chatStore = store();
    const service = createChatService({ store: chatStore });

    const messages = await service.listRecentMessages({
      roomSlug: "main-lobby",
      userId: "user-1"
    });

    expect(messages.map((message) => message.id)).toEqual(["message-1", "message-2"]);
    expect(chatStore.listRecentMessages).toHaveBeenCalledWith({
      roomId: "room-1",
      limit: 20
    });
  });

  test("rejects history reads when the user cannot access the room", async () => {
    const service = createChatService({
      store: store({
        findAccessibleRoom: vi.fn(async () => null)
      })
    });

    await expect(
      service.listRecentMessages({
        roomSlug: "main-lobby",
        userId: "user-1"
      })
    ).rejects.toBeInstanceOf(ChatAccessError);
  });

  test("trims and persists accepted chat messages", async () => {
    const chatStore = store();
    const service = createChatService({ store: chatStore });

    const message = await service.createMessage({
      roomSlug: "main-lobby",
      userId: "user-1",
      body: "  Hello room  "
    });

    expect(message.body).toBe("Hello room");
    expect(chatStore.createMessage).toHaveBeenCalledWith({
      roomId: "room-1",
      roomSlug: "main-lobby",
      userId: "user-1",
      body: "Hello room"
    });
  });
});
