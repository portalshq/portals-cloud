/**
 * WebRTC player for Reactor live streaming.
 *
 * Connects to a Reactor session via WebRTC for low-latency real-time video playback.
 * Supports session adoption (connecting to an existing backend-managed session).
 */

export type WebRTCPlaybackState = "idle" | "connecting" | "connected" | "reconnecting" | "error" | "destroyed";

export interface WebRTCPlaybackObservation {
  state: WebRTCPlaybackState;
  attempt: number;
  error?: unknown;
}

export interface ReactorSignalingConfig {
  /** Reactor API endpoint for signaling */
  apiUrl: string;
  /** Session ID to connect to (from backend) */
  sessionId: string;
  /** JWT token for authentication */
  token: string;
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
 * WebRTC player for Reactor live streaming.
 *
 * This is a stub implementation. Full implementation requires Reactor's WebRTC signaling protocol.
 * Reactor uses a custom signaling protocol documented in their SDK.
 */
export class WebRTCPlayer {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private attempts = 0;
  private destroyed = false;
  private readonly maxAttempts: number;
  private readonly delayMs: number;

  constructor(private readonly options: WebRTCPlayerOptions) {
    this.maxAttempts = options.maxReconnectAttempts ?? 5;
    this.delayMs = options.reconnectDelayMs ?? 2_000;
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 0) {
      throw new TypeError("maxReconnectAttempts must be non-negative");
    }
    if (!Number.isInteger(this.delayMs) || this.delayMs < 0) {
      throw new TypeError("reconnectDelayMs must be non-negative");
    }
  }

  /**
   * Connect to the Reactor session.
   *
   * This requires Reactor's WebRTC signaling protocol.
   * The full implementation needs to:
   * 1. Fetch SDP offer from Reactor signaling endpoint
   * 2. Create peer connection with ICE servers
   * 3. Set remote description (offer)
   * 4. Create answer
   * 5. Exchange ICE candidates
   * 6. Attach media stream to video element
   */
  async connect(): Promise<void> {
    if (this.destroyed) throw new Error("WebRTCPlayer is destroyed");
    const generation = ++this.generation;
    this.cleanup();
    this.observe("connecting");

    // STUB: Full implementation requires Reactor signaling protocol
    // Reactor's JavaScript SDK (@reactor-team/js-sdk) handles this internally
    // For a direct implementation, we need to:
    // 1. POST to Reactor signaling endpoint with session_id and token
    // 2. Receive SDP offer
    // 3. Create peer connection and set remote description
    // 4. Create answer and send back
    // 5. Handle ICE candidate exchange

    throw new Error(
      "WebRTCPlayer.connect() not implemented - requires Reactor signaling protocol. " +
      "Use @reactor-team/js-sdk for Reactor WebRTC connections, or implement " +
      "Reactor's signaling protocol (see Reactor SDK source code)."
    );
  }

  /**
   * Replace the current session with a new one.
   */
  async replace(signaling: ReactorSignalingConfig): Promise<void> {
    (this.options as WebRTCPlayerOptions).signaling = signaling;
    this.attempts = 0;
    await this.connect();
  }

  /**
   * Send a command to Reactor via data channel.
   *
   * This requires the data channel to be established during connection.
   */
  async sendCommand(command: string, params: Record<string, unknown>): Promise<void> {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      throw new Error("Data channel not available");
    }

    const message = JSON.stringify({ command, params });
    this.dataChannel.send(message);
  }

  reconnect(error?: unknown): void {
    if (this.destroyed || this.timer) return;
    if (this.attempts >= this.maxAttempts) {
      this.observe("error", error);
      return;
    }
    this.attempts += 1;
    this.observe("reconnecting", error);
    const delay = this.delayMs * Math.max(1, 2 ** (this.attempts - 1));
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.connect().catch((caught) => this.reconnect(caught));
    }, delay);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.cleanup();
    this.observe("destroyed");
  }

  private cleanup(): void {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    const { media } = this.options;
    media.srcObject = null;
  }

  private observe(state: WebRTCPlaybackState, error?: unknown): void {
    this.options.onObservation?.({ state, attempt: this.attempts, ...(error === undefined ? {} : { error }) });
  }
}

/**
 * Create a peer connection with ICE servers.
 */
function createPeerConnection(iceServers?: RTCIceServer[]): RTCPeerConnection {
  const config: RTCConfiguration = {
    iceServers: iceServers ?? [
      { urls: "stun:stun.l.google.com:19302" },
    ],
  };
  return new RTCPeerConnection(config);
}
