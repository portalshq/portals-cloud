<!-- doc-module: runtime-core-agent-guide -->
# Runtime core: agent guide
## Load when
Managing presence-triggered channel ticks or calculating monotonic countdown state.
## Use
Make `onActivate`/`onTick` idempotent; call `removeViewer` on disconnect and `shutdown` on process stop.
## Do not assume
The engine runs an API, persists sessions, invokes capabilities, or guarantees sub-interval timing.
