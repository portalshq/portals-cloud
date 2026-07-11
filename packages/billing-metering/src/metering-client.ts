import { MeteringEvent } from "./metering-events.js";

/**
 * Sends CloudEvents to OpenMeter's HTTP ingest endpoint.
 *
 * OpenMeter self-hosted runs in-cluster on LKE (see infra/k8s/base/openmeter.yaml).
 * The OPENMETER_ENDPOINT env var should point to the in-cluster service URL.
 *
 * Event delivery is fire-and-forget with a short timeout — metering failures
 * should never block capability invocations or session lifecycle. Log and
 * continue. OpenMeter has idempotent re-ingest via its backfill API if
 * events are dropped and need to be recovered from logs.
 *
 * High-throughput paths (1M+ events/sec from realtime-fanout concurrent viewer
 * events) should use the NATS → Redpanda Connect → OpenMeter Kafka bridge
 * instead of this HTTP client. See infra/k8s/base/benthos-bridge.yaml.
 * This client is for control-plane events (session lifecycle, capability
 * invocations) which are low-volume and latency-insensitive.
 */
export class MeteringClient {
  private endpoint: string;
  private timeoutMs: number;

  constructor(config?: { endpoint?: string; timeoutMs?: number }) {
    this.endpoint = config?.endpoint ?? process.env.OPENMETER_ENDPOINT ?? "http://openmeter.portals-platform.svc.cluster.local:8888";
    this.timeoutMs = config?.timeoutMs ?? 3000;
  }

  async emit(event: MeteringEvent): Promise<void> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      await fetch(`${this.endpoint}/api/v1/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/cloudevents+json",
          "specversion": "1.0",
        },
        body: JSON.stringify({
          specversion: "1.0",
          id: event.id,
          type: event.type,
          source: event.source,
          subject: event.subject,
          time: event.time,
          datacontenttype: "application/json",
          data: event.data,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch (err) {
      // Fire-and-forget — log, never throw
      console.error("[billing-metering] Failed to emit event", { type: event.type, id: event.id, err });
    }
  }

  /** Batch emit for high-volume paths. OpenMeter accepts arrays. */
  async emitBatch(events: MeteringEvent[]): Promise<void> {
    for (const event of events) {
      await this.emit(event); // TODO: replace with true batch POST once OpenMeter batch endpoint confirmed
    }
  }
}
