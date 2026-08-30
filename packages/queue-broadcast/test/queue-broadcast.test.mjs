import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  QueueBroadcastClient,
  QueueBroadcastError,
  normalizeBroadcastEndpoint,
} from "../dist/index.js";

const queuedJob = {
  id: "job-1",
  prompt: "",
  media_type: "video",
  duration: null,
  source_url: "https://assets.example/video.mp4",
  status: "queued",
  error: null,
  created_at: 1,
  updated_at: 1,
};

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("generated client remains aligned with the checked-in Streamer OpenAPI operations and job states", async () => {
  const contract = JSON.parse(await readFile(new URL("../../../../streamer/openapi.json", import.meta.url), "utf8"));
  const generated = await readFile(new URL("../src/generated/api.ts", import.meta.url), "utf8");
  for (const path of Object.values(contract.paths)) {
    for (const operation of Object.values(path)) {
      if (operation?.operationId) {
        assert.match(generated, new RegExp(`export const ${operation.operationId} = async`));
      }
    }
  }
  for (const status of contract.components.schemas.JobResponse.properties.status.enum) {
    assert.match(generated, new RegExp(`  ${status}: '${status}'`));
  }
});

test("normalizes endpoint identity and rejects secret-bearing identifiers", () => {
  assert.equal(normalizeBroadcastEndpoint("https://stream.example/queue/"), "https://stream.example/queue");
  for (const endpoint of [
    "ftp://stream.example",
    "https://token@stream.example",
    "https://stream.example/?token=secret",
    "https://stream.example/#route",
  ]) {
    assert.throws(() => normalizeBroadcastEndpoint(endpoint));
  }
});

test("enqueues with server token and idempotency header", async () => {
  let requested;
  const client = new QueueBroadcastClient({
    endpoint: "https://stream.example/",
    token: "server-secret",
    fetch: async (url, init) => {
      requested = { url, init };
      return jsonResponse(queuedJob);
    },
  });

  const job = await client.enqueueUrl({
    mediaType: "video",
    url: "https://assets.example/video.mp4?signature=allowed",
    idempotencyKey: "generation:1",
  });
  assert.equal(job.id, "job-1");
  assert.equal(requested.url, "https://stream.example/v1/queue");
  assert.equal(new Headers(requested.init.headers).get("authorization"), "Bearer server-secret");
  assert.equal(new Headers(requested.init.headers).get("idempotency-key"), "generation:1");
  assert.deepEqual(JSON.parse(requested.init.body), {
    media_type: "video",
    url: "https://assets.example/video.mp4?signature=allowed",
  });
});

test("maps typed API errors and resolves an HLS descriptor", async () => {
  const requests = [];
  const client = new QueueBroadcastClient({
    endpoint: "https://stream.example/control",
    token: "server-secret",
    fetch: async (url) => {
      requests.push(url);
      if (url.endsWith("/v1/queue/missing")) return jsonResponse({ detail: "job not found" }, 404);
      return jsonResponse({
        hls: "https://cdn.example/live/index.m3u8",
        destination_count: 0,
        format: {},
      });
    },
  });

  await assert.rejects(client.getJob("missing"), (error) => {
    assert.ok(error instanceof QueueBroadcastError);
    assert.equal(error.status, 404);
    assert.equal(error.detail, "job not found");
    return true;
  });
  const playback = await client.getPlayback();
  assert.deepEqual(playback, {
    sessionId: "https://stream.example/control",
    playbackManifestUrl: "https://cdn.example/live/index.m3u8",
  });
  assert.deepEqual(requests, [
    "https://stream.example/control/v1/queue/missing",
    "https://stream.example/control/v1/stream",
  ]);
});

test("watcher emits revisions, reaches terminal state, and honors cancellation", async () => {
  let calls = 0;
  const client = new QueueBroadcastClient({
    endpoint: "https://stream.example",
    token: "server-secret",
    fetch: async () => {
      calls += 1;
      return jsonResponse({
        ...queuedJob,
        status: calls === 1 ? "queued" : "done",
        updated_at: calls,
      });
    },
  });
  const observed = [];
  for await (const update of client.watchJob("job-1", { intervalMs: 0 })) observed.push(update.status);
  assert.deepEqual(observed, ["queued", "done"]);

  const controller = new AbortController();
  controller.abort();
  const cancelled = [];
  for await (const update of client.watchJob("job-1", { signal: controller.signal })) cancelled.push(update);
  assert.deepEqual(cancelled, []);

  const inFlightController = new AbortController();
  let receivedSignal;
  const hangingClient = new QueueBroadcastClient({
    endpoint: "https://stream.example",
    token: "server-secret",
    fetch: async (_url, init) => new Promise((_resolve, reject) => {
      receivedSignal = init.signal;
      init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }),
  });
  const iterator = hangingClient.watchJob("job-1", { signal: inFlightController.signal });
  const next = iterator.next();
  await new Promise((resolve) => setImmediate(resolve));
  inFlightController.abort();
  assert.deepEqual(await next, { value: undefined, done: true });
  assert.equal(receivedSignal, inFlightController.signal);
});
