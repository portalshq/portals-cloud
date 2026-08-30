# @portalshq/capability-realtime-fanout

Chat + polls + lobby controls, all built on one `FanoutBus`. This is the
capability that makes "all four channel types in parallel" cheap: a live
game show, an audience-directed film's voting beat, and a social-remix
channel's comment thread are all just different topics on the same bus,
not three different real-time systems.

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
