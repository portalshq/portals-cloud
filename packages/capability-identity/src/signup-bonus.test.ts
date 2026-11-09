import { describe, expect, it } from "vitest";
import { SignupBonusStore } from "./signup-bonus.js";
import type { QueryRunner } from "./postgres-store.js";

function makePool() {
  const claims = new Set<string>();
  const pool: QueryRunner = {
    async query(text: string, values: unknown[] = []) {
      const key = `${values[0]}::${values[1]}`;
      if (text.startsWith("SELECT")) {
        return { rowCount: claims.has(key) ? 1 : 0, rows: claims.has(key) ? [{ "?column?": 1 }] : [] };
      }
      if (claims.has(key)) return { rowCount: 0, rows: [] };
      claims.add(key);
      return { rowCount: 1, rows: [{ consumer_id: values[0] }] };
    },
  };
  return pool;
}

describe("SignupBonusStore", () => {
  it("claims the welcome bonus once per consumer per tenant", async () => {
    const pool = makePool();
    const first = new SignupBonusStore(pool);
    const second = new SignupBonusStore(pool);
    expect(await first.claim("user-1", "program-a")).toBe(true);
    expect(await second.claim("user-1", "program-a")).toBe(false);
    // A different tenant is a different welcome.
    expect(await first.claim("user-1", "program-b")).toBe(true);
    expect(await first.claim("user-2", "program-a")).toBe(true);
  });

  it("reports claimed state without mutating it", async () => {
    const pool = makePool();
    const store = new SignupBonusStore(pool);
    expect(await store.hasClaimed("user-1", "program-a")).toBe(false);
    await store.claim("user-1", "program-a");
    expect(await store.hasClaimed("user-1", "program-a")).toBe(true);
    expect(await store.hasClaimed("user-1", "program-b")).toBe(false);
    expect(await store.hasClaimed("user-2", "program-a")).toBe(false);
  });
});
