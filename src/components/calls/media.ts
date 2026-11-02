"use client";

import {
  createLocalAudioTrack,
  createLocalVideoTrack,
  MediaDeviceFailure,
  VideoPresets,
  type LocalAudioTrack,
  type LocalVideoTrack,
} from "livekit-client";

export type MediaDevice = "microphone" | "camera";
export type MediaFailureKind = "denied" | "not_found" | "in_use" | "insecure" | "other";

export class MediaAcquireError extends Error {
  constructor(
    public readonly device: MediaDevice,
    public readonly kind: MediaFailureKind,
  ) {
    super(`${device}:${kind}`);
    this.name = "MediaAcquireError";
  }
}

export const VIDEO_RESOLUTION = VideoPresets.h720.resolution;

function classify(error: unknown): MediaFailureKind {
  const name = (error as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "not_found";
  if (name === "NotReadableError" || name === "AbortError" || name === "TrackStartError") return "in_use";
  switch (MediaDeviceFailure.getFailure(error)) {
    case MediaDeviceFailure.PermissionDenied:
      return "denied";
    case MediaDeviceFailure.NotFound:
      return "not_found";
    case MediaDeviceFailure.DeviceInUse:
      return "in_use";
    default:
      return "other";
  }
}

function mediaSupported() {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext;
}

export async function acquireMicrophone(): Promise<LocalAudioTrack> {
  if (!mediaSupported()) throw new MediaAcquireError("microphone", "insecure");
  try {
    return await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
  } catch (error) {
    throw new MediaAcquireError("microphone", classify(error));
  }
}

export async function acquireCamera(facingMode: "user" | "environment" = "user"): Promise<LocalVideoTrack> {
  if (!mediaSupported()) throw new MediaAcquireError("camera", "insecure");
  try {
    return await createLocalVideoTrack({ facingMode, resolution: VIDEO_RESOLUTION });
  } catch (error) {
    throw new MediaAcquireError("camera", classify(error));
  }
}

export function mediaErrorCopy(err: MediaAcquireError): { title: string; body: string } {
  const device = err.device === "camera" ? "camera" : "microphone";
  switch (err.kind) {
    case "denied":
      return {
        title: `Allow ${device} access`,
        body: `Quick Chat needs your ${device} for this call. Click the lock or camera icon in your browser's address bar (or open your browser's site settings), allow the ${device} for this site, then try again.`,
      };
    case "not_found":
      return {
        title: `No ${device} found`,
        body: `We couldn't find a ${device} on this device. Connect one (or check that it's enabled in your system settings) and try again.`,
      };
    case "in_use":
      return {
        title: `Your ${device} is busy`,
        body: `Another app or browser tab is using your ${device}. Close it and try again.`,
      };
    case "insecure":
      return {
        title: "Calls need a secure connection",
        body: "Your browser only allows microphone and camera access on HTTPS pages. Open Quick Chat over https:// and try again.",
      };
    default:
      return {
        title: `Couldn't start your ${device}`,
        body: `Something went wrong while starting your ${device}. Check your device and browser permissions, then try again.`,
      };
  }
}

/** Whether the browser can change the facingMode constraint (phones/tablets). */
export function supportsFacingMode(): boolean {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getSupportedConstraints) return false;
  return Boolean(navigator.mediaDevices.getSupportedConstraints().facingMode) && navigator.maxTouchPoints > 0;
}
