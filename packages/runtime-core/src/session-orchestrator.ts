import { ChannelManifest } from "@portals/contracts";
import { CapabilityRegistry } from "@portals/registry";
import { MeteringClient, MeteringEvents } from "@portals/billing-metering";

/**
 * Control plane session orchestrator — now instrumented with billing
 * metering hooks. The metering calls are fire-and-forget (MeteringClient
 * never throws) so billing failures cannot block session lifecycle.
 *
 * The metering subject for developer billing is the channel's owner
 * (tenantId). A future per-audience billing surface would use the
 * audience member's userId as subject — that's a separate meter.
 */
export class SessionOrchestrator {
  private metering: MeteringClient;

  constructor(
    private registry: CapabilityRegistry,
    meteringClient?: MeteringClient,
  ) {
    this.metering = meteringClient ?? new MeteringClient();
  }

  async startSession(manifest: ChannelManifest): Promise<{ sessionId: string }> {
    const sessionId = crypto.randomUUID();
    const tenantId = manifest.metadata.owner;

    // Fail fast: validate all capability refs resolve before starting
    for (const ref of manifest.spec.capabilities) {
      this.registry.resolve(ref.capabilityId, ref.version);
    }

    // Billing meter: session start (async, non-blocking)
    void this.metering.emit(
      MeteringEvents.sessionStarted({
        subject: tenantId,
        sessionId,
        channelId: manifest.metadata.name,
      }),
    );

    // TODO: persist session record to world store, emit session-started
    // event to data-plane gateway, begin lazy-start billing meter.

    return { sessionId };
  }

  /**
   * Called on session close. The session-ended event carries
   * durationSeconds and peakConcurrentViewers — these are the
   * two key metrics that drive compute-tax and live-event billing.
   */
  async endSession(
    sessionId: string,
    tenantId: string,
    channelId: string,
    durationSeconds: number,
    peakConcurrentViewers: number,
  ): Promise<void> {
    // Billing meter: session end with final metrics (async, non-blocking)
    void this.metering.emit(
      MeteringEvents.sessionEnded({
        subject: tenantId,
        sessionId,
        channelId,
        durationSeconds,
        peakConcurrentViewers,
      }),
    );

    // TODO: tear down lazy-started capability instances, stop billing meter,
    // flush session state to world store.
  }

  /**
   * Thin wrapper over registry.resolve() that also emits a metering event
   * per capability invocation. Called by the data-plane gateway before
   * invoking any capability so the compute-tax meter has accurate call volume.
   */
  async invokeCapability<TInput, TOutput>(
    capabilityId: string,
    input: TInput,
    ctx: { sessionId: string; channelId: string; tenantId: string },
  ): Promise<TOutput> {
    const capability = this.registry.resolve(capabilityId);
    const start = Date.now();
    let result: TOutput;
    try {
      result = (await capability.invoke(input, {
        sessionId: ctx.sessionId,
        channelId: ctx.channelId,
        worldId: "",    // TODO: resolve from session record
        resolve: async () => { throw new Error("resolve: not yet wired"); },
      })) as TOutput;
    } finally {
      const durationMs = Date.now() - start;
      void this.metering.emit(
        MeteringEvents.capabilityInvoked({
          subject: ctx.tenantId,
          capabilityId,
          sessionId: ctx.sessionId,
          channelId: ctx.channelId,
          durationMs,
        }),
      );
    }
    return result!;
  }
}
