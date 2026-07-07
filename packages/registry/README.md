# @portals/registry

Capability registry — the control-plane component that lets channel
manifests reference capabilities by id+version instead of by hardcoded
implementation. This is also the natural place the future capability
*marketplace* (third-party providers) plugs into: marketplace listings are
just registry entries with billing/ownership metadata attached.
