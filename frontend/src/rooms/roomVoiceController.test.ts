import { describe, expect, it, vi } from "vitest";
import { createRoomVoiceController } from "./roomVoiceController";
import type { RealtimeClient } from "../realtime/realtimeClient";

function realtimeClient(): RealtimeClient {
  return {
    status: "connected",
    snapshot: null,
    messages: [],
    error: null,
    voice: {
      self: null,
      participants: [],
      error: null,
      signals: []
    },
    connect: vi.fn(() => () => undefined),
    requestMovement: vi.fn(),
    requestTeleport: vi.fn(),
    sendChatMessage: vi.fn(),
    joinVoice: vi.fn(),
    leaveVoice: vi.fn(),
    sendVoiceSignal: vi.fn(),
    subscribe: vi.fn(() => () => undefined)
  };
}

function audioGraph() {
  const gain = {
    gain: { value: 1 },
    connect: vi.fn()
  };
  const source = {
    connect: vi.fn()
  };
  const destination = {
    stream: {
      getAudioTracks: () => [{ id: "processed-track" }]
    }
  };
  const context = {
    createMediaStreamSource: vi.fn(() => source),
    createGain: vi.fn(() => gain),
    createMediaStreamDestination: vi.fn(() => destination),
    resume: vi.fn(),
    close: vi.fn()
  };

  return { context, destination, gain, source };
}

