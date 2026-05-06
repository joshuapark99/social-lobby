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
});
