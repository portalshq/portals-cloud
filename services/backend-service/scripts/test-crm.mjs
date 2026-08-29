import assert from "node:assert/strict";

Object.assign(process.env, {
  AWS_REGION: "us-east-1",
  COGNITO_USER_POOL_ID: "us-east-1_test",
  LEADS_DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test",
  LEADS_HASH_KEY: "test-hash-key",
  LEADS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  BACKEND_API_SHARED_SECRET: "test-backend-token",
  SES_FROM_EMAIL: "test@example.com",
  SES_CONFIGURATION_SET: "test",
  PUBLIC_APP_URL: "https://example.com",
  CRM_API_URL: "https://api.apollo.io",
  CRM_API_KEY: "test-crm-key",
  CRM_WEBHOOK_SECRET: "test-webhook-secret",
});

const calls = [];
globalThis.fetch = async (input, init) => {
  calls.push({url: String(input), method: init?.method, body: JSON.parse(String(init?.body || "{}"))});
  return new Response(calls.length === 1 ? JSON.stringify({contacts: []}) : JSON.stringify({contact: {id: "contact-1"}}), {
    status: 200,
    headers: {"Content-Type": "application/json"},
  });
};

const [{encryptJson}, {syncContact}] = await Promise.all([
  import("../dist/lead-processing/src/crypto.js"),
  import("../dist/lead-processing/src/crm.js"),
]);
await syncContact({
  id: "submission-1",
  payload_ciphertext: encryptJson({
    email: "Person@Example.com",
    name: "Pat Example",
    company: "Example Studio",
    role: "Producer",
    payload: {},
  }),
});

assert.deepEqual(calls, [
  {
    url: "https://api.apollo.io/api/v1/contacts/search",
    method: "POST",
    body: {q_keywords: "person@example.com", per_page: 10},
  },
  {
    url: "https://api.apollo.io/api/v1/contacts",
    method: "POST",
    body: {
      first_name: "Pat",
      last_name: "Example",
      email: "person@example.com",
      organization_name: "Example Studio",
      title: "Producer",
    },
  },
]);
