# @portalshq/resolver

Thin adapter over the existing NAP v0 client. The whole point of this
package is to NOT contain protocol logic — that already exists and is
proven in production (studio-app, 25thChapter). This package exists so
every *new* capability in this repo can depend on a stable
`NapResolver` interface instead of reaching into NAP v0 internals.

Next step for whoever owns NAP: extract the v0 client out of studio-app
into its own publishable package so this adapter has something concrete
to wrap. Until then, this defines the target shape.
