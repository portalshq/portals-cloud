# @portalshq/capability-realtime-fanout

Chat + polls + lobby controls, all built on one `FanoutBus`. This is the
capability that makes "all four channel types in parallel" cheap: a live
game show, an audience-directed film's voting beat, and a social-remix
channel's comment thread are all just different topics on the same bus,
not three different real-time systems.

`InMemoryFanoutBus` is the default implementation. It is process-local and
intentionally has no Redis, NATS, or other broker dependency; messages are not
shared between instances and are lost on restart. It is therefore appropriate
for local development and single-instance deployments only.

`ChatProviderRegistry` owns provider connect/disconnect lifecycle and forwards
each normalized provider message to `chat:<sessionId>`. Applications can use
`InMemoryChatProvider` locally, while Twitch, YouTube, and other connectors
remain application-owned implementations of `ChatProvider`.

## External stream chat ingress

`ExternalChatIngress` is the provider-neutral boundary for normalized chat
events received by an application integration. It publishes an event to
`chat:<normalized-stream-endpoint>` and adds a stable
`external:<provider>:<provider-message-id>` message ID, a namespaced author
ID, and provenance metadata. It requires the provider name, provider message
ID, source author ID/display name, text, and original timestamp.

It intentionally does not implement OAuth, webhooks, provider connections,
persistence, or outbound relays. Those integrations normalize their events
before invoking this package.
