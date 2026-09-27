# @portalshq/capabilities-redirect

**Reusable agent module:** [integration guide](../../docs/package-agents/capabilities-redirect.md)

Small Express middleware that redirects one configured path to the preferred live channel, or a fallback path.

```ts
import express from "express";
import { createInstantRedirectMiddleware, InMemoryLiveChannelRegistry } from "@portalshq/capabilities-redirect";

const app = express();
const registry = new InMemoryLiveChannelRegistry();
app.use(createInstantRedirectMiddleware({ registry })); // mount before SPA/static fallback
```

## API

- `LiveChannelRegistry.listLive()`: returns preferred channel IDs first.
- `InMemoryLiveChannelRegistry.markLive()` / `.markEnded()`: process-local implementation.
- `createInstantRedirectMiddleware({ registry, channelPath?, fallbackPath?, matchPath? })`: sends a 302 only for a matching GET request; all other requests call `next()`.

## Limits

- `InMemoryLiveChannelRegistry` is non-durable and process-local. Replace it when multiple application instances must agree on what is live.
- `channelPath` must return a safe application-controlled path; channel IDs are otherwise passed straight to it.
- `express@^4` is a peer dependency.
