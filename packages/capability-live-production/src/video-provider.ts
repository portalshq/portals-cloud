/**
 * Video Provider Abstraction
 *
 * Deep module: small interface, deep implementation.
 * The interface is the seam between Interaction Orchestrator and video generation providers.
 * Adapters implement this interface for different providers (FAL, Reactor, OpenRouter, etc.).
 *
 * Design principles:
 * - Small interface (4 methods)
 * - Deep implementation (provider-specific complexity hidden)
 * - Clean seam (testable through interface)
 * - Accept dependencies (no internal instantiation)
 * - Return results (no side effects)
 */

/**
 * Session configuration for starting a video production session.
 */
export interface VideoSessionConfig {
  /** Channel/world identifier */
  channelId: string;
  /** Provider-specific configuration */
  providerConfig: ProviderConfig;
  /** Session metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Provider-specific configuration.
 * Each adapter defines its own config shape.
 */
export type ProviderConfig =
  | ReactorProviderConfig
  | FalProviderConfig
  | OpenRouterProviderConfig;

/**
 * Reactor provider configuration.
 */
export interface ReactorProviderConfig {
  type: "reactor";
  /** Reactor model name */
  modelName: string;
  /** Reactor API key */
  apiKey: string;
  /** Reactor API URL */
  apiUrl?: string;
  /** Maximum session duration in seconds */
  maxSessionDurationSeconds?: number;
  /** Session ID to adopt (optional - creates new session if not provided) */
  sessionId?: string;
}

/**
 * FAL provider configuration.
 */
export interface FalProviderConfig {
  type: "fal";
  /** FAL model name */
  modelName: string;
  /** FAL API key */
  apiKey: string;
  /** FAL queue name for HLS output */
  queueName?: string;
}

/**
 * OpenRouter provider configuration.
 */
export interface OpenRouterProviderConfig {
  type: "openrouter";
  /** OpenRouter model name */
  modelName: string;
  /** OpenRouter API key */
  apiKey: string;
}

/**
 * Session handle returned by startSession.
 * Identifies a running production session.
 */
export interface VideoSessionHandle {
  /** Unique session identifier */
  sessionId: string;
  /** Provider type */
  providerType: ProviderConfig["type"];
  /** Session metadata */
  metadata: Record<string, unknown>;
  /** Provider-specific data (opaque to caller) */
  providerData: Record<string, unknown>;
}

/**
 * Interaction/command to send to a video session.
 */
export interface VideoInteraction {
  /** Interaction type (prompt, command, mutation, etc.) */
  type: InteractionType;
  /** Interaction payload */
  payload: InteractionPayload;
  /** Interaction metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Interaction type.
 */
export type InteractionType =
  | "prompt"
  | "command"
  | "mutation"
  | "vote"
  | "branch";

/**
 * Interaction payload based on type.
 */
export type InteractionPayload =
  | PromptPayload
  | CommandPayload
  | MutationPayload
  | VotePayload
  | BranchPayload;

/**
 * Prompt interaction payload (text-to-video).
 */
export interface PromptPayload {
  type: "prompt";
  /** Text prompt for video generation */
  prompt: string;
  /** Generation parameters */
  params?: {
    duration?: number;
    aspectRatio?: string;
    [key: string]: unknown;
  };
}

/**
 * Command interaction payload (direct command to model).
 */
export interface CommandPayload {
  type: "command";
  /** Command name */
  command: string;
  /** Command parameters */
  params: Record<string, unknown>;
}

/**
 * Mutation interaction payload (modify existing content).
 */
export interface MutationPayload {
  type: "mutation";
  /** Target identifier */
  targetId: string;
  /** Mutation parameters */
  params: Record<string, unknown>;
}

/**
 * Vote interaction payload (voting mechanism).
 */
export interface VotePayload {
  type: "vote";
  /** Vote target */
  targetId: string;
  /** Vote value */
  value: number;
}

/**
 * Branch interaction payload (narrative branching).
 */
export interface BranchPayload {
  type: "branch";
  /** Branch identifier */
  branchId: string;
  /** Branch parameters */
  params?: Record<string, unknown>;
}

/**
 * Session status.
 */
export interface VideoSessionStatus {
  /** Session identifier */
  sessionId: string;
  /** Current state */
  state: SessionState;
  /** State transition timestamp */
  stateSince: Date;
  /** Provider-specific status */
  providerStatus?: Record<string, unknown>;
}

/**
 * Session state.
 */
export type SessionState =
  | "initializing"
  | "ready"
  | "processing"
  | "error"
  | "stopped";

/**
 * Video Provider Interface.
 *
 * Deep module: small interface (4 methods), deep implementation (provider-specific complexity).
 * This is the seam between Interaction Orchestrator and video generation providers.
 *
 * Invariants:
 * - startSession returns a handle that can be used with other methods
 * - sendInteraction throws if session is not in ready state
 * - stopSession is idempotent (safe to call multiple times)
 * - getSessionStatus returns current state of session
 * - getVideoBuffer returns video data for HTTP-based providers (throws for stream-based providers)
 *
 * Error modes:
 * - startSession: throws if provider config is invalid or provider is unavailable
 * - sendInteraction: throws if session not found, not ready, or interaction invalid
 * - stopSession: throws if session not found
 * - getSessionStatus: throws if session not found
 * - getVideoBuffer: throws if session not found, video not ready, or provider doesn't support buffer retrieval
 *
 * Performance characteristics:
 * - startSession: may take 1-10 seconds (provider session initialization)
 * - sendInteraction: typically < 1 second (command submission)
 * - stopSession: typically < 1 second (session cleanup)
 * - getSessionStatus: typically < 100ms (status query)
 * - getVideoBuffer: varies by provider (instant if cached, otherwise full generation time)
 */
export interface VideoProvider {
  /**
   * Start a video production session.
   *
   * Creates a new session with the provider or adopts an existing session.
   * Returns a handle that identifies the session for subsequent calls.
   *
   * @param config - Session configuration
   * @returns Session handle
   * @throws if provider config is invalid or provider is unavailable
   */
  startSession(config: VideoSessionConfig): Promise<VideoSessionHandle>;

