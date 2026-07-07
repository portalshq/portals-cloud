/**
 * Every billable event type the platform emits. These are the raw events
 * OpenMeter aggregates into the billable meters Lago prices against.
 *
 * Emit granularly here — OpenMeter can aggregate upward cheaply. You cannot
 * recover lost granularity later without a backfill.
 *
 * CloudEvents format (CNCF spec) is used throughout because OpenMeter's
 * HTTP ingest endpoint expects it, and because it gives every event a
 * standard id/time/source/type envelope for deduplication and audit.
 */
export type MeteringEventType =
  | "capability.invoked"        // one per capability call — drives compute tax (#8)
  | "session.started"           // session open → billing meter start
  | "session.ended"             // session close → billing meter stop, final tally
  | "viewer.joined"             // concurrent viewer count → live event pricing (#3)
  | "viewer.left"               // concurrent viewer count delta
  | "storage.written"           // world/narrative state bytes written → persistence billing (#5)
  | "storage.read"              // retrieval billing (character memory, timeline queries)
  | "marketplace.transaction"   // capability purchase → rake calculation (#1)
  | "royalty.event"             // derivative/remix attribution event → royalty flow (#4)
  | "identity.api.call";        // audience graph API call → identity tier billing (#7)

export interface MeteringEvent {
  /** Globally unique — used by OpenMeter for idempotent deduplication. */
  id: string;
  type: MeteringEventType;
  /** ISO 8601. OpenMeter uses this for tumbling-window aggregation. */
  time: string;
  /** Billing subject: tenantId, channelId, or userId depending on who's being billed. */
  subject: string;
  source: "portals-platform/runtime-core";
  data: Record<string, unknown>;
}

/** Convenience builders so runtime-core doesn't hand-roll the envelope. */
export const MeteringEvents = {
  capabilityInvoked(params: {
    subject: string;
    capabilityId: string;
    sessionId: string;
    channelId: string;
    durationMs?: number;
  }): MeteringEvent {
    return {
      id: crypto.randomUUID(),
      type: "capability.invoked",
      time: new Date().toISOString(),
      source: "portals-platform/runtime-core",
      subject: params.subject,
      data: {
        capabilityId: params.capabilityId,
        sessionId: params.sessionId,
        channelId: params.channelId,
        durationMs: params.durationMs ?? 0,
      },
    };
  },

  sessionStarted(params: { subject: string; sessionId: string; channelId: string }): MeteringEvent {
    return {
      id: crypto.randomUUID(),
      type: "session.started",
      time: new Date().toISOString(),
      source: "portals-platform/runtime-core",
      subject: params.subject,
      data: { sessionId: params.sessionId, channelId: params.channelId },
    };
  },

  sessionEnded(params: {
    subject: string;
    sessionId: string;
    channelId: string;
    durationSeconds: number;
    peakConcurrentViewers: number;
  }): MeteringEvent {
    return {
      id: crypto.randomUUID(),
      type: "session.ended",
      time: new Date().toISOString(),
      source: "portals-platform/runtime-core",
      subject: params.subject,
      data: {
        sessionId: params.sessionId,
        channelId: params.channelId,
        durationSeconds: params.durationSeconds,
        peakConcurrentViewers: params.peakConcurrentViewers,
      },
    };
  },

  viewerJoined(params: { subject: string; sessionId: string; viewerId: string }): MeteringEvent {
    return {
      id: crypto.randomUUID(),
      type: "viewer.joined",
      time: new Date().toISOString(),
      source: "portals-platform/runtime-core",
      subject: params.subject,
      data: { sessionId: params.sessionId, viewerId: params.viewerId },
    };
  },

  viewerLeft(params: { subject: string; sessionId: string; viewerId: string }): MeteringEvent {
    return {
      id: crypto.randomUUID(),
      type: "viewer.left",
      time: new Date().toISOString(),
      source: "portals-platform/runtime-core",
      subject: params.subject,
      data: { sessionId: params.sessionId, viewerId: params.viewerId },
    };
  },

  storageWritten(params: { subject: string; worldId: string; bytes: number }): MeteringEvent {
    return {
      id: crypto.randomUUID(),
      type: "storage.written",
      time: new Date().toISOString(),
      source: "portals-platform/runtime-core",
      subject: params.subject,
      data: { worldId: params.worldId, bytes: params.bytes },
    };
  },

  marketplaceTransaction(params: {
    subject: string;
    capabilityId: string;
    providerId: string;
    grossAmountCents: number;
    currency: string;
  }): MeteringEvent {
    return {
      id: crypto.randomUUID(),
      type: "marketplace.transaction",
      time: new Date().toISOString(),
      source: "portals-platform/runtime-core",
      subject: params.subject,
      data: params,
    };
  },
};
