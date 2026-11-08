# @portalshq/capability-live-production

## 0.1.2

### Patch Changes

- fc3eaf9: Write a slot-less intent checkpoint before generating material, so a failing
  journal (e.g. a missing FK parent row) aborts the reconcile before any
  generation spend instead of burning a slot on every backoff retry. The
  post-release checkpoint write is now non-fatal — the slot already shipped —
  and failures surface through a new optional `onJournalError` dependency hook.

## 0.1.1

### Patch Changes

- 57e3283: Export the video provider factory and types from the package root.