  /**
   * Send an interaction/command to a video session.
   *
   * Submits an interaction to the active session.
   * The provider handles interaction-specific logic (prompt generation, command execution, etc.).
   *
   * @param sessionId - Session identifier from startSession
   * @param interaction - Interaction to send
   * @throws if session not found, not ready, or interaction invalid
   */
  sendInteraction(sessionId: string, interaction: VideoInteraction): Promise<void>;

  /**
   * Stop a video production session.
   *
   * Gracefully stops the session and releases resources.
   * Idempotent: safe to call multiple times.
   *
   * @param sessionId - Session identifier from startSession
   * @throws if session not found
   */
  stopSession(sessionId: string): Promise<void>;

  /**
   * Get the status of a video session.
   *
   * Returns the current state and provider-specific status information.
   *
   * @param sessionId - Session identifier from startSession
   * @returns Session status
   * @throws if session not found
   */
  getSessionStatus(sessionId: string): Promise<VideoSessionStatus>;

  /**
   * Get the video buffer for a session (HTTP-based providers only).
   *
   * Returns the generated video as a buffer for providers that support it (e.g., FAL).
   * Stream-based providers (e.g., Reactor WebRTC) throw an error since they don't produce buffers.
   *
   * @param sessionId - Session identifier from startSession
   * @returns Video buffer
   * @throws if session not found, video not ready, or provider doesn't support buffer retrieval
   */
  getVideoBuffer?(sessionId: string): Promise<Buffer>;
}

/**
 * Factory function to create a VideoProvider adapter.
 *
 * Returns the appropriate adapter based on provider config type.
 *
 * @param providerConfig - Provider configuration
 * @returns VideoProvider adapter
 */
export function createVideoProvider(providerConfig: ProviderConfig): VideoProvider {
  switch (providerConfig.type) {
    case "reactor":
      return new ReactorVideoProvider(providerConfig);
    case "fal":
      return new FalVideoProvider(providerConfig);
    case "openrouter":
      return new OpenRouterVideoProvider(providerConfig);
    default:
      throw new Error(`Unknown provider type: ${(providerConfig as ProviderConfig).type}`);
  }
}

/**
 * Reactor Video Provider Adapter.
 *
 * Implements VideoProvider interface for Reactor.
 * Handles Reactor WebRTC sessions, token minting, and command sending.
 *
 * Deep implementation hidden behind small interface.
 */
class ReactorVideoProvider implements VideoProvider {
  private readonly config: ReactorProviderConfig;
  private readonly sessions = new Map<string, ReactorSessionData>();

  constructor(config: ReactorProviderConfig) {
    this.config = config;
  }

