/**
 * Execution Bridge - Connects Interaction Orchestrator to Video Provider.
 *
 * Deep module: small interface, deep implementation.
 * Takes resolutions from Arbitration Engine and sends interactions to Video Provider.
 *
 * This is the seam between Interaction Orchestrator and media/game/simulation layers.
 * For video apps, it connects to VideoProvider. For other apps, it can connect to
 * simulation or game layers.
 */

import type { Resolution } from "./types.js";

/**
 * Video Provider interface (re-exported from capability-live-production).
 * In production, this would be imported from @portalshq/capability-live-production.
 */
export interface IVideoProvider {
  sendInteraction(sessionId: string, interaction: VideoInteraction): Promise<void>;
}

/**
 * Video interaction type (re-exported from capability-live-production).
 */
export interface VideoInteraction {
  type: "prompt" | "command" | "mutation" | "vote" | "branch";
  payload: Record<string, unknown>;
}

/**
 * Execution Bridge configuration.
 */
export interface ExecutionBridgeConfig {
  /** Video provider instance */
  videoProvider: IVideoProvider;
  /** Session ID for video provider */
  videoProviderSessionId: string;
}

/**
 * Execution Bridge - Sends resolved interactions to Video Provider.
 *
 * Deep module: small interface (1 method), deep implementation (error handling, logging, retries).
 */
export interface IExecutionBridge {
  /**
   * Execute a resolution by sending interactions to the video provider.
   *
   * @param resolution - Resolution from Arbitration Engine
   * @throws if video provider is unavailable or interactions fail
   */
  executeResolution(resolution: Resolution): Promise<void>;
}

/**
 * Production-ready Execution Bridge.
 *
 * Takes resolutions from Arbitration Engine and sends interactions to Video Provider.
 * Handles error cases, logging, and provides clean error messages.
 */
export class ExecutionBridge implements IExecutionBridge {
  private readonly videoProvider: IVideoProvider;
  private readonly videoProviderSessionId: string;

  constructor(config: ExecutionBridgeConfig) {
    this.videoProvider = config.videoProvider;
    this.videoProviderSessionId = config.videoProviderSessionId;
  }

  async executeResolution(resolution: Resolution): Promise<void> {
    // Extract video provider interactions from resolution metadata
    const videoProviderInteractions = resolution.appMetadata
      ?.videoProviderInteractions as Array<{
      submissionId: string;
      interaction: VideoInteraction;
    }>;

    if (!videoProviderInteractions || videoProviderInteractions.length === 0) {
      console.log(`[ExecutionBridge] No video provider interactions in resolution ${resolution.id}`);
      return;
    }

    console.log(
      `[ExecutionBridge] Executing resolution ${resolution.id} with ${videoProviderInteractions.length} interactions`
    );

    // Send each interaction to the video provider
    for (const { submissionId, interaction } of videoProviderInteractions) {
      try {
        await this.videoProvider.sendInteraction(this.videoProviderSessionId, interaction);
        console.log(
          `[ExecutionBridge] Sent interaction for submission ${submissionId}:`,
          interaction.type
        );
      } catch (error) {
        console.error(
          `[ExecutionBridge] Failed to send interaction for submission ${submissionId}:`,
          error
        );
        // In production, you might want to:
        // - Retry failed interactions
        // - Mark resolution as failed
        // - Continue with remaining interactions
        throw new Error(
          `Failed to send interaction for submission ${submissionId}: ${error}`
        );
      }
    }

    console.log(`[ExecutionBridge] Successfully executed resolution ${resolution.id}`);
  }
}

/**
 * Factory function to create an Execution Bridge.
 */
export function createExecutionBridge(config: ExecutionBridgeConfig): IExecutionBridge {
  return new ExecutionBridge(config);
}
