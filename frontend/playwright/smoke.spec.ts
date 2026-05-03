import { expect, test } from "@playwright/test";

test("blocks anonymous room entry behind the welcome screen", async ({ page }) => {
  await installAppHarness(page, { session: "anonymous" });

  await page.goto("/rooms/main-lobby");

  await expect(page.getByRole("heading", { name: "Welcome to Social Lobby" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveAttribute("href", "/api/auth/login");
});

test("supports room switching, movement requests, and chat fanout for authenticated users", async ({ page }) => {
  await installAppHarness(page, { session: "authenticated" });

  await page.goto("/community/default-community/rooms/main-lobby");

  await expect(page.getByRole("heading", { name: "Main Lobby", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Communities and rooms" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Main Lobby" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rooftop" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add community" })).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => {
    return page.evaluate(() => window.__SOCIAL_LOBBY_SMOKE_STATE__.movementRequests.length);
  }).toBe(1);

  await page.getByRole("button", { name: "Rooftop" }).click();
  await expect(page).toHaveURL(/\/community\/default-community\/rooms\/rooftop$/u);
  await expect(page.getByRole("heading", { name: "Rooftop", exact: true })).toBeVisible();

  await page.getByLabel("Message").fill("Hello room");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("June")).toBeVisible();
  await expect(page.getByText("Hello room", { exact: true })).toBeVisible();
  await expect(page.getByText("Guide")).toBeVisible();
  await expect(page.getByText("Echo: Hello room")).toBeVisible();
  await expect.poll(async () => {
    return page.evaluate(() => window.__SOCIAL_LOBBY_SMOKE_STATE__.chatRequests.length);
  }).toBe(1);

  await page.getByRole("button", { name: "Add community" }).click();
  await expect(page.getByLabel("Invite code")).toBeVisible();
});

async function installAppHarness(page: Parameters<typeof test>[0]["page"], options: { session: "anonymous" | "authenticated" }) {
  await page.addInitScript(({ session }) => {
    const rooms = {
      "main-lobby": {
        community: { id: "community-1", slug: "default-community", name: "Default Community" },
        room: {
          slug: "main-lobby",
          name: "Main Lobby",
          kind: "permanent",
          isDefault: true,
          layoutVersion: 1,
          layout: {
            theme: "cozy-lobby",
            backgroundAsset: "rooms/main-lobby.png",
            avatarStyleSet: "soft-rounded",
            objectPack: "lobby-furniture-v1",
            width: 2400,
            height: 1600,
            spawnPoints: [{ x: 320, y: 420 }],
            collision: [],
            teleports: [{ label: "Rooftop", targetRoom: "rooftop" }]
          }
        }
      },
      rooftop: {
        community: { id: "community-1", slug: "default-community", name: "Default Community" },
        room: {
          slug: "rooftop",
          name: "Rooftop",
          kind: "permanent",
          isDefault: false,
          layoutVersion: 1,
          layout: {
            theme: "evening-rooftop",
            backgroundAsset: "rooms/rooftop.png",
            avatarStyleSet: "soft-rounded",
            objectPack: "rooftop-furniture-v1",
            width: 2200,
            height: 1400,
            spawnPoints: [{ x: 280, y: 380 }],
            collision: [],
            teleports: [{ label: "Lobby", targetRoom: "main-lobby" }]
          }
        }
      }
    };

    const state = {
      movementRequests: [],
      chatRequests: []
    };

    const realtime = createRealtimeClient(rooms, state);

    window.__SOCIAL_LOBBY_SMOKE_STATE__ = state;
    window.__SOCIAL_LOBBY_APP_PROPS__ = {
      bootstrapSession: async () =>
        session === "authenticated"
          ? {
              status: "authenticated",
              user: {
                displayName: "June",
                email: "june@example.com",
                username: "June",
                needsUsername: false
              }
            }
          : { status: "anonymous" },
      realtimeClient: realtime,
      apiClient: {
        baseUrl: "/api",
        updateProfile: async () => ({ displayName: "June", username: "June" }),
        redeemInvite: async () => ({ status: "redeemed", communityId: "community-1" }),
        listCommunities: async () => ({
          communities: [
            {
              community: { id: "community-1", slug: "default-community", name: "Default Community" },
              rooms: [rooms["main-lobby"].room, rooms.rooftop.room]
            }
          ]
        }),
        listRooms: async () => ({
          community: { id: "community-1", slug: "default-community", name: "Default Community" },
          rooms: [rooms["main-lobby"].room, rooms.rooftop.room]
        }),
        getRoom: async (roomSlug) => {
          const room = rooms[roomSlug];
          if (!room) throw new Error("Unable to load room.");
          return room;
        },
        listRoomMessages: async () => ({ messages: [] })
      }
    };

    function createRealtimeClient(roomMap, smokeState) {
      const listeners = new Set();
      const client = {
        status: "idle",
        snapshot: null,
        messages: [],
        error: null,
        connect(roomSlug) {
          const room = roomMap[roomSlug];
          client.status = "connected";
          client.snapshot = snapshotFor(room);
          notify();
          return () => {
            client.status = "idle";
            client.snapshot = null;
            client.messages = [];
            client.error = null;
            notify();
          };
        },
        requestMovement(input) {
          smokeState.movementRequests.push(input);
          if (!client.snapshot) return;
          client.snapshot = {
            ...client.snapshot,
            self: {
              ...client.snapshot.self,
              position: input.destination
            },
            occupants: client.snapshot.occupants.map((occupant) =>
              occupant.connectionId === client.snapshot.self.connectionId
                ? { ...occupant, position: input.destination }
                : occupant
            )
          };
          notify();
        },
        requestTeleport(input) {
          const room = roomMap[input.targetRoom];
          if (!room) return;
          client.snapshot = snapshotFor(room);
          notify();
        },
        sendChatMessage(input) {
          smokeState.chatRequests.push(input);
          const nextMessages = [
            {
              id: `self-${smokeState.chatRequests.length}`,
              roomSlug: input.roomSlug,
              userId: "user-june",
              userName: "June",
              body: input.body,
              createdAt: new Date(2026, 3, 30, 12, smokeState.chatRequests.length).toISOString()
            },
            {
              id: `guide-${smokeState.chatRequests.length}`,
              roomSlug: input.roomSlug,
              userId: "user-guide",
              userName: "Guide",
              body: `Echo: ${input.body}`,
              createdAt: new Date(2026, 3, 30, 12, smokeState.chatRequests.length, 1).toISOString()
            }
          ];
          client.messages = [...client.messages, ...nextMessages];
          notify();
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        }
      };

      return client;

      function notify() {
        listeners.forEach((listener) =>
          listener({
            status: client.status,
            snapshot: client.snapshot,
            messages: client.messages,
            error: client.error
          })
        );
      }

      function snapshotFor(room) {
        const self = {
          connectionId: "conn-self",
          userId: "user-june",
          email: "june@example.com",
          position: room.room.layout.spawnPoints[0]
        };

        return {
          room: {
            slug: room.room.slug,
            name: room.room.name,
            layoutVersion: room.room.layoutVersion
          },
          self,
          occupants: [
            self,
            {
              connectionId: "conn-guide",
              userId: "user-guide",
              email: "guide@example.com",
              position: { x: self.position.x + 120, y: self.position.y }
            }
          ]
        };
      }
    }
  }, options);
}
