import { expect, test, type Page } from "@playwright/test";

test.use({
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]
  },
  permissions: ["microphone"]
});

test("connects room voice media between two browser sessions", async ({ browser }) => {
  const broker = new VoiceBroker();
  const firstContext = await browser.newContext({ permissions: ["microphone"] });
  const secondContext = await browser.newContext({ permissions: ["microphone"] });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();

  await installVoiceHarness(first, broker, {
    connectionId: "conn-a",
    email: "one@example.com",
    userId: "user-1",
    userName: "One"
  });
  await installVoiceHarness(second, broker, {
    connectionId: "conn-b",
    email: "two@example.com",
    userId: "user-2",
    userName: "Two"
  });

  await Promise.all([
    first.goto("/community/default-community/rooms/main-lobby"),
    second.goto("/community/default-community/rooms/main-lobby")
  ]);

  await joinRoom(first);
  await joinRoom(second);
  await joinVoice(first);
  await joinVoice(second);

  await expect(first.getByText("Two")).toBeVisible();
  await expect(second.getByText("One")).toBeVisible();

  await expect.poll(() => voiceDebug(first), { timeout: 10_000 }).toMatchObject({
    remoteAudioCount: 1,
    remoteStreamCount: 1
  });
  await expect.poll(() => voiceDebug(second), { timeout: 10_000 }).toMatchObject({
    remoteAudioCount: 1,
    remoteStreamCount: 1
  });

  await expect.poll(() => connectedPeerCount(first), { timeout: 10_000 }).toBe(1);
  await expect.poll(() => connectedPeerCount(second), { timeout: 10_000 }).toBe(1);

  await leaveVoice(second);
  await expect(first.getByText("Two")).not.toBeVisible();
  await first.evaluate(() => {
    window.__SOCIAL_LOBBY_VOICE_DISPATCH__({
      type: "voice.signal",
      fromConnectionId: "conn-b",
      targetConnectionId: "conn-a",
      signal: { type: "answer", sdp: "stale-answer" }
    });
  });
  await expect(first.getByText(/Failed to execute 'setRemoteDescription'/u)).not.toBeVisible();

  await firstContext.close();
  await secondContext.close();
});

async function joinRoom(page: Page) {
  await page.getByRole("region", { name: "Room chat" }).getByRole("button", { name: "Join room" }).click();
  await expect(page.getByText("Realtime: connected")).toBeVisible();
}

async function joinVoice(page: Page) {
  await page.getByRole("button", { name: "Join voice" }).click();
  await expect(page.getByRole("button", { name: "Leave voice" })).toBeVisible();
}

async function leaveVoice(page: Page) {
  await page.getByRole("button", { name: "Leave voice" }).click();
  await expect(page.getByRole("button", { name: "Join voice" })).toBeVisible();
}

async function voiceDebug(page: Page) {
  return page.evaluate(() => {
    const remoteAudio = [...document.querySelectorAll("audio")] as HTMLAudioElement[];
    return {
      remoteAudioCount: remoteAudio.length,
      remoteStreamCount: remoteAudio.filter((audio) => audio.srcObject instanceof MediaStream).length,
      events: window.__SOCIAL_LOBBY_VOICE_DEBUG__.events,
      peers: window.__SOCIAL_LOBBY_VOICE_DEBUG__.peers.map((peer) => ({
        connectionState: peer.connectionState,
        iceConnectionState: peer.iceConnectionState,
        localDescription: peer.localDescription?.type ?? null,
        localSdpHasAudio: peer.localDescription?.sdp.includes("m=audio") ?? false,
        remoteDescription: peer.remoteDescription?.type ?? null,
        remoteSdpHasAudio: peer.remoteDescription?.sdp.includes("m=audio") ?? false,
        senders: peer.getSenders().map((sender) => sender.track?.kind ?? null),
        signalingState: peer.signalingState
      }))
    };
  });
}

async function connectedPeerCount(page: Page) {
  return page.evaluate(() => {
    return window.__SOCIAL_LOBBY_VOICE_DEBUG__.peers.filter((peer) =>
      peer.connectionState === "connected" || peer.iceConnectionState === "connected" || peer.iceConnectionState === "completed"
    ).length;
  });
}

