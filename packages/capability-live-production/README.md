# @portalshq/capability-live-production

**Reusable agent module:** [integration guide](../../docs/package-agents/live-production.md)

Coordinates scheduled narrative material with staged queue delivery through `reconcile(channelId)`. Includes Reactor Session Manager for persistent backend connections to Reactor for multi-client real-time streaming.

## Exports

- Root: `LiveProduction`, `createLiveProduction`, production types
- `ReactorSessionManager`, `createReactorSessionManager` - Reactor session management

## Reactor Session Manager

The `ReactorSessionManager` class maintains an authoritative Reactor WebRTC session for multi-client real-time streaming. This is designed for persistent backend services (not serverless).

### Usage

```ts
import { createReactorSessionManager } from "@portalshq/capability-live-production";

const sessionManager = createReactorSessionManager({
  config: {
    apiKey: process.env.REACTOR_API_KEY,
    modelName: "reactor/helios",
    apiUrl: "https://api.reactor.inc",
    maxSessionDurationSeconds: 3600,
  },
  onObservation: (obs) => console.log("Reactor session:", obs.state, obs.sessionId),
  onCommand: (command, params) => console.log("Command:", command, params),
});

// Connect to Reactor
const sessionId = await sessionManager.connect();

// Send commands to Reactor
await sessionManager.sendCommand("set_prompt", { prompt: "Hello world" });

// Get session ID for frontend clients
const currentSessionId = sessionManager.getSessionId();

// Disconnect when done
await sessionManager.disconnect();
```

### Architecture

```
Serverless Backend (HTTP)  →  Reactor Session Manager (Persistent)
                                 ↓
                            Reactor Session (WebRTC)
                                 ↓
                     ┌──────────┴──────────┐
                     ↓                     ↓
        Frontend Client 1        Frontend Client N
        (WebRTC player)          (WebRTC player)
```

### Session Adoption

Frontend clients can connect to the backend's Reactor session using:
1. Get session ID from backend
2. Request token with `resources.sessions.bind` to allow connection to existing session
3. Connect to Reactor with session ID

### Production Considerations

- **Not serverless:** Session manager needs persistent connection
- **Reactor SDK:** Reactor's JavaScript SDK is React-specific. For Node.js backend, consider:
  - Reactor's Python SDK (reactor-sdk)
  - Custom signaling implementation
  - Browser-based bridge (headless browser with WebRTC)
- **Health checks:** Monitor connection status and reconnection
- **Session lifecycle:** Reactor sessions have a 30s recovery window after disconnection

### Current Status

The Reactor Session Manager provides:
- Token minting interface
- Session ID management
- Heartbeat for session keeping
- Command interface (callback-based)

Full Reactor integration requires:
- Reactor SDK installation (Python or JavaScript)
- WebRTC connection handling
- Signaling protocol implementation

For production Reactor WebRTC connections in React applications, use `@reactor-team/js-sdk` directly in the frontend.
