---
name: Vote/like counter idempotency
description: How to make a per-client vote or like counter safe under concurrent requests in this monorepo's Postgres + Drizzle stack.
---

A "vote once per client" feature (roadmap upvotes, likes, etc.) must not rely on
a `SELECT` to check for an existing vote followed by a separate `INSERT`/`UPDATE`.
Two concurrent requests from the same client can both pass the check before either
write lands, producing duplicate vote rows and a double-incremented counter.

**Why:** observed in code review on a public capability-voting feature — the
check-then-write pattern is a classic TOCTOU race, invisible in manual testing
but real under concurrent load.

**How to apply:** add a Postgres unique index on `(entityId, clientId)` in the
Drizzle schema, then do the write as a single atomic statement:
`db.insert(votesTable).values(...).onConflictDoNothing({ target: [...] }).returning()`.
Only increment the counter when the insert actually returned a row.