async function installVoiceHarness(page: Page, broker: VoiceBroker, identity: VoiceIdentity) {
  await page.exposeFunction("__socialLobbyVoiceBridge", (event: VoiceBridgeEvent) => broker.receive(event));
  broker.register(identity.connectionId, page);
  await page.addInitScript((input) => {
    const identity = input.identity;
    const room = {
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
          teleports: []
        }
      }
    };
    const listeners = new Set<(state: unknown) => void>();
    const debug = {
      events: [] as string[],
      peers: [] as RTCPeerConnection[]
    };
    const NativeRTCPeerConnection = window.RTCPeerConnection;
    const nativeGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await nativeGetUserMedia(constraints);
      debug.events.push(`getUserMedia:audio:${stream.getAudioTracks().length}`);
      return stream;
    };
    window.RTCPeerConnection = class DebugRTCPeerConnection extends NativeRTCPeerConnection {
      constructor(configuration?: RTCConfiguration) {
        super(configuration);
        debug.peers.push(this);
        this.addEventListener("connectionstatechange", () => debug.events.push(`connection:${this.connectionState}`));
        this.addEventListener("icecandidate", (event) => debug.events.push(`icecandidate:${event.candidate ? "candidate" : "complete"}`));
        this.addEventListener("iceconnectionstatechange", () => debug.events.push(`ice:${this.iceConnectionState}`));
        this.addEventListener("signalingstatechange", () => debug.events.push(`signaling:${this.signalingState}`));
        this.addEventListener("track", () => debug.events.push("track"));
      }

      addIceCandidate(candidate?: RTCIceCandidateInit | RTCIceCandidate | null) {
        debug.events.push(`addIceCandidate:${candidate ? "candidate" : "empty"}`);
        return super.addIceCandidate(candidate);
      }

      addTrack(track: MediaStreamTrack, ...streams: MediaStream[]) {
        debug.events.push(`addTrack:${track.kind}`);
        return super.addTrack(track, ...streams);
      }

      createAnswer(options?: RTCAnswerOptions) {
        debug.events.push("createAnswer");
        return super.createAnswer(options);
      }

      createOffer(options?: RTCOfferOptions) {
        debug.events.push("createOffer");
        return super.createOffer(options);
      }

      setLocalDescription(description?: RTCLocalSessionDescriptionInit) {
        debug.events.push(`setLocalDescription:${description?.type ?? "implicit"}`);
        return super.setLocalDescription(description);
      }

      setRemoteDescription(description: RTCSessionDescriptionInit) {
        debug.events.push(`setRemoteDescription:${description.type}`);
        return super.setRemoteDescription(description);
      }
    };

    const realtime = {
      status: "idle",
      snapshot: null,
      messages: [],
      error: null,
      voice: emptyVoiceState(),
      connect(roomSlug: string) {
        realtime.status = "connected";
        realtime.snapshot = {
          room: { slug: room.room.slug, name: room.room.name, layoutVersion: room.room.layoutVersion },
          self: occupantFor(identity),
          occupants: [occupantFor(identity)]
        };
        notify();
        return () => {
          realtime.status = "idle";
          realtime.snapshot = null;
          realtime.voice = emptyVoiceState();
          notify();
        };
      },
      requestMovement() {},
      requestTeleport() {},
      sendChatMessage() {},
      joinVoice({ roomSlug }: { roomSlug: string }) {
        void window.__socialLobbyVoiceBridge({
          type: "joinVoice",
          roomSlug,
          participant: participantFor(identity)
        });
      },
      leaveVoice({ roomSlug }: { roomSlug: string }) {
        void window.__socialLobbyVoiceBridge({
          type: "leaveVoice",
          roomSlug,
          participant: participantFor(identity)
        });
      },
      sendVoiceSignal(input: { roomSlug: string; targetConnectionId: string; signal: unknown }) {
        void window.__socialLobbyVoiceBridge({
          type: "voiceSignal",
          fromConnectionId: identity.connectionId,
          roomSlug: input.roomSlug,
          targetConnectionId: input.targetConnectionId,
          signal: input.signal
        });
      },
      subscribe(listener: (state: unknown) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };

    window.__SOCIAL_LOBBY_VOICE_DEBUG__ = debug;
    window.__SOCIAL_LOBBY_VOICE_DISPATCH__ = (event) => {
      if (event.type === "voice.snapshot") {
        realtime.voice = {
          self: event.self,
          participants: event.participants,
          error: null,
          signals: realtime.voice.signals
        };
      }
      if (event.type === "voice.joined") {
        realtime.voice = {
          ...realtime.voice,
          participants: [...realtime.voice.participants.filter((candidate) => candidate.connectionId !== event.participant.connectionId), event.participant]
        };
      }
      if (event.type === "voice.left") {
        realtime.voice = {
          ...realtime.voice,
          self: realtime.voice.self?.connectionId === event.connectionId ? null : realtime.voice.self,
          participants: realtime.voice.participants.filter((participant) => participant.connectionId !== event.connectionId)
        };
      }
      if (event.type === "voice.signal") {
        realtime.voice = {
          ...realtime.voice,
          signals: [...realtime.voice.signals, {
            fromConnectionId: event.fromConnectionId,
            targetConnectionId: event.targetConnectionId,
            signal: event.signal
          }]
        };
      }
      notify();
    };
    window.__SOCIAL_LOBBY_APP_PROPS__ = {
      bootstrapSession: async () => ({
        status: "authenticated",
        user: {
          displayName: identity.userName,
          email: identity.email,
          username: identity.userName,
          needsUsername: false
        }
      }),
      apiClient: {
        baseUrl: "/api",
        updateProfile: async () => ({ displayName: identity.userName, username: identity.userName }),
        createCommunity: async () => ({ community: { id: "community-2", slug: "new-community", name: "New Community" }, rooms: [] }),
        redeemInvite: async () => ({ status: "redeemed", communityId: "community-1" }),
        listCommunityMembers: async () => ({ members: [] }),
        updateCommunityMemberRole: async () => ({ userId: identity.userId, communityId: "community-1", role: "member", status: "active" }),
        listCommunities: async () => ({ communities: [{ community: room.community, rooms: [room.room] }] }),
        listRooms: async () => ({ community: room.community, rooms: [room.room] }),
        listCommunityRooms: async () => ({ community: room.community, rooms: [room.room] }),
        getRoom: async () => room,
        listRoomMessages: async () => ({ messages: [] })
      },
      realtimeClient: realtime
    };

    function notify() {
      listeners.forEach((listener) => listener({
        status: realtime.status,
        snapshot: realtime.snapshot,
        messages: realtime.messages,
        error: realtime.error,
        voice: realtime.voice
      }));
    }

    function emptyVoiceState() {
      return { self: null, participants: [], error: null, signals: [] };
    }

    function occupantFor(nextIdentity: typeof identity) {
      return {
        connectionId: nextIdentity.connectionId,
        userId: nextIdentity.userId,
        email: nextIdentity.email,
        name: nextIdentity.userName,
        position: { x: 320, y: 420 }
      };
    }

    function participantFor(nextIdentity: typeof identity) {
      return {
        connectionId: nextIdentity.connectionId,
        userId: nextIdentity.userId,
        email: nextIdentity.email,
        name: nextIdentity.userName
      };
    }
  }, { identity });
}

