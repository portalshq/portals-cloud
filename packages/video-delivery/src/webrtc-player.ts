/**
 * WebRTC player for Reactor live streaming.
 *
 * This package provides React components for Reactor WebRTC playback.
 * The WebRTCPlayer class is not implemented because Reactor's SDK is React-specific.
 * Use ReactorWebRTCPlayer component in React applications instead.
 */

export type WebRTCPlaybackState = "idle" | "connecting" | "connected" | "reconnecting" | "error" | "destroyed";

export interface WebRTCPlaybackObservation {
  state: WebRTCPlaybackState;
  attempt: number;
  error?: unknown;
}

export interface ReactorSignalingConfig {
  /** JWT token for authentication */
  token: string;
  /** Session ID to connect to (from backend) */
  sessionId: string;
  /** Model name being used */
  modelName: string;
}

export interface WebRTCPlayerOptions {
  media: HTMLVideoElement;
  signaling: ReactorSignalingConfig;
  maxReconnectAttempts?: number;
  reconnectDelayMs?: number;
  iceServers?: RTCIceServer[];
  onObservation?: (observation: WebRTCPlaybackObservation) => void;
}

/**
 * WebRTC player class - NOT IMPLEMENTED.
 *
 * Reactor's SDK (@reactor-team/js-sdk) is React-specific and requires React context.
 * Use ReactorWebRTCPlayer component from ./react.tsx instead.
 */
export class WebRTCPlayer {
  constructor(private readonly options: WebRTCPlayerOptions) {
    throw new Error(
      "WebRTCPlayer class is not implemented. " +
      "Reactor's SDK is React-specific. " +
      "Use ReactorWebRTCPlayer component from './react.tsx' instead. " +
      "This component wraps @reactor-team/js-sdk for React applications."
    );
  }
}
