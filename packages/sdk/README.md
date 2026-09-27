# @portalshq/sdk

**Reusable agent module:** [integration guide](../../docs/package-agents/sdk.md)

Channel manifest loader plus the `px` developer CLI.

```sh
npx px channel validate ./channel.yaml
```

`channel validate` loads YAML and validates it with `ChannelManifestSchema` from `@portalshq/contracts`. It prints the manifest name or exits with an error.

```ts
import { loadManifest } from "@portalshq/sdk";

const manifest = loadManifest("./channel.yaml");
```

## Manifest minimum

```yaml
apiVersion: px/v1
kind: Channel
metadata:
  name: my-channel
  owner: developer-id
spec:
  worldTemplate: px://world/example
  capabilities:
    - capabilityId: platform.chat
```

## Status

- `px channel validate <manifestPath>`: implemented.
- `px channel init <name>`: prints a TODO; it does not create a file.
- `px channel deploy <manifestPath>`: prints a TODO; it does not deploy.

Do not automate `init` or `deploy` yet. Use `loadManifest` or `channel validate` only for local schema validation; resolution, deployment, tenancy checks, and runtime configuration happen elsewhere.
