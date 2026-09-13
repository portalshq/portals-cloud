# @portalshq/resolver

Thin adapter over the existing PX v0 client. The whole point of this
package is to NOT contain protocol logic — that already exists and is
proven in production (studio-app, 25thChapter). This package exists so
every *new* capability in this repo can depend on a stable
`PxResolver` interface instead of reaching into PX v0 internals.

Next step for whoever owns PX: extract the v0 client out of studio-app
into its own publishable package so this adapter has something concrete
to wrap. Until then, this defines the target shape.
