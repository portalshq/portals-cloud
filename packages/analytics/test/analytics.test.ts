import { describe, expect, it, vi } from "vitest";
import { Registry } from "../src/index.js";
import { ActivityWindow, AnalyticsClient } from "../src/browser.js";
import { createBrowserPrivacyPreference } from "../src/browser.js";
import { createExperienceRegistry, experienceEvents } from "../src/experience-events.js";
import { MediaEngagementTracker } from "../src/media.js";
import { mapBillingEvent } from "../src/adapters/monetization.js";
import { mapInteractionEvent } from "../src/adapters/interaction-orchestrator.js";
import { createSegmentHttpTransport, createSegmentSink } from "../src/adapters/segment.js";
import { replay } from "../src/server.js";

function registry() { const r = new Registry(); r.registerCustom({name: "custom.level", purpose: "level outcomes", version: 1, properties: {outcome: {type: "enum", values: ["won", "lost"]}}}); return r; }
describe("analytics", () => {
  it("records anonymously and links a verified identity without leaking it after reset", async () => {
    let saved: string | null = null;
    const storage = {get: () => saved, set: (id: string) => {saved = id}, clear: () => {saved = null}};
    const send = vi.fn().mockResolvedValue(undefined), identify = vi.fn().mockResolvedValue(undefined);
    const client = new AnalyticsClient({registry: registry(), sink: {send, identify}, storage});
    client.record("custom.level", {outcome: "won"}); const anonymousId = saved;
    await client.identify("user-1"); expect(identify).toHaveBeenCalledWith({anonymousId, userId: "user-1"});
    await client.reset(); client.record("custom.level", {outcome: "lost"}); await client.flush();
    expect(send.mock.calls[0][0][0].identity.userId).toBeUndefined(); expect(saved).not.toBe(anonymousId);
  });
  it("honors application suppression and rejects unknown properties and reserved names", async () => {
    let allowed = true; const send = vi.fn();
    const client = new AnalyticsClient({registry: registry(), sink: {send}, collectionAllowed: () => allowed});
    expect(() => client.record("billing.purchase_settled", {})).toThrow();
    expect(() => client.record("custom.level", {message: "private"})).toThrow();
    client.record("custom.level", {outcome: "won"}); allowed = false; await client.flush();
    expect(client.pending).toBe(0); expect(client.record("custom.level")).toBe(false); expect(send).not.toHaveBeenCalled();
  });
  it("clears queued events promptly when collection becomes disallowed", async () => {
    let allowed = true; const send = vi.fn(), reset = vi.fn();
    const client = new AnalyticsClient({registry: registry(), sink: {send, reset}, collectionAllowed: () => allowed});
    client.record("custom.level", {outcome: "won"}); expect(client.pending).toBe(1);
    allowed = false;
    // Recording, identifying or flushing after suppression clears immediately,
    // not only when a flush happens to be attempted.
    expect(client.record("custom.level", {outcome: "won"})).toBe(false);
    expect(client.pending).toBe(0);
    allowed = true; client.record("custom.level", {outcome: "lost"}); allowed = false;
    await client.identify("user-1"); expect(reset).toHaveBeenCalled(); expect(client.pending).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
  it("keeps stable ids when delivery fails", async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const client = new AnalyticsClient({registry: registry(), sink: {send}}); client.record("custom.level", {outcome: "won"});
    await expect(client.flush()).rejects.toThrow("offline"); await client.flush();
    expect(send.mock.calls[0][0][0].id).toBe(send.mock.calls[1][0][0].id);
  });
  it("maps Segment track and identify and preserves source IDs", async () => {
    const track = vi.fn().mockResolvedValue(undefined), identify = vi.fn().mockResolvedValue(undefined);
    const sink = createSegmentSink({track, identify});
    const client = new AnalyticsClient({registry: registry(), sink}); client.record("custom.level", {outcome: "won"});
    await client.identify("user-1"); await client.flush();
    expect(identify.mock.calls[0][0]).toMatchObject({userId: "user-1"});
    expect(track.mock.calls[0][0]).toMatchObject({event: "custom.level", properties: {outcome: "won", portals_provenance: "client"}});
    expect(track.mock.calls[0][0].properties.portals_event_id).toBe(track.mock.calls[0][0].messageId);
  });
  it("surfaces Segment errors", async () => {
    const fetch = vi.fn().mockResolvedValue({ok: false, status: 429});
    const transport = createSegmentHttpTransport({writeKey: "testkey", fetch});
    await expect(transport.identify({userId: "u"})).rejects.toThrow("429");
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe(`Basic ${btoa('testkey:')}`);
  });
  it("classifies Segment failures for connector retries without leaking credentials", async () => {
    const { SegmentDeliveryError } = await import("../src/adapters/segment.js");
    const rateLimited = createSegmentHttpTransport({writeKey: "k", fetch: vi.fn().mockResolvedValue({ok: false, status: 429})});
    const rejected = createSegmentHttpTransport({writeKey: "k", fetch: vi.fn().mockResolvedValue({ok: false, status: 400})});
    const down = createSegmentHttpTransport({writeKey: "k", fetch: vi.fn().mockRejectedValue(new Error("timeout"))});
    await expect(rateLimited.track({messageId: "m", event: "e", timestamp: "t", properties: {}})).rejects.toMatchObject({options: {retryable: true, category: "rate_limited"}});
    await expect(rejected.track({messageId: "m", event: "e", timestamp: "t", properties: {}})).rejects.toMatchObject({options: {retryable: false, category: "rejected"}});
    await expect(down.track({messageId: "m", event: "e", timestamp: "t", properties: {}})).rejects.toMatchObject({options: {retryable: true, category: "transient"}});
    const failure = await rateLimited.track({messageId: "m", event: "e", timestamp: "t", properties: {}}).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SegmentDeliveryError);
    expect((failure as Error).message).not.toContain("testkey");
  });
  it("replays known committed events and never forwards source payloads", async () => {
    const event = {id: "1", type: "billing.purchase_settled", createdAt: "2026-01-01T00:00:00Z", payload: {amount: 200, refundedAmount: 0, currency: "USD", buyerId: "secret"}};
    const send = vi.fn().mockResolvedValue(undefined);
    expect(await replay([event], mapBillingEvent, {send})).toEqual({sent: 1, skipped: 0});
    expect(send.mock.calls[0][0][0].properties).toEqual({amount: 200, refunded_amount: 0, currency: "usd"});
    expect(mapInteractionEvent({id: "2", eventType: "submission_created", occurredAt: "2026-01-01T00:00:00Z", data: {message: "private"}})?.properties).toEqual({});
  });
  it("stops replay on failure so callers can retry without acknowledging business records", async () => {
    const send = vi.fn().mockRejectedValue(new Error("down"));
    await expect(replay([{id: "2", eventType: "submission_created", occurredAt: "2026-01-01T00:00:00Z", data: {}}], mapInteractionEvent, {send})).rejects.toThrow("down");
  });
  it("measures active time and closes once", () => {
    let now = 0; const w = new ActivityWindow("a", () => now); now = 10; w.pause(); now = 30; w.resume(); now = 35;
    expect(w.end("completed")).toEqual({id: "a", elapsedMs: 35, activeMs: 15, reason: "completed"});
    expect(w.end("unknown").reason).toBe("completed");
  });
  it("supports optional allowlisted properties without accepting unknown data", () => {
    const r = createExperienceRegistry();
    expect(r.validate(experienceEvents.pageViewed, {surface: "standalone", route: "/", entry_source: "direct"}).name).toBe(experienceEvents.pageViewed);
    expect(() => r.validate(experienceEvents.pageViewed, {surface: "standalone", route: "/", entry_source: "direct", email: "private@example.com"})).toThrow("Invalid property");
  });
  it("honors persistent opt-out and Global Privacy Control", () => {
    const values = new Map<string, string>();
    let gpc = false;
    const preference = createBrowserPrivacyPreference({storage: {getItem: key => values.get(key) ?? null, setItem: (key, value) => {values.set(key, value)}, removeItem: key => {values.delete(key)}}, globalPrivacyControl: () => gpc});
    expect(preference.allowed()).toBe(true);
    preference.setOptOut(true); expect(preference.allowed()).toBe(false);
    preference.setOptOut(false); gpc = true; expect(preference.allowed()).toBe(false);
  });
  it("emits sparse active-view and completion milestones", () => {
    let now = 0;
    const record = vi.fn(() => true);
    const tracker = new MediaEngagementTracker({record}, {surface: "standalone", content_kind: "on_demand", player_kind: "hls"}, () => now);
    tracker.impression(); tracker.play(); now = 11_000; tracker.progress(25, 100); tracker.pause(); tracker.end("interrupted");
    const names = record.mock.calls.map(call => call[0]);
    expect(names).toContain(experienceEvents.mediaEngaged);
    expect(names).toContain(experienceEvents.mediaProgress);
    expect(names).toContain(experienceEvents.mediaEnded);
    expect(names.filter(name => name === experienceEvents.mediaProgress)).toHaveLength(1);
  });
});

