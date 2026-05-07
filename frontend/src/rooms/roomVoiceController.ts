import type { RealtimeClient, VoiceParticipant, VoiceSignal } from "../realtime/realtimeClient";

type MinimalAudioContext = {
  createMediaStreamSource(stream: MediaStream): MediaStreamAudioSourceNode;
  createGain(): GainNode;
  createMediaStreamDestination(): MediaStreamAudioDestinationNode;
  resume?: () => Promise<void>;
  close(): Promise<void>;
};

export type RoomVoiceController = {
  readonly localStream: MediaStream | null;
  join(roomSlug: string): Promise<void>;
  leave(roomSlug: string): void;
  setMicGain(value: number): void;
  syncParticipants(roomSlug: string, participants: VoiceParticipant[], selfConnectionId?: string): void;
  handleSignal(roomSlug: string, signal: VoiceSignal): Promise<void>;
  attachRemoteAudio(connectionId: string, audio: HTMLAudioElement): void;
  setRemoteMuted(connectionId: string, muted: boolean): void;
  setRemoteVolume(connectionId: string, volume: number): void;
  dispose(): void;
};

export function createRoomVoiceController({
  audioContextFactory = () => new AudioContext(),
  iceServers = defaultIceServers(),
  mediaDevices = navigator.mediaDevices,
  peerConnectionFactory = (configuration) => new RTCPeerConnection(configuration),
  realtimeClient
}: {
  audioContextFactory?: () => MinimalAudioContext;
  iceServers?: RTCIceServer[];
  mediaDevices?: Pick<MediaDevices, "getUserMedia">;
  peerConnectionFactory?: (configuration: RTCConfiguration) => RTCPeerConnection;
  realtimeClient: RealtimeClient;
}): RoomVoiceController {
  let audioContext: MinimalAudioContext | null = null;
  let inputStream: MediaStream | null = null;
  let processedStream: MediaStream | null = null;
  let micGain: GainNode | null = null;
  const peers = new Map<string, RTCPeerConnection>();
  const remoteAudio = new Map<string, HTMLAudioElement>();
  const remoteStreams = new Map<string, MediaStream>();
  let activeRemoteConnectionIds = new Set<string>();

  const controller: RoomVoiceController = {
    get localStream() {
      return processedStream;
    },
    async join(roomSlug) {
      inputStream = await mediaDevices.getUserMedia({ audio: true });
      audioContext = audioContextFactory();
      await audioContext.resume?.();
      const source = audioContext.createMediaStreamSource(inputStream);
      micGain = audioContext.createGain();
      const destination = audioContext.createMediaStreamDestination();
      source.connect(micGain);
      micGain.connect(destination);
      processedStream = destination.stream;
      realtimeClient.joinVoice({ roomSlug });
    },
    leave(roomSlug) {
      realtimeClient.leaveVoice({ roomSlug });
      stopLocalMedia();
      closePeers();
    },
    setMicGain(value) {
      if (micGain) {
        micGain.gain.value = clampUnit(value);
      }
    },
    syncParticipants(roomSlug, participants, selfConnectionId) {
      const remoteParticipants = participants.filter((participant) => participant.connectionId !== selfConnectionId);
      const activeIds = new Set(remoteParticipants.map((participant) => participant.connectionId));
      activeRemoteConnectionIds = activeIds;
      for (const connectionId of peers.keys()) {
        if (!activeIds.has(connectionId)) {
          closePeer(connectionId);
          peers.delete(connectionId);
        }
      }

      remoteParticipants.forEach((participant) => {
        const { created, peer } = ensurePeer(roomSlug, participant.connectionId);
        if (created && shouldInitiateOffer(selfConnectionId, participant.connectionId)) {
          void negotiatePeer(roomSlug, participant.connectionId, peer);
        }
      });
    },
    async handleSignal(roomSlug, voiceSignal) {
      if (!activeRemoteConnectionIds.has(voiceSignal.fromConnectionId)) return;

      const { peer } = ensurePeer(roomSlug, voiceSignal.fromConnectionId);
      const signal = voiceSignal.signal as RTCSessionDescriptionInit | RTCIceCandidateInit;
      if (isSessionDescription(signal)) {
        if (signal.type === "answer" && peer.signalingState !== "have-local-offer") {
          return;
        }
        if (signal.type === "offer" && peer.signalingState !== "stable") {
          return;
        }
        await peer.setRemoteDescription(signal);
        if (signal.type === "offer") {
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          realtimeClient.sendVoiceSignal({
            roomSlug,
            targetConnectionId: voiceSignal.fromConnectionId,
            signal: answer
          });
        }
        return;
      }

      await peer.addIceCandidate(signal);
    },
    attachRemoteAudio(connectionId, audio) {
      remoteAudio.set(connectionId, audio);
      const stream = remoteStreams.get(connectionId);
      if (stream) {
        audio.srcObject = stream;
        void audio.play().catch(() => undefined);
      }
    },
    setRemoteMuted(connectionId, muted) {
      const audio = remoteAudio.get(connectionId);
      if (audio) {
        audio.muted = muted;
      }
    },
    setRemoteVolume(connectionId, volume) {
      const audio = remoteAudio.get(connectionId);
      if (audio) {
        audio.volume = clampUnit(volume);
      }
    },
    dispose() {
      stopLocalMedia();
      closePeers();
      remoteAudio.clear();
      remoteStreams.clear();
      activeRemoteConnectionIds = new Set();
    }
  };

  function ensurePeer(roomSlug: string, connectionId: string): { created: boolean; peer: RTCPeerConnection } {
    const existing = peers.get(connectionId);
    if (existing) return { created: false, peer: existing };

    const peer = peerConnectionFactory({ iceServers });
    const localStream = streamWithAudioTracks(processedStream) ?? streamWithAudioTracks(inputStream);
    localStream?.getAudioTracks().forEach((track) => {
      peer.addTrack(track, localStream);
    });
    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      realtimeClient.sendVoiceSignal({
        roomSlug,
        targetConnectionId: connectionId,
        signal: event.candidate.toJSON()
      });
    };
    peer.ontrack = (event) => {
      const audio = remoteAudio.get(connectionId);
      const stream = event.streams[0] ?? null;
      if (stream) {
        remoteStreams.set(connectionId, stream);
      }
      if (audio) {
        audio.srcObject = stream;
        void audio.play().catch(() => undefined);
      }
    };
    peers.set(connectionId, peer);
    return { created: true, peer };
  }

  async function negotiatePeer(roomSlug: string, connectionId: string, peer: RTCPeerConnection): Promise<void> {
    if (peer.signalingState !== "stable") return;

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    realtimeClient.sendVoiceSignal({
      roomSlug,
      targetConnectionId: connectionId,
      signal: offer
    });
  }

  function stopLocalMedia() {
    inputStream?.getTracks().forEach((track) => track.stop());
    inputStream = null;
    processedStream = null;
    micGain = null;
    void audioContext?.close();
    audioContext = null;
  }

  function closePeers() {
    peers.forEach((_peer, connectionId) => closePeer(connectionId));
    peers.clear();
  }

  function closePeer(connectionId: string) {
    peers.get(connectionId)?.close();
    remoteStreams.delete(connectionId);
    const audio = remoteAudio.get(connectionId);
    if (audio) {
      audio.srcObject = null;
    }
  }

  return controller;
}

function shouldInitiateOffer(selfConnectionId: string | undefined, remoteConnectionId: string): boolean {
  if (!selfConnectionId) return false;
  return selfConnectionId < remoteConnectionId;
}

function streamWithAudioTracks(stream: MediaStream | null): MediaStream | null {
  if (!stream || stream.getAudioTracks().length === 0) return null;
  return stream;
}

function defaultIceServers(): RTCIceServer[] {
  const raw = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_WEBRTC_ICE_SERVERS;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as RTCIceServer[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function isSessionDescription(signal: RTCSessionDescriptionInit | RTCIceCandidateInit): signal is RTCSessionDescriptionInit {
  return "type" in signal && typeof signal.type === "string";
}
