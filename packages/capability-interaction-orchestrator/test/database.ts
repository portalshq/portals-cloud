import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import {
  InteractionRepository,
  InteractionOrchestrator,
  type CreateWindowInput,
  type InputWindow,
  type Submission,
} from "../src/index.js";

/** A real PostgreSQL engine embedded in-process. Pool transactions serialize on its one connection. */
export async function database() {
  const url = process.env.INTERACTION_TEST_DATABASE_URL;
  if (url && process.env.INTERACTION_TEST_MODE !== "non-production")
    throw new Error(
      "External database tests require INTERACTION_TEST_MODE=non-production and an isolated scratch database"
    );
  const embedded = url ? undefined : new PGlite();
  const schema = `interaction_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const actual = url
    ? new Pool({ connectionString: url, options: `-c search_path=${schema}` })
    : undefined;
  if (actual) await actual.query(`CREATE SCHEMA ${schema}`);
  let tail = Promise.resolve();
  async function connect() {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    return {
      query: async (sql: string, params?: unknown[]) => {
        if (!params?.length) {
          const results = await embedded!.exec(sql);
          return results.at(-1) ?? { rows: [] };
        }
        return embedded!.query(sql, params);
      },
      release,
    };
  }
  const pool =
    actual ??
    ({
      connect,
      query: async (sql: string, params?: unknown[]) => {
        const client = await connect();
        try {
          return await client.query(sql, params);
        } finally {
          client.release();
        }
      },
    } as Pool);
  for (const file of [
    "../../monetization/sql/001_monetization.sql",
    "../sql/001_interaction_orchestrator_core.sql",
    "../sql/002_durable_lifecycle.sql",
  ])
    await pool.query(readFileSync(new URL(file, import.meta.url), "utf8"));
  const repository = new InteractionRepository(pool);
  const app = new InteractionOrchestrator(repository);
  return {
    pool,
    repository,
    app,
    close: async () => {
      if (actual) {
        await actual.query(`DROP SCHEMA ${schema} CASCADE`);
        await actual.end();
      } else await embedded!.close();
    },
  };
}
export const windowInput = (
  overrides: Partial<CreateWindowInput> = {}
): CreateWindowInput => ({
  worldId: crypto.randomUUID(),
  branchId: "main",
  baseCommitHash: "base",
  conflictKey: "story",
  allowedInputKinds: ["custom_prompt"],
  arbitrationPolicy: "fifo",
  billingPolicy: "free",
  maxSubmissionsPerUser: 1,
  maxSelectedInputs: 2,
  opensAt: new Date(Date.now() - 1000).toISOString(),
  closesAt: null,
  contentRating: "E",
  ...overrides,
});
export async function openWindow(
  app: InteractionOrchestrator,
  overrides: Partial<CreateWindowInput> = {}
) {
  const w = await app.windows.createWindow(windowInput(overrides));
  await app.windows.openWindow(w.id);
  return (await app.windows.getWindow(w.id))!;
}
export const terms = {
  tenantId: "tenant",
  entitlementKind: "story_guide",
  amountCredits: 1,
  amountCents: 100,
  currency: "USD",
};
export async function grant(
  pool: Pool,
  actor: string,
  quantity = 10,
  scope: object = {},
  tenantId = "tenant",
  expiresAt: string | null = null
) {
  const purchaseId = crypto.randomUUID();
  const ruleId = crypto.randomUUID();
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO monetization_tenant_profiles(tenant_id,owner_id,stripe_account_id,transfers_status,default_currency,created_at,updated_at) VALUES($1,'owner',$2,'active','usd',now(),now()) ON CONFLICT DO NOTHING`,
    [tenantId, `acct_${tenantId}`]
  );
  await pool.query(
    `INSERT INTO monetization_purchases(id,tenant_id,channel_id,buyer_id,product_key,kind,amount,currency,platform_fee_amount,state,created_at,updated_at) VALUES($1,$2,'channel',$3,'credits','purchase',100,'usd',0,'settled',now(),now())`,
    [purchaseId, tenantId, actor]
  );
  await pool.query(
    `INSERT INTO monetization_entitlement_rules(id,tenant_id,kind,scope,quantity,created_at) VALUES($1,$2,'story_guide',$3,$4,now())`,
    [ruleId, tenantId, JSON.stringify(scope), quantity]
  );
  await pool.query(
    `INSERT INTO monetization_entitlements(id,rule_id,tenant_id,consumer_id,kind,scope,quantity,remaining,purchase_id,expires_at,created_at,updated_at) VALUES($1,$2,$3,$4,'story_guide',$5,$6,$6,$7,$8,now(),now())`,
    [
      id,
      ruleId,
      tenantId,
      actor,
      JSON.stringify(scope),
      quantity,
      purchaseId,
      expiresAt,
    ]
  );
  return id;
}
export const balance = async (pool: Pool, actor: string) =>
  Number(
    (
      await pool.query(
        "SELECT COALESCE(sum(remaining),0)::int AS n FROM monetization_entitlements WHERE consumer_id=$1",
        [actor]
      )
    ).rows[0].n
  );
export const submit = (
  app: InteractionOrchestrator,
  w: InputWindow,
  actorId: string = crypto.randomUUID(),
  prompt = "Hello"
) =>
  app.submissions.submitIntent({
    windowId: w.id,
    actorId,
    idempotencyKey: crypto.randomUUID(),
    kind: "custom_prompt",
    payload: { prompt },
  });
export function sampleWindow(
  overrides: Partial<InputWindow> = {}
): InputWindow {
  return {
    ...windowInput(),
    id: "window",
    revision: 1,
    state: "open",
    arbitrationPolicyConfig: {},
    moderationPolicyVersion: "1.0.0",
    rulesetVersion: "1.0.0",
    appMetadata: {},
    ...overrides,
  };
}
export function sampleSubmission(
  id = "s1",
  overrides: Partial<Submission> = {}
): Submission {
  return {
    id,
    windowId: "window",
    actorId: id,
    idempotencyKey: id,
    kind: "custom_prompt",
    payload: { prompt: "Hello" },
    targetEntityIds: [],
    baseCommitHash: "base",
    status: "eligible",
    admittedAt: new Date().toISOString(),
    admissionSequence: 1,
    appMetadata: {},
    ...overrides,
  };
}