it('uses the identity provider to link anonymous activity and applies trusted attribution to source events', async () => {
  const {identifyVerified, createSourceIntegration} = await import('../src/server.js')
  const identify = vi.fn().mockResolvedValue(undefined), send = vi.fn().mockResolvedValue(undefined)
  const sink = {identify, send}
  const provider = {getIdentity: vi.fn().mockResolvedValue({userId: 'verified-user', email: 'private@example.com'})}
  await identifyVerified(provider, 'token', 'anonymous-id', sink)
  expect(identify).toHaveBeenCalledWith({anonymousId: 'anonymous-id', userId: 'verified-user'})
  provider.getIdentity.mockRejectedValueOnce(new Error('unauthorized'))
  await expect(identifyVerified(provider, 'bad-token', 'anonymous-id', sink)).rejects.toThrow('unauthorized')
  expect(identify).toHaveBeenCalledTimes(1)
  const deliver = createSourceIntegration({map: mapBillingEvent, sink, attribution: {tenantId: 'tenant-1', appId: 'app-1'}})
  await deliver({id: '1', type: 'billing.purchase_settled', createdAt: '2026-01-01T00:00:00Z', payload: {amount: 100, refundedAmount: 0, currency: 'usd'}})
  expect(send.mock.calls[0][0][0].attribution).toEqual({tenantId: 'tenant-1', appId: 'app-1'})
})
