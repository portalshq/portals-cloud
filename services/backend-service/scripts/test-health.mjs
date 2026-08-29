import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";

const port = 18_088;
const child = spawn(process.execPath, ["dist/backend-service/src/index.js"], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    PORT: String(port),
    AWS_REGION: "us-east-1",
    COGNITO_USER_POOL_ID: "us-east-1_test",
    LEADS_DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test",
    LEADS_HASH_KEY: "test-hash-key",
    LEADS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    BACKEND_API_SHARED_SECRET: "test-backend-token",
    SES_FROM_EMAIL: "test@example.com",
    SES_CONFIGURATION_SET: "test",
    PUBLIC_APP_URL: "https://example.com",
    CRM_API_URL: "https://crm.example.com",
    CRM_API_KEY: "test-crm-key",
    CRM_WEBHOOK_SECRET: "test-webhook-secret",
    CORS_ALLOWED_ORIGINS: "https://example.com",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const exited = once(child, "exit");

let output = "";
child.stdout.on("data", chunk => { output += chunk; });
child.stderr.on("data", chunk => { output += chunk; });

try {
  let response;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      response = await fetch(`http://127.0.0.1:${port}/health`);
      break;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  assert.ok(response, `Backend did not start:\n${output}`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
} finally {
  child.kill("SIGTERM");
  await exited;
}
