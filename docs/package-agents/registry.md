<!-- doc-module: registry-agent-guide -->
# Registry: agent guide
## Load when
Registering or resolving concrete `Capability` instances at runtime.
## Use
Pin an explicit version in production and treat the registry as process-local state.
## Do not assume
It persists registrations, coordinates instances, or performs semver selection when version is omitted.
