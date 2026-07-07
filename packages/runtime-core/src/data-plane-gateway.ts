/**
 * Data plane. Everything that's actually bytes-on-the-wire to an audience —
 * chat fan-out, poll votes, video frames — goes through here, not through
 * the orchestrator. Designed to scale independently of control-plane load:
 * concurrent audience size, not channel count, drives this plane's cost.
 *
 * TODO: back this with the realtime-fanout capability's pub/sub bus
 * (see packages/capabilities/realtime-fanout) rather than implementing
 * transport here directly — this class should stay a thin gateway.
 */
export class DataPlaneGateway {
  async publish(sessionId: string, channel: string, payload: unknown): Promise<void> {
    throw new Error("DataPlaneGateway.publish: wire to realtime-fanout capability");
  }

  async subscribe(sessionId: string, channel: string, onMessage: (payload: unknown) => void): Promise<() => void> {
    throw new Error("DataPlaneGateway.subscribe: wire to realtime-fanout capability");
  }
}
