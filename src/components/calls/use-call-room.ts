"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  supportsAudioOutputSelection,
  type LocalAudioTrack,
  type LocalVideoTrack,
  type RemoteTrack,
} from "livekit-client";
import { VIDEO_RESOLUTION } from "./media";

export type RoomConnection = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected";

/**
 * Owns one LiveKit Room for the call screen. Re-renders on participant,
 * track, speaker and quality events; remote audio is attached to hidden
 * <audio> elements so it plays regardless of layout.
 */
export function useCallRoom(opts: { onUnexpectedDisconnect: () => void }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [connection, setConnection] = useState<RoomConnection>("idle");
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [version, bump] = useReducer((x: number) => x + 1, 0);
  const roomRef = useRef<Room | null>(null);
  const intentionalRef = useRef(false);
  const onLost = useRef(opts.onUnexpectedDisconnect);
  useEffect(() => {
    onLost.current = opts.onUnexpectedDisconnect;
  });

  const refreshDevices = useCallback(async () => {
    try {
      const [cams, outs] = await Promise.all([
        Room.getLocalDevices("videoinput", false),
        supportsAudioOutputSelection() ? Room.getLocalDevices("audiooutput", false) : Promise.resolve([] as MediaDeviceInfo[]),
      ]);
      setCameras(cams.filter((d) => d.deviceId));
      setOutputs(outs.filter((d) => d.deviceId));
    } catch {
      // enumerateDevices unavailable
    }
  }, []);

  const connect = useCallback(
    async (params: { url: string; token: string; audio: LocalAudioTrack; video: LocalVideoTrack | null }) => {
      intentionalRef.current = false;
      const r = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: { resolution: VIDEO_RESOLUTION },
        publishDefaults: { simulcast: true },
      });
      roomRef.current = r;
      setRoom(r);
      setConnection("connecting");

      const onSubscribed = (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.setAttribute("data-qc-call-audio", "");
          el.style.display = "none";
          document.body.appendChild(el);
        }
        bump();
      };
      const onUnsubscribed = (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) track.detach().forEach((el) => el.remove());
        bump();
      };
      r.on(RoomEvent.TrackSubscribed, onSubscribed)
        .on(RoomEvent.TrackUnsubscribed, onUnsubscribed)
        .on(RoomEvent.ParticipantConnected, bump)
        .on(RoomEvent.ParticipantDisconnected, bump)
        .on(RoomEvent.TrackMuted, bump)
        .on(RoomEvent.TrackUnmuted, bump)
        .on(RoomEvent.TrackPublished, bump)
        .on(RoomEvent.TrackUnpublished, bump)
        .on(RoomEvent.LocalTrackPublished, bump)
        .on(RoomEvent.LocalTrackUnpublished, bump)
        .on(RoomEvent.ActiveSpeakersChanged, bump)
        .on(RoomEvent.ConnectionQualityChanged, bump)
        .on(RoomEvent.ActiveDeviceChanged, bump)
        .on(RoomEvent.MediaDevicesChanged, () => void refreshDevices())
        .on(RoomEvent.AudioPlaybackStatusChanged, () => setAudioBlocked(!r.canPlaybackAudio))
        .on(RoomEvent.Reconnecting, () => setConnection("reconnecting"))
        .on(RoomEvent.SignalReconnecting, () => setConnection("reconnecting"))
        .on(RoomEvent.Reconnected, () => setConnection("connected"))
        .on(RoomEvent.Disconnected, () => {
          setConnection("disconnected");
          document.querySelectorAll("[data-qc-call-audio]").forEach((el) => el.remove());
          if (!intentionalRef.current) onLost.current();
        });

      await r.connect(params.url, params.token, { autoSubscribe: true });
      if (intentionalRef.current) return;
      await r.localParticipant.publishTrack(params.audio);
      if (params.video) await r.localParticipant.publishTrack(params.video);
      setConnection(r.state === ConnectionState.Connected ? "connected" : "reconnecting");
      setAudioBlocked(!r.canPlaybackAudio);
      void refreshDevices();
      bump();
    },
    [refreshDevices],
  );

  const disconnect = useCallback(async () => {
    intentionalRef.current = true;
    const r = roomRef.current;
    roomRef.current = null;
    if (r) {
      r.localParticipant.getTrackPublications().forEach((p) => p.track?.stop());
      await r.disconnect(true).catch(() => undefined);
    }
    document.querySelectorAll("[data-qc-call-audio]").forEach((el) => el.remove());
    setConnection("disconnected");
  }, []);

  // Tear down on unmount.
  useEffect(
    () => () => {
      intentionalRef.current = true;
      const r = roomRef.current;
      roomRef.current = null;
      if (r) {
        r.localParticipant.getTrackPublications().forEach((p) => p.track?.stop());
        void r.disconnect(true);
      }
      document.querySelectorAll("[data-qc-call-audio]").forEach((el) => el.remove());
    },
    [],
  );

  return { room, connection, audioBlocked, outputs, cameras, version, connect, disconnect, bump, refreshDevices };
}
