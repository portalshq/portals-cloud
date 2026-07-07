# @portals/runtime-core

The control plane (`SessionOrchestrator`) and data plane (`DataPlaneGateway`)
are deliberately separate classes that should eventually be separate
deployments — see `docs/architecture-decision-records/0001-*.md`. Don't
merge them back into one service even though it'd be less code right now;
the whole reason for the split is independent failure isolation and
independent scaling at audience-scale traffic.
