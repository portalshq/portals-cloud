import type { Identity, Observation, Sink } from "../index.js";

/** Classifies a sink failure so the connector can separate retryable transport
 *  problems from permanent rejections without inspecting message text. */
export class SegmentDeliveryError extends Error {
  constructor(
    message: string,
    readonly options: { status?: number; retryable: boolean; category: "transient" | "rate_limited" | "rejected" },
  ) {
    super(message);
    this.name = "SegmentDeliveryError";
  }
}

/** Inject a wrapper around the Segment SDK; no provider package is loaded implicitly. */
export interface SegmentTransport {
  track(message: { messageId: string; event: string; timestamp: string; anonymousId?: string; userId?: string; properties: Record<string, unknown> }): Promise<void>;
  identify(message: { anonymousId?: string; userId: string }): Promise<void>;
  reset?(): void | Promise<void>;
}
export function createSegmentSink(transport: SegmentTransport, serverIdentity?: Identity): Sink {
  return {
    async send(events: readonly Observation[]) {
      for (const event of events) {
        const identity = event.identity ?? serverIdentity;
        if (!identity?.anonymousId && !identity?.userId) throw new Error("Segment requires an anonymousId or userId");
        await transport.track({ messageId: event.id, event: event.name, timestamp: event.occurredAt, ...identity,
          properties: {...event.properties, portals_event_id: event.id, portals_schema_version: event.version, portals_provenance: event.provenance,
            ...(event.attribution ? {portals_tenant_id: event.attribution.tenantId, portals_app_id: event.attribution.appId} : {})} });
      }
    },
    async identify(identity) {
      if (!identity.userId) throw new Error("Identify requires userId");
      await transport.identify({ anonymousId: identity.anonymousId, userId: identity.userId });
    },
    reset: () => transport.reset?.(),
  };
}

/** Segment HTTP tracking transport. Use an appropriately scoped source write key. */
export function createSegmentHttpTransport(options: { writeKey: string; fetch?: typeof fetch; endpoint?: string; timeoutMs?: number }): SegmentTransport {
  if (!options.writeKey || !/^[A-Za-z0-9_-]+$/.test(options.writeKey)) throw new Error("Invalid Segment write key");
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) throw new Error("Invalid Segment request timeout");
  const endpoint = new URL(options.endpoint ?? "https://api.segment.io");
  if (endpoint.protocol !== "https:") throw new Error("Segment endpoint must use HTTPS");
  const send = async (path: string, body: object) => {
    let response: Response;
    try {
      response = await (options.fetch ?? fetch)(new URL(path, endpoint), {
        method: "POST", headers: {"Content-Type": "application/json", Authorization: `Basic ${btoa(`${options.writeKey}:`)}`}, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      // Timeouts and network failures are retryable; no status was received.
      throw new SegmentDeliveryError("Segment request failed", { retryable: true, category: "transient" });
    }
    if (!response.ok) {
      const rateLimited = response.status === 429;
      const retryable = rateLimited || response.status >= 500;
      throw new SegmentDeliveryError(`Segment ingestion failed (${response.status})`, {
        status: response.status, retryable, category: rateLimited ? "rate_limited" : retryable ? "transient" : "rejected",
      });
    }
  };
  return {track: message => send("/v1/track", message), identify: message => send("/v1/identify", message)};
}