  async startSession(config: VideoSessionConfig): Promise<VideoSessionHandle> {
    if (config.providerConfig.type !== "reactor") {
      throw new Error("Provider config type mismatch");
    }

    const providerConfig = config.providerConfig;
    const apiUrl = providerConfig.apiUrl ?? "https://api.reactor.inc";

    // Mint token for session
    const token = await this.mintToken(apiUrl, providerConfig);

    // Get or create session ID
    const sessionId = providerConfig.sessionId ?? this.generateSessionId();

    // Store session data
    const sessionData: ReactorSessionData = {
      sessionId,
      token,
      apiUrl,
      modelName: providerConfig.modelName,
      state: "ready",
      stateSince: new Date(),
      metadata: config.metadata ?? {},
    };
    this.sessions.set(sessionId, sessionData);

    return {
      sessionId,
      providerType: "reactor",
      metadata: config.metadata ?? {},
      providerData: { token, apiUrl },
    };
  }

  async sendInteraction(sessionId: string, interaction: VideoInteraction): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (session.state !== "ready") {
      throw new Error(`Session not ready: ${sessionId} (state: ${session.state})`);
    }

    // Send interaction to Reactor based on type
    if (interaction.type === "command") {
      const payload = interaction.payload as CommandPayload;
      await this.sendCommand(session, payload.command, payload.params);
    } else if (interaction.type === "prompt") {
      const payload = interaction.payload as PromptPayload;
      await this.sendCommand(session, "set_prompt", { prompt: payload.prompt, ...payload.params });
    } else {
      throw new Error(`Unsupported interaction type for Reactor: ${interaction.type}`);
    }
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Update session state
    session.state = "stopped";
    session.stateSince = new Date();

    // Remove from sessions map
    this.sessions.delete(sessionId);
  }

  async getSessionStatus(sessionId: string): Promise<VideoSessionStatus> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return {
      sessionId,
      state: session.state,
      stateSince: session.stateSince,
      providerStatus: {
        modelName: session.modelName,
      },
    };
  }

