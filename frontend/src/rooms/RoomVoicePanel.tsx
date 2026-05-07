import { useEffect, useRef, useState } from "react";
import type { RealtimeClient, RealtimeVoiceState, VoiceParticipant } from "../realtime/realtimeClient";
import { createRoomVoiceController, type RoomVoiceController } from "./roomVoiceController";

export function RoomVoicePanel({
  joinedRoom,
  realtimeClient,
  roomSlug,
  voice
}: {
  joinedRoom: boolean;
  realtimeClient: RealtimeClient;
  roomSlug: string;
  voice: RealtimeVoiceState;
}) {
  const [controller] = useState<RoomVoiceController>(() => createRoomVoiceController({ realtimeClient }));
  const [joinedVoice, setJoinedVoice] = useState(false);
  const [micGain, setMicGain] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [speakerSettings, setSpeakerSettings] = useState<Record<string, { muted: boolean; volume: number }>>({});
  const processedSignalCount = useRef(0);
  const selfConnectionId = voice.self?.connectionId;

  useEffect(() => {
    if (!joinedVoice) return;
    controller.syncParticipants(roomSlug, voice.participants, selfConnectionId);
  }, [controller, joinedVoice, roomSlug, selfConnectionId, voice.participants]);

  useEffect(() => {
    if (!joinedVoice) return;
    const nextSignals = voice.signals.slice(processedSignalCount.current);
    processedSignalCount.current = voice.signals.length;
    nextSignals.forEach((signal) => {
      void controller.handleSignal(roomSlug, signal).catch((nextError: unknown) => {
        setError(nextError instanceof Error ? nextError.message : "Voice connection failed.");
      });
    });
  }, [controller, joinedVoice, roomSlug, voice.signals]);

  useEffect(() => {
    return () => {
      if (joinedVoice) {
        realtimeClient.leaveVoice({ roomSlug });
      }
    };
  }, [joinedVoice, realtimeClient, roomSlug]);

  useEffect(() => {
    return () => {
      controller.dispose();
    };
  }, [controller]);

  async function handleJoinVoice() {
    try {
      setError(null);
      await controller.join(roomSlug);
      setJoinedVoice(true);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Microphone access failed.");
    }
  }

  function handleLeaveVoice() {
    controller.leave(roomSlug);
    processedSignalCount.current = 0;
    setJoinedVoice(false);
  }

  function handleMicGain(value: number) {
    setMicGain(value);
    controller.setMicGain(value);
  }

  function handleSpeakerMuted(connectionId: string, muted: boolean) {
    setSpeakerSettings((current) => ({
      ...current,
      [connectionId]: { muted, volume: current[connectionId]?.volume ?? 1 }
    }));
    controller.setRemoteMuted(connectionId, muted);
  }

  function handleSpeakerVolume(connectionId: string, volume: number) {
    setSpeakerSettings((current) => ({
      ...current,
      [connectionId]: { muted: current[connectionId]?.muted ?? false, volume }
    }));
    controller.setRemoteVolume(connectionId, volume);
  }

  return (
    <section aria-label="Room voice" className="room-voice">
      <div className="room-voice__header">
        <div>
          <p className="section-kicker">Room voice</p>
          <h2>Voice</h2>
        </div>
        {joinedVoice ? (
          <button type="button" onClick={handleLeaveVoice}>Leave voice</button>
        ) : (
          <button type="button" disabled={!joinedRoom} onClick={handleJoinVoice}>Join voice</button>
        )}
      </div>
      <label className="room-voice__control">
        Mic volume
        <input
          disabled={!joinedVoice}
          max="1"
          min="0"
          onChange={(event) => handleMicGain(event.currentTarget.valueAsNumber)}
          step="0.05"
          type="range"
          value={micGain}
        />
      </label>
      {error ?? voice.error ? <p className="form-message form-message-error">{error ?? voice.error}</p> : null}
      <ul className="room-voice__members">
        {voice.participants.map((participant) => (
          <VoiceParticipantRow
            isSelf={participant.connectionId === selfConnectionId}
            key={participant.connectionId}
            participant={participant}
            settings={speakerSettings[participant.connectionId] ?? { muted: false, volume: 1 }}
            onAudioElement={(connectionId, audio) => controller.attachRemoteAudio(connectionId, audio)}
            onMutedChange={handleSpeakerMuted}
            onVolumeChange={handleSpeakerVolume}
          />
        ))}
      </ul>
    </section>
  );
}

function VoiceParticipantRow({
  isSelf,
  onMutedChange,
  onAudioElement,
  onVolumeChange,
  participant,
  settings
}: {
  isSelf: boolean;
  onMutedChange: (connectionId: string, muted: boolean) => void;
  onAudioElement: (connectionId: string, audio: HTMLAudioElement) => void;
  onVolumeChange: (connectionId: string, volume: number) => void;
  participant: VoiceParticipant;
  settings: { muted: boolean; volume: number };
}) {
  const displayName = participant.name ?? participant.email;

  return (
    <li className="room-voice__member">
      <span>{displayName}</span>
      {isSelf ? <span className="muted">You</span> : null}
      {!isSelf ? (
        <>
          <label>
            Mute
            <input
              checked={settings.muted}
              onChange={(event) => onMutedChange(participant.connectionId, event.currentTarget.checked)}
              type="checkbox"
            />
          </label>
          <label>
            Volume
            <input
              max="1"
              min="0"
              onChange={(event) => onVolumeChange(participant.connectionId, event.currentTarget.valueAsNumber)}
              step="0.05"
              type="range"
              value={settings.volume}
            />
          </label>
          <audio autoPlay ref={(audio) => {
            if (audio) {
              onAudioElement(participant.connectionId, audio);
            }
          }} />
        </>
      ) : null}
    </li>
  );
}