describe("createRoomVoiceController", () => {
  it("requests microphone permission and sends voice.join", async () => {
    const client = realtimeClient();
    const graph = audioGraph();
    const micStream = {
      getAudioTracks: () => [{ id: "mic-track" }],
      getTracks: () => [{ stop: vi.fn() }]
    };
    const controller = createRoomVoiceController({
      realtimeClient: client,
      mediaDevices: {
        getUserMedia: vi.fn(async () => micStream as never)
      },
      audioContextFactory: () => graph.context as never,
      peerConnectionFactory: vi.fn(() => ({ addTrack: vi.fn(), close: vi.fn() }) as never)
    });

    await controller.join("main-lobby");

    expect(controller.localStream).toBe(graph.destination.stream);
    expect(graph.context.resume).toHaveBeenCalled();
    expect(graph.context.createMediaStreamSource).toHaveBeenCalledWith(micStream);
    expect(client.joinVoice).toHaveBeenCalledWith({ roomSlug: "main-lobby" });
  });

  it("updates local mic gain", async () => {
    const graph = audioGraph();
    const controller = createRoomVoiceController({
      realtimeClient: realtimeClient(),
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({
          getAudioTracks: () => [{ id: "mic-track" }],
          getTracks: () => []
        }) as never)
      },
      audioContextFactory: () => graph.context as never,
      peerConnectionFactory: vi.fn(() => ({ addTrack: vi.fn(), close: vi.fn() }) as never)
    });

    await controller.join("main-lobby");
    controller.setMicGain(0.35);

    expect(graph.gain.gain.value).toBe(0.35);
  });

  it("creates one offer for a deterministic voice peer", async () => {
    const client = realtimeClient();
    const graph = audioGraph();
    const offer = { type: "offer", sdp: "offer-sdp" };
    const peer = {
      addTrack: vi.fn(),
      close: vi.fn(),
      createOffer: vi.fn(async () => offer),
      setLocalDescription: vi.fn(),
      signalingState: "stable"
    };
    const controller = createRoomVoiceController({
      realtimeClient: client,
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({
          getAudioTracks: () => [{ id: "mic-track" }],
          getTracks: () => []
        }) as never)
      },
      audioContextFactory: () => graph.context as never,
      peerConnectionFactory: vi.fn(() => peer as never)
    });

    await controller.join("main-lobby");
    controller.syncParticipants("main-lobby", [
      { connectionId: "conn-a", userId: "user-1", email: "one@example.com" },
      { connectionId: "conn-b", userId: "user-2", email: "two@example.com" }
    ], "conn-a");

    await vi.waitFor(() => {
      expect(client.sendVoiceSignal).toHaveBeenCalledWith({
        roomSlug: "main-lobby",
        targetConnectionId: "conn-b",
        signal: offer
      });
    });
    expect(peer.addTrack).toHaveBeenCalledWith({ id: "processed-track" }, graph.destination.stream);
  });

  it("falls back to the raw microphone stream when the processed stream has no audio track", async () => {
    const client = realtimeClient();
    const graph = audioGraph();
    const micTrack = { id: "mic-track" };
    const micStream = {
      getAudioTracks: () => [micTrack],
      getTracks: () => []
    };
    graph.destination.stream.getAudioTracks = () => [];
    const peer = {
      addTrack: vi.fn(),
      close: vi.fn(),
      createOffer: vi.fn(async () => ({ type: "offer", sdp: "offer-sdp" })),
      setLocalDescription: vi.fn(),
      signalingState: "stable"
    };
    const controller = createRoomVoiceController({
      realtimeClient: client,
      mediaDevices: {
        getUserMedia: vi.fn(async () => micStream as never)
      },
      audioContextFactory: () => graph.context as never,
      peerConnectionFactory: vi.fn(() => peer as never)
    });

    await controller.join("main-lobby");
    controller.syncParticipants("main-lobby", [
      { connectionId: "conn-a", userId: "user-1", email: "one@example.com" },
      { connectionId: "conn-b", userId: "user-2", email: "two@example.com" }
    ], "conn-a");

    expect(peer.addTrack).toHaveBeenCalledWith(micTrack, micStream);
  });

  it("keeps remote mute and volume local to playback elements", () => {
    const controller = createRoomVoiceController({
      realtimeClient: realtimeClient(),
      mediaDevices: {
        getUserMedia: vi.fn()
      },
      audioContextFactory: () => audioGraph().context as never,
      peerConnectionFactory: vi.fn(() => ({ addTrack: vi.fn(), close: vi.fn() }) as never)
    });
    const audio = { muted: false, volume: 1 } as HTMLAudioElement;

    controller.attachRemoteAudio("conn-2", audio);
    controller.setRemoteMuted("conn-2", true);
    controller.setRemoteVolume("conn-2", 0.2);

    expect(audio.muted).toBe(true);
    expect(audio.volume).toBe(0.2);
  });

  it("attaches an already received remote stream when the audio element mounts later", () => {
    let onTrack: (event: { streams: MediaStream[] }) => void = (_event) => {
      throw new Error("ontrack was not attached");
    };
    const controller = createRoomVoiceController({
      realtimeClient: realtimeClient(),
      mediaDevices: {
        getUserMedia: vi.fn()
      },
      audioContextFactory: () => audioGraph().context as never,
      peerConnectionFactory: vi.fn(() => ({
        addIceCandidate: vi.fn(),
        addTrack: vi.fn(),
        close: vi.fn(),
        createAnswer: vi.fn(async () => ({ type: "answer", sdp: "answer-sdp" })),
        setLocalDescription: vi.fn(),
        setRemoteDescription: vi.fn(),
        signalingState: "stable",
        set onicecandidate(_listener: unknown) {
          // Test does not exercise ICE candidate fanout.
        },
        set ontrack(listener: (event: { streams: MediaStream[] }) => void) {
          onTrack = listener;
        }
      }) as never)
    });
    const stream = { id: "remote-stream" } as unknown as MediaStream;
    const audio = {
      play: vi.fn(async () => undefined),
      srcObject: null
    } as unknown as HTMLAudioElement;

    controller.syncParticipants("main-lobby", [
      { connectionId: "conn-2", userId: "user-2", email: "two@example.com" },
      { connectionId: "conn-z", userId: "user-1", email: "one@example.com" }
    ], "conn-z");
    void controller.handleSignal("main-lobby", {
      fromConnectionId: "conn-2",
      targetConnectionId: "conn-z",
      signal: { type: "offer", sdp: "offer-sdp" }
    });
    onTrack({ streams: [stream] });
    controller.attachRemoteAudio("conn-2", audio);

    expect(audio.srcObject).toBe(stream);
    expect(audio.play).toHaveBeenCalled();
  });

  it("ignores stale answers when the peer is already stable", async () => {
    const peer = {
      addTrack: vi.fn(),
      close: vi.fn(),
      setRemoteDescription: vi.fn(),
      signalingState: "stable"
    };
    const controller = createRoomVoiceController({
      realtimeClient: realtimeClient(),
      mediaDevices: {
        getUserMedia: vi.fn()
      },
      audioContextFactory: () => audioGraph().context as never,
      peerConnectionFactory: vi.fn(() => peer as never)
    });

    controller.syncParticipants("main-lobby", [
      { connectionId: "conn-a", userId: "user-2", email: "two@example.com" },
      { connectionId: "conn-z", userId: "user-1", email: "one@example.com" }
    ], "conn-z");
    await controller.handleSignal("main-lobby", {
      fromConnectionId: "conn-a",
      targetConnectionId: "conn-z",
      signal: { type: "answer", sdp: "late-answer" }
    });

    expect(peer.setRemoteDescription).not.toHaveBeenCalled();
  });

  it("ignores signals from participants that already left voice", async () => {
    const peerConnectionFactory = vi.fn(() => ({
      addTrack: vi.fn(),
      close: vi.fn(),
      setRemoteDescription: vi.fn(),
      signalingState: "stable"
    }) as never);
    const controller = createRoomVoiceController({
      realtimeClient: realtimeClient(),
      mediaDevices: {
        getUserMedia: vi.fn()
      },
      audioContextFactory: () => audioGraph().context as never,
      peerConnectionFactory
    });

    controller.syncParticipants("main-lobby", [
      { connectionId: "conn-a", userId: "user-2", email: "two@example.com" },
      { connectionId: "conn-z", userId: "user-1", email: "one@example.com" }
    ], "conn-z");
    expect(peerConnectionFactory).toHaveBeenCalledTimes(1);

    controller.syncParticipants("main-lobby", [
      { connectionId: "conn-z", userId: "user-1", email: "one@example.com" }
    ], "conn-z");
    await controller.handleSignal("main-lobby", {
      fromConnectionId: "conn-a",
      targetConnectionId: "conn-z",
      signal: { type: "offer", sdp: "stale-offer" }
    });

    expect(peerConnectionFactory).toHaveBeenCalledTimes(1);
  });
});
