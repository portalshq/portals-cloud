<!-- doc-module: capabilities-redirect-agent-guide -->
# Capabilities redirect: agent guide
## Load when
Adding an Express GET redirect to the currently preferred live channel.
## Use
Mount middleware before SPA/static fallbacks and replace the in-memory registry across multiple instances.
## Do not assume
It authorizes users, validates generated channel paths, persists liveness, or synchronizes processes.