  private async mintToken(apiUrl: string, providerConfig: ReactorProviderConfig): Promise<string> {
    const response = await fetch(`${apiUrl}/tokens`, {
      method: "POST",
      headers: {
        "Reactor-API-Key": providerConfig.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        authorization_details: [
          {
            type: "session",
            resources: {
              models: { match: [providerConfig.modelName] },
              ...(providerConfig.sessionId
                ? { sessions: { bind: [providerConfig.sessionId] } }
                : {}
              ),
            },
            constraints: {
              max_sessions: 1,
              max_session_duration_seconds: providerConfig.maxSessionDurationSeconds ?? 3600,
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Reactor token minting failed: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json() as { jwt: string };
    return data.jwt;
  }

  private async sendCommand(session: ReactorSessionData, command: string, params: Record<string, unknown>): Promise<void> {
    // In production, this would call Reactor's command API
    // For now, we log the command (placeholder)
    console.log(`[ReactorVideoProvider] Sending command to session ${session.sessionId}:`, command, params);
    // TODO: Implement actual Reactor command API call
  }

  private generateSessionId(): string {
    return `reactor_session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}

/**
 * Reactor session data (internal to adapter).
 */
interface ReactorSessionData {
  sessionId: string;
  token: string;
  apiUrl: string;
  modelName: string;
  state: SessionState;
  stateSince: Date;
  metadata: Record<string, unknown>;
}

/**
 * FAL Video Provider Adapter.
 *
 * Implements VideoProvider interface for FAL.
 * Handles FAL HTTP calls and HLS staging.
 *
 * Deep implementation hidden behind small interface.
 */
class FalVideoProvider implements VideoProvider {
  private readonly config: FalProviderConfig;
  private readonly sessions = new Map<string, FalSessionData>();

  constructor(config: FalProviderConfig) {
    this.config = config;
  }

  async startSession(config: VideoSessionConfig): Promise<VideoSessionHandle> {
    if (config.providerConfig.type !== "fal") {
      throw new Error("Provider config type mismatch");
    }

    const sessionId = this.generateSessionId();

    const sessionData: FalSessionData = {
      sessionId,
      modelName: this.config.modelName,
      apiKey: this.config.apiKey,
      queueName: this.config.queueName,
      state: "ready",
      stateSince: new Date(),
      metadata: config.metadata ?? {},
    };
    this.sessions.set(sessionId, sessionData);

    return {
      sessionId,
      providerType: "fal",
      metadata: config.metadata ?? {},
      providerData: { modelName: this.config.modelName },
    };
  }

  async sendInteraction(sessionId: string, interaction: VideoInteraction): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (session.state !== "ready") {
      throw new Error(`Session not ready: ${sessionId} (state: ${session.state})`);
    }

    // Send interaction to FAL based on type
    if (interaction.type === "prompt") {
      const payload = interaction.payload as PromptPayload;
      await this.sendPrompt(session, payload.prompt, payload.params);
    } else {
      throw new Error(`Unsupported interaction type for FAL: ${interaction.type}`);
    }
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.state = "stopped";
    session.stateSince = new Date();
    this.sessions.delete(sessionId);
  }

  async getSessionStatus(sessionId: string): Promise<VideoSessionStatus> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return {
      sessionId,
      state: session.state,
      stateSince: session.stateSince,
      providerStatus: {
        modelName: session.modelName,
        hasVideo: Boolean(session.videoBuffer),
      },
    };
  }

  async getVideoBuffer(sessionId: string): Promise<Buffer> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (!session.videoBuffer) {
      throw new Error(`Video not ready for session: ${sessionId}`);
    }
    return session.videoBuffer;
  }

  private async sendPrompt(session: FalSessionData, prompt: string, params?: Record<string, unknown>): Promise<void> {
    // FAL uses HTTP API via @fal-ai/client (optional peer dependency)
    const { fal } = await import("@fal-ai/client");
    fal.config({ credentials: session.apiKey });

    const input: Record<string, unknown> = {
      prompt,
      aspect_ratio: params?.aspectRatio ?? "16:9",
      duration: params?.duration ?? 8,
      generate_audio: false,
    };

    const result = await fal.subscribe(session.modelName, { input });
    const url = (result.data as { video?: { url?: string }; video_url?: string } | undefined)?.video?.url ??
      (result.data as { video_url?: string } | undefined)?.video_url;

    if (!url) {
      throw new Error("FAL video generation returned no video URL");
    }

    // Download video and store in session data for later retrieval
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`FAL video download failed with HTTP ${response.status}`);
    }
    const videoBuffer = Buffer.from(await response.arrayBuffer());
    session.videoBuffer = videoBuffer;
    session.videoUrl = url;
  }

  private generateSessionId(): string {
    return `fal_session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}

/**
 * FAL session data (internal to adapter).
 */
interface FalSessionData {
  sessionId: string;
  modelName: string;
  apiKey: string;
  queueName?: string;
  state: SessionState;
  stateSince: Date;
  metadata: Record<string, unknown>;
  videoBuffer?: Buffer;
  videoUrl?: string;
}

/**
 * OpenRouter Video Provider Adapter.
 *
 * Implements VideoProvider interface for OpenRouter.
 * Handles OpenRouter text generation API calls.
 *
 * Deep implementation hidden behind small interface.
 */
class OpenRouterVideoProvider implements VideoProvider {
  private readonly config: OpenRouterProviderConfig;
  private readonly sessions = new Map<string, OpenRouterSessionData>();

  constructor(config: OpenRouterProviderConfig) {
    this.config = config;
  }

  async startSession(config: VideoSessionConfig): Promise<VideoSessionHandle> {
    if (config.providerConfig.type !== "openrouter") {
      throw new Error("Provider config type mismatch");
    }

    const sessionId = this.generateSessionId();

    const sessionData: OpenRouterSessionData = {
      sessionId,
      modelName: this.config.modelName,
      apiKey: this.config.apiKey,
      state: "ready",
      stateSince: new Date(),
      metadata: config.metadata ?? {},
    };
    this.sessions.set(sessionId, sessionData);

    return {
      sessionId,
      providerType: "openrouter",
      metadata: config.metadata ?? {},
      providerData: { modelName: this.config.modelName },
    };
  }

  async sendInteraction(sessionId: string, interaction: VideoInteraction): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (session.state !== "ready") {
      throw new Error(`Session not ready: ${sessionId} (state: ${session.state})`);
    }

    // Send interaction to OpenRouter based on type
    if (interaction.type === "prompt") {
      const payload = interaction.payload as PromptPayload;
      await this.sendPrompt(session, payload.prompt);
    } else {
      throw new Error(`Unsupported interaction type for OpenRouter: ${interaction.type}`);
    }
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.state = "stopped";
    session.stateSince = new Date();
    this.sessions.delete(sessionId);
  }

  async getSessionStatus(sessionId: string): Promise<VideoSessionStatus> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return {
      sessionId,
      state: session.state,
      stateSince: session.stateSince,
      providerStatus: {
        modelName: session.modelName,
      },
    };
  }

  private async sendPrompt(session: OpenRouterSessionData, prompt: string): Promise<void> {
    // In production, this would call OpenRouter's API
    console.log(`[OpenRouterVideoProvider] Sending prompt to session ${session.sessionId}:`, prompt);
    // TODO: Implement actual OpenRouter API call
  }

  private generateSessionId(): string {
    return `openrouter_session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}

/**
 * OpenRouter session data (internal to adapter).
 */
interface OpenRouterSessionData {
  sessionId: string;
  modelName: string;
  apiKey: string;
  state: SessionState;
  stateSince: Date;
  metadata: Record<string, unknown>;
}
