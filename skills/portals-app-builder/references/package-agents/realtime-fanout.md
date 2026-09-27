<!-- doc-module: realtime-fanout-agent-guide -->
# Realtime fanout: agent guide
## Load when
Adding in-process chat, lobby events, polls, or WebSocket-like outbound queues.
## Use
Inject a durable broker-backed `FanoutBus` for multi-instance production; authorize before topic subscription.
## Do not assume
The in-memory bus survives restarts, chat is moderated/persisted, lobby enforces admission, or polls can close.