class VoiceBroker {
  private readonly pages = new Map<string, Page>();
  private readonly participants = new Map<string, VoiceParticipant>();

  register(connectionId: string, page: Page) {
    this.pages.set(connectionId, page);
  }

  async receive(event: VoiceBridgeEvent) {
    if (event.type === "joinVoice") {
      this.participants.set(event.participant.connectionId, event.participant);
      await this.dispatch(event.participant.connectionId, {
        type: "voice.snapshot",
        self: event.participant,
        participants: [...this.participants.values()]
      });
      await Promise.all(
        [...this.participants.keys()]
          .filter((connectionId) => connectionId !== event.participant.connectionId)
          .map((connectionId) => this.dispatch(connectionId, { type: "voice.joined", participant: event.participant }))
      );
    }
    if (event.type === "leaveVoice") {
      this.participants.delete(event.participant.connectionId);
      await Promise.all(
        [...this.participants.keys()].map((connectionId) =>
          this.dispatch(connectionId, {
            type: "voice.left",
            connectionId: event.participant.connectionId
          })
        )
      );
    }
    if (event.type === "voiceSignal") {
      await this.dispatch(event.targetConnectionId, {
        type: "voice.signal",
        fromConnectionId: event.fromConnectionId,
        targetConnectionId: event.targetConnectionId,
        signal: event.signal
      });
    }
  }

  private async dispatch(connectionId: string, event: VoiceDispatchEvent) {
    const page = this.pages.get(connectionId);
    if (!page) return;
    await page.evaluate((nextEvent) => window.__SOCIAL_LOBBY_VOICE_DISPATCH__(nextEvent), event);
  }
}

type VoiceIdentity = {
  connectionId: string;
  email: string;
  userId: string;
  userName: string;
};

type VoiceParticipant = {
  connectionId: string;
  email: string;
  name: string;
  userId: string;
};

type VoiceBridgeEvent =
  | { type: "joinVoice"; roomSlug: string; participant: VoiceParticipant }
  | { type: "leaveVoice"; roomSlug: string; participant: VoiceParticipant }
  | { type: "voiceSignal"; fromConnectionId: string; roomSlug: string; targetConnectionId: string; signal: unknown };

type VoiceDispatchEvent =
  | { type: "voice.snapshot"; self: VoiceParticipant; participants: VoiceParticipant[] }
  | { type: "voice.joined"; participant: VoiceParticipant }
  | { type: "voice.left"; connectionId: string }
  | { type: "voice.signal"; fromConnectionId: string; targetConnectionId: string; signal: unknown };

declare global {
  interface Window {
    __SOCIAL_LOBBY_VOICE_DEBUG__: { events: string[]; peers: RTCPeerConnection[] };
    __SOCIAL_LOBBY_VOICE_DISPATCH__: (event: VoiceDispatchEvent) => void;
    __socialLobbyVoiceBridge: (event: VoiceBridgeEvent) => Promise<void>;
  }
}
