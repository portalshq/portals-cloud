import React, { type ComponentType, type ReactNode, useEffect, useRef, useState } from "react";

import { mountPlaybackCaptions } from "./browser.js";
import { HlsPlaybackController, type PlaybackObservation } from "./hls-playback-controller.js";
import type { HlsPlaybackSession } from "./live-session.js";

export interface ExternalVideoPlayerProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  mediaRef(element: HTMLVideoElement | null): void;
  playback: HlsPlaybackSession;
}

export interface VideoDeliveryPlayerProps extends Omit<React.VideoHTMLAttributes<HTMLVideoElement>, "src"> {
  playback: HlsPlaybackSession;
  maxReconnectAttempts?: number;
  reconnectDelayMs?: number;
  externalPlayer?: ComponentType<ExternalVideoPlayerProps>;
  renderOverlay?: (observation: PlaybackObservation) => ReactNode;
  onPlaybackObservation?: (observation: PlaybackObservation) => void;
}

/** Base Portals player; applications provide presentation and optional external video rendering. */
export function VideoDeliveryPlayer({
  playback,
  maxReconnectAttempts,
  reconnectDelayMs,
  externalPlayer: ExternalPlayer,
  renderOverlay,
  onPlaybackObservation,
  ...videoProps
}: VideoDeliveryPlayerProps): React.ReactElement {
  const media = useRef<HTMLVideoElement | null>(null);
  const observationCallback = useRef(onPlaybackObservation);
  const [observation, setObservation] = useState<PlaybackObservation>({ state: "idle", attempt: 0 });
  const [heldFrame, setHeldFrame] = useState<string>();

  observationCallback.current = onPlaybackObservation;

  useEffect(() => {
    const element = media.current;
    if (!element) return;
    const controller = new HlsPlaybackController({
      media: element,
      session: playback,
      ...(maxReconnectAttempts === undefined ? {} : { maxReconnectAttempts }),
      ...(reconnectDelayMs === undefined ? {} : { reconnectDelayMs }),
      onObservation: (next) => {
        if (next.state === "buffering" || next.state === "reconnecting") setHeldFrame(captureFrame(element));
        if (next.state === "playing") setHeldFrame(undefined);
        setObservation(next);
        observationCallback.current?.(next);
      },
    });
    void controller.attach().catch((error) => controller.reconnect(error));
    return () => {
      controller.destroy();
    };
  }, [playback.playbackManifestUrl, playback.sessionId, maxReconnectAttempts, reconnectDelayMs, ExternalPlayer]);

  useEffect(() => {
    const element = media.current;
    if (!element) return;
    return mountPlaybackCaptions(element, playback).remove;
  }, [playback.captionTracks, ExternalPlayer]);

  const sharedProps = { ...videoProps, "data-video-delivery-player": playback.sessionId };
  return React.createElement(
    React.Fragment,
    null,
    heldFrame ? React.createElement("img", { src: heldFrame, alt: "", "aria-hidden": true, "data-video-delivery-held-frame": true }) : null,
    ExternalPlayer
      ? React.createElement(ExternalPlayer, { ...sharedProps, playback, mediaRef: (element) => { media.current = element; } })
      : React.createElement("video", { ...sharedProps, ref: media }),
    renderOverlay?.(observation),
  );
}

function captureFrame(media: HTMLVideoElement): string | undefined {
  if (!media.videoWidth || !media.videoHeight) return undefined;
  try {
    const canvas = media.ownerDocument.createElement("canvas");
    canvas.width = media.videoWidth;
    canvas.height = media.videoHeight;
    canvas.getContext("2d")?.drawImage(media, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return undefined;
  }
}
