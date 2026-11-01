---
"@portalshq/capability-live-production": patch
---

Write a slot-less intent checkpoint before generating material, so a failing
journal (e.g. a missing FK parent row) aborts the reconcile before any
generation spend instead of burning a slot on every backoff retry. The
post-release checkpoint write is now non-fatal — the slot already shipped —
and failures surface through a new optional `onJournalError` dependency hook.
