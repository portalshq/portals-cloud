<!-- doc-module: queue-broadcast-agent-guide -->
# Queue Broadcast: agent guide
## Load when
A trusted backend must stage or enqueue finished media to one Queue Broadcast Server.
## Use
Use stable idempotency keys, SHA-256-verified `Blob` uploads, slots for multi-asset turns, and an `AbortSignal` for job watches.
## Do not assume
A browser may access the queue token/control API, or a staged item can air before `releaseSlot`.
