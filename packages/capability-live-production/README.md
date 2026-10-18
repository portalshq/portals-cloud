# @portalshq/capability-live-production

**Reusable agent module:** [integration guide](../../docs/package-agents/live-production.md)

Coordinates scheduled narrative material with staged queue delivery through `reconcile(channelId)`. Includes Video Provider abstraction for multi-provider video generation (FAL, Reactor, OpenRouter) and Reactor Session Manager for persistent backend connections.

## Exports

- Root: `LiveProduction`, `createLiveProduction`, production types
- `VideoProvider`, `createVideoProvider`, video provider types
- `ReactorSessionManager`, `createReactorSessionManager` - Reactor session management

## Video Provider Abstraction

The `VideoProvider` interface is a deep module: small interface (4 methods), deep implementation (provider-specific complexity hidden). This is the seam between Interaction Orchestrator and video generation providers.

### Interface

```ts
interface VideoProvider {
  startSession(config: VideoSessionConfig): Promise<VideoSessionHandle>;
  sendInteraction(sessionId: string, interaction: VideoInteraction): Promise<void>;
  stopSession(sessionId: string): Promise<void>;
  getSessionStatus(sessionId: string): Promise<VideoSessionStatus>;
}
```

### Usage

```ts
import { createVideoProvider, type VideoProvider } from "@portalshq/capability-live-production";

// Create provider based on config
const provider = createVideoProvider({
  type: "reactor",
  modelName: "reactor/helios",
  apiKey: process.env.REACTOR_API_KEY,
});

// Start session
const handle = await provider.startSession({
  channelId: "channel-123",
  providerConfig: {
    type: "reactor",
    modelName: "reactor/helios",
    apiKey: process.env.REACTOR_API_KEY,
  },
});

// Send interaction
await provider.sendInteraction(handle.sessionId, {
  type: "prompt",
  payload: {
    type: "prompt",
    prompt: "A bear walking in the forest",
  },
});

// Check status
const status = await provider.getSessionStatus(handle.sessionId);

// Stop session
await provider.stopSession(handle.sessionId);
```

### Supported Providers

- **Reactor** - WebRTC video generation, real-time streaming
- **FAL** - HTTP video generation, HLS staging
- **OpenRouter** - Text generation (for non-video workflows)

### Architecture

```
Interaction Orchestrator
         ↓
  VideoProvider Interface (seam)
         ↓
    ┌────┴────┬──────────┬──────────┐
    ↓         ↓          ↓          ↓
 Reactor     FAL    OpenRouter    (future)
 Provider   Provider    Provider
```

### Design Principles

- **Deep module:** Small interface (4 methods), deep implementation (provider-specific complexity hidden)
- **Clean seam:** Testable through interface, provider-specific details hidden
- **Accept dependencies:** No internal instantiation, configuration passed in
- **Return results:** No side effects, explicit return values
- **Leverage:** One interface used across N providers
- **Locality:** Provider-specific logic contained in adapters

### Provider Configuration

#### Reactor
```ts
{
  type: "reactor",
  modelName: "reactor/helios",
  apiKey: "rk_...",
  apiUrl?: "https://api.reactor.inc",
  maxSessionDurationSeconds?: 3600,
  sessionId?: "existing-session-id", // for session adoption
}
```

#### FAL
```ts
{
  type: "fal",
  modelName: "fal-ai/fast-sdxl",
  apiKey: "fal_...",
  queueName?: "hls-queue-name",
}
```

#### OpenRouter
```ts
{
  type: "openrouter",
  modelName: "anthropic/claude-3.5-sonnet",
  apiKey: "sk-or-...",
}
```

### Interaction Types

- **prompt** - Text-to-video generation
- **command** - Direct command to model
- **mutation** - Modify existing content
- **vote** - Voting mechanism
- **branch** - Narrative branching

### Integration with Interaction Orchestrator

The Interaction Orchestrator sends resolved interactions to the VideoProvider:

```ts
// Interaction Orchestrator resolves command
const resolved = await arbitrator.resolve(submission);

// Send to video provider
await videoProvider.sendInteraction(sessionId, {
  type: "command",
  payload: {
    type: "command",
    command: resolved.command,
    params: resolved.params,
  },
});
```

**Note:** This integration is currently not implemented in the Bears app. The Bears app calls VideoProvider directly from the production layer. Integration with Interaction Orchestrator will be implemented in Phase 2 of the Interaction Orchestrator package.

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

**VideoProvider Abstraction:**
- ✅ Deep module interface (4 methods + optional getVideoBuffer + optional destroy)
- ✅ FAL adapter: Production-ready with video buffer retrieval, retries, and timeout
- ✅ Reactor adapter: Token minting implemented, session management, session cleanup
- ⚠️ Reactor adapter: Command sending NOT IMPLEMENTED - Reactor commands require WebRTC data channel, not HTTP API
- ⚠️ OpenRouter adapter: Stub (requires OpenAI SDK optional peer dependency)
- ✅ Factory function for provider selection
- ✅ Session cleanup with TTL (1 hour) for all adapters
- ✅ Test coverage: 24 tests passing

**Reactor Session Manager:**
- ✅ Token minting interface
- ✅ Session ID management
- ✅ Heartbeat for session keeping
- ⚠️ Command interface: NOT IMPLEMENTED - Reactor commands require WebRTC data channel

**Reactor integration constraints:**
- **Commands:** Reactor commands (via `sendCommand()`) are sent through WebRTC data channel, not HTTP API
- **Server-side limitation:** Node.js backend cannot send commands without WebRTC connection
- **Production architecture:**
  1. Backend mints session-scoped tokens via HTTP API
  2. Backend provides token and session ID to frontend
  3. Frontend uses `@reactor-team/js-sdk` to connect via WebRTC
  4. Frontend sends commands via SDK's `sendCommand()` method
- **Server-side video generation:** Reactor does not support server-side clip generation (WebRTC-only)
- **Use FAL for server-side batch generation**

**FAL integration:**
- ✅ Production-ready HTTP API calls via @fal-ai/client (optional peer dependency)
- ✅ Video generation and download
- ✅ Video buffer retrieval via `getVideoBuffer()` for server-side staging
- ✅ Retry logic (3 attempts with exponential backoff)
- ✅ Timeout handling (60 second timeout)


### Building from source

The optional FAL adapter requires `@fal-ai/client` at runtime when selected.
The SDK is also a development dependency so TypeScript can check its lazy import
in clean builds; consumers using other adapters do not have to install it.
