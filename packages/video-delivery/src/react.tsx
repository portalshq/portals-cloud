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
  /** Reactor token for WebRTC mode (optional - if provided, uses WebRTC instead of HLS) */
  reactorToken?: string;
  /** Reactor session ID for WebRTC mode (optional - creates new session if not provided) */
  reactorSessionId?: string;
  /** Reactor model name for WebRTC mode */
  reactorModelName?: string;
}

/** Base Portals player; applications provide presentation and optional external video rendering. */
export function VideoDeliveryPlayer({
  playback,
  maxReconnectAttempts,
  reconnectDelayMs,
  externalPlayer: ExternalPlayer,
  renderOverlay,
  onPlaybackObservation,
  reactorToken,
  reactorSessionId,
  reactorModelName,
  ...videoProps
}: VideoDeliveryPlayerProps): React.ReactElement {
  const media = useRef<HTMLVideoElement | null>(null);
  const observationCallback = useRef(onPlaybackObservation);
  const [observation, setObservation] = useState<PlaybackObservation>({ state: "idle", attempt: 0 });
  const [heldFrame, setHeldFrame] = useState<string>();
  const [useReactor, setUseReactor] = useState(false);

  observationCallback.current = onPlaybackObservation;

  // Determine if we should use Reactor WebRTC
  const shouldUseReactor = Boolean(reactorToken && reactorModelName);

  useEffect(() => {
    setUseReactor(shouldUseReactor);
  }, [shouldUseReactor]);

  // HLS mode (existing logic)
  useEffect(() => {
    if (useReactor) return; // Skip HLS if using Reactor

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
  }, [useReactor, playback.playbackManifestUrl, playback.sessionId, maxReconnectAttempts, reconnectDelayMs, ExternalPlayer]);

  useEffect(() => {
    const element = media.current;
    if (!element) return;
    return mountPlaybackCaptions(element, playback).remove;
  }, [playback.captionTracks, ExternalPlayer]);

  const sharedProps = { ...videoProps, "data-video-delivery-player": playback.sessionId };
  
  // Reactor WebRTC mode
  if (useReactor && shouldUseReactor) {
    return React.createElement(
      ReactorWebRTCWrapper,
      {
        token: reactorToken!,
        sessionId: reactorSessionId,
        modelName: reactorModelName!,
        mediaRef: media,
        onStatusChange: (status) => {
          const stateMap: Record<string, PlaybackObservation["state"]> = {
            connecting: "loading",
            ready: "playing",
            disconnected: "idle",
            failed: "error",
          };
          setObservation({ state: stateMap[status] || "idle", attempt: 0 });
          observationCallback.current?.({ state: stateMap[status] || "idle", attempt: 0 });
        },
        onError: (error) => {
          setObservation({ state: "error", attempt: 0, error });
          observationCallback.current?.({ state: "error", attempt: 0, error });
        },
      }
    );
  }

  // HLS mode (existing)
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

/**
 * Reactor WebRTC wrapper component.
 *
 * This is a placeholder that indicates Reactor SDK integration.
 * Production implementation requires @reactor-team/js-sdk to be installed.
 */
interface ReactorWebRTCWrapperProps {
  token: string;
  sessionId?: string;
  modelName: string;
  mediaRef: React.RefObject<HTMLVideoElement>;
  onStatusChange: (status: string) => void;
  onError: (error: Error) => void;
}

function ReactorWebRTCWrapper({
  token,
  sessionId,
  modelName,
  mediaRef,
  onStatusChange,
  onError,
}: ReactorWebRTCWrapperProps): React.ReactElement {
  // Note: This requires @reactor-team/js-sdk to be installed
  // The production implementation would wrap ReactorProvider and ReactorView
  
  console.warn("[VideoDeliveryPlayer] Reactor WebRTC mode requested but @reactor-team/js-sdk not installed. Falling back to placeholder.");
  
  onStatusChange("disconnected");
  
  return React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      background: "#000",
      color: "#fff",
    },
  }, "Reactor WebRTC requires @reactor-team/js-sdk to be installed");
}
