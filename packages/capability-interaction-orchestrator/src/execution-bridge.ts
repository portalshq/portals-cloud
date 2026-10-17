import type { Resolution } from "./types.js";
import { InteractionError, record, text } from "./validation.js";

/** An execution adapter must deduplicate by idempotencyKey before applying an interaction. */
export interface IVideoProvider {
  sendInteraction(
    sessionId: string,
    interaction: VideoInteraction,
    options: { idempotencyKey: string }
  ): Promise<void>;
}
export interface VideoInteraction {
  type: "prompt" | "command" | "mutation" | "vote" | "branch";
  payload: Record<string, unknown>;
}
export interface ExecutionBridgeConfig {
  videoProvider: IVideoProvider;
  videoProviderSessionId: string;
  /** Parallel branches require separate sessions, created idempotently by the execution adapter. */
  sessionForBranch?: (branchId: string) => Promise<string>;
}
export interface IExecutionBridge {
  executeResolution(resolution: Resolution): Promise<void>;
}
export class ExecutionBridge implements IExecutionBridge {
  constructor(private readonly config: ExecutionBridgeConfig) {
    text(config.videoProviderSessionId, "videoProviderSessionId");
  }
  async executeResolution(resolution: Resolution): Promise<void> {
    if (resolution.status !== "executing")
      throw new InteractionError(
        "INVALID_STATE",
        "Prepare the resolution before executing"
      );
    const values = resolution.appMetadata.videoProviderInteractions;
    if (
      !Array.isArray(values) ||
      values.length !== resolution.selectedSubmissionIds.length
    )
      throw new InteractionError(
        "INVALID_INPUT",
        "Resolution must contain an interaction for every selected submission"
      );
    const seen = new Set<string>();
    const interactions = values.map((value) => {
      record(value, "execution entry");
      text(value.submissionId, "submissionId");
      record(value.interaction, "interaction");
      record(value.interaction.payload, "interaction payload");
      if (
        !["prompt", "command", "mutation", "vote", "branch"].includes(
          String(value.interaction.type)
        ) ||
        !resolution.selectedSubmissionIds.includes(value.submissionId) ||
        seen.has(value.submissionId)
      )
        throw new InteractionError(
          "INVALID_INPUT",
          "Invalid execution interaction"
        );
      seen.add(value.submissionId);
      if (value.branchId !== undefined) {
        text(value.branchId, "branchId");
        if (!this.config.sessionForBranch)
          throw new InteractionError(
            "INVALID_INPUT",
            "Parallel branches require sessionForBranch"
          );
      }
      return {
        submissionId: value.submissionId,
        interaction: value.interaction as unknown as VideoInteraction,
        branchId: value.branchId as string | undefined,
      };
    });
    for (const value of interactions) {
      const sessionId = value.branchId
        ? await this.config.sessionForBranch!(value.branchId)
        : this.config.videoProviderSessionId;
      text(sessionId, "execution session");
      await this.config.videoProvider.sendInteraction(
        sessionId,
        value.interaction,
        { idempotencyKey: `interaction:${resolution.id}:${value.submissionId}` }
      );
    }
  }
}
export function createExecutionBridge(
  config: ExecutionBridgeConfig
): IExecutionBridge {
  return new ExecutionBridge(config);
}
