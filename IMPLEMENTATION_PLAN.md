# Portals Platform Implementation Plan

## Phase Completion Status

**✅ COMPLETED: Phase 0 (Code Merge - Week 1)**
- Copied @platform-no-context packages into @portals-platform
- Removed models/ directory
- Normalized naming to @portalshq/*
- Merged capability-contract → contracts
- Merged realtime-engine → runtime-core
- Merged state-cache → runtime-core
- Moved instant-redirect → capabilities/redirect
- Updated all @nap/* references to @portalshq/*
- Added VISION.md and tsconfig.base.json

**⏳ PENDING: Phase 1 (Contract Merge - Week 2)**
**⏳ PENDING: Phase 2 (Runtime Merge - Week 2-3)**
**⏳ PENDING: Phase 3 (Construct Library - Weeks 4-6)**
**⏳ PENDING: Phase 4 (Agentic Workflow - Week 7)**
**⏳ PENDING: Phase 5 (Fill Implementation Gaps - Weeks 8-12)**

---

## Bugs and Oversights from Phase 0

### Critical Bug: CapabilityContext Type Conflict

The `contracts` package now exports **two different** `CapabilityContext` interfaces:

- `capability-contract.ts` (from @portals-platform):
  ```typescript
  export interface CapabilityContext {
    sessionId: string;
    channelId: string;
    worldId: string;
    resolve: (napAddress: string) => Promise<unknown>;
  }
  ```

- `capabilities.ts` (from @platform-no-context):
  ```typescript
  export interface CapabilityContext<TConfig = unknown> {
    channelId: string;
    tenant: TenantContext;
    config: TConfig;
  }
  ```

This will cause import conflicts and type errors. These need to be merged in Phase 1.

### Two Unmerged Capability Interfaces

- `Capability<TInput, TOutput>` (Zod-based, from @portals-platform)
- `CapabilityModule<TConfig>` (lifecycle-based, from @platform-no-context)

Per the strategic analysis, these should be merged into a single interface that combines both patterns. Currently both are exported, which is confusing.

### Missing tsconfig References

The merged files (realtime-engine.ts, state-cache.ts) were copied but may need their own tsconfig.json files or need to reference the parent package's tsconfig.

---

## Phase 1: Contract Merge (Week 2)

**Goal**: Merge CapabilityModule (platform-no-context) with Capability (portals-platform) into unified @portalshq/contracts.

### Steps

1. **Resolve CapabilityContext conflict**
   - Create unified `CapabilityContext<TConfig>` that combines:
     - From @platform-no-context: `channelId`, `tenant`, `config`
     - From @portals-platform: `sessionId`, `worldId`, `resolve`
   - Result:
     ```typescript
     export interface CapabilityContext<TConfig = unknown> {
       channelId: string;
       sessionId?: string;
       worldId?: string;
       tenant: TenantContext;
       config: TConfig;
       resolve?: (napAddress: string) => Promise<unknown>;
     }
     ```

2. **Merge CapabilityModule + CapabilityContract**
   - Keep CapabilityModule as the primary interface (lifecycle hooks + fail-loud validation)
   - Add Zod schema fields from CapabilityContract as optional validation layer
   - Result:
     ```typescript
     export interface CapabilityModule<TConfig = unknown, TInput = unknown, TOutput = unknown> {
       id: string;
       version: string;
       displayName: string;
       dependsOn?: string[];
       
       // From @platform-no-context (core)
       validateConfig(config: unknown): ValidationResult;
       onChannelRegistered?(ctx: CapabilityContext<TConfig>): Promise<void>;
       onChannelUnregistered?(ctx: CapabilityContext<TConfig>): Promise<void>;
       
       // From @portals-platform (formal layer - optional)
       inputSchema?: ZodSchema<TInput>;
       outputSchema?: ZodSchema<TOutput>;
       permissions?: PermissionScope[];
       plane?: "control" | "data";
       lazyStart?: boolean;
       
       // Runtime invocation
       invoke?(input: TInput, ctx: CapabilityContext<TConfig>): Promise<TOutput>;
     }
     ```

3. **Merge tenancy models**
   - Keep @platform-no-context's `TenantContext` + `TrustLevel` + `quotas`
   - Add @portals-platform's billing metering hooks (tenantId-based)
   - Ensure `assignInitialTrust()` is used for new tenant onboarding

4. **Update CapabilityRegistry**
   - Ensure it works with merged CapabilityModule
   - Add optional Zod validation if schemas are present

5. **Update all capability implementations**
   - Update identity, realtime-fanout, video-delivery, etc. to use merged interface
   - Add optional Zod schemas where appropriate

---

## Phase 2: Runtime Merge (Week 2-3)

**Goal**: Wire RealtimeEngine into SessionOrchestrator and replace stubs with real implementations.

### Steps

1. **Integrate RealtimeEngine with SessionOrchestrator**
   - `SessionOrchestrator.startSession()` → creates RealtimeEngine instance
   - `SessionOrchestrator.endSession()` → calls `engine.stopAll()`
   - `RealtimeEngine.onActivate` → starts capability sessions
   - `RealtimeEngine.onTick` → drives narrative progression

2. **Replace DataPlaneGateway stubs**
   - Wire StateCache into DataPlaneGateway for write-through caching
   - Replace stub fanout with real NATS-based implementation from realtime-engine

3. **Connect billing metering**
   - Add OpenMeter instrumentation hooks in SessionOrchestrator
   - Meter session start/end events
   - Meter capability invocations
   - Connect to @portalshq/billing-metering package

4. **Update session lifecycle**
   - Ensure lazy-start is honored (no compute until first viewer)
   - Implement presence-triggered activation
   - Add session timeout/cleanup logic

5. **Integration testing**
   - Write end-to-end tests for session lifecycle
   - Test capability activation/deactivation order
   - Test billing metering events

---

## Phase 3: Construct Library (Weeks 4-6)

**Goal**: Build @portalshq/constructs using the open-source constructs npm package.

### Steps

1. **Create @portalshq/constructs package**
   ```bash
   mkdir -p packages/constructs
   npm install constructs
   ```

2. **Define core constructs**
   - `Channel` - composes capabilities, world, narrative
   - `Capability` - represents a capability with config
   - `World` - persistent state container
   - `Narrative` - branching story structure
   - `NAPAddress` - universal resolution

3. **Build synthesis framework**
   - `nap.synth(channel, target)` - generates infra code
   - Target interface: `{ target: 'aws' | 'local' }`

4. **Build @portalshq/cdk-target**
   - Maps constructs to AWS CDK
   - Channel → ECS Service + Task Definition
   - Capability → Lambda functions or sidecars
   - World → DynamoDB table
   - Video → IVS channel + CloudFront distribution
   - Realtime → AppSync or NATS on ECS

5. **Build @portalshq/compose-target**
   - Maps constructs to Docker Compose
   - Reuse existing docker-compose.yml as base
   - Channel → docker-compose service
   - Capability → container or sidecar
   - World → Postgres volume
   - Video → local video server stub
   - Realtime → NATS container

6. **Add construct validation**
   - Validate capability dependencies
   - Validate resource limits
   - Validate naming conventions

---

## Phase 4: Agentic Workflow (Week 7)

**Goal**: Enhance nap CLI for agent-friendly development.

### Steps

1. **Enhance nap CLI**
   - `nap init` - scaffold with constructs template
   - `nap synth` - generate infra code (CDK or Docker Compose)
   - `nap deploy` - deploy to dev or prod
   - `nap status` - session info, viewer count, costs
   - `nap validate` - validate manifest against contracts

2. **Write agent prompt templates**
   - Template for Claude/Codex to generate construct code
   - Template for "build me a X channel" requests
   - Template for capability selection and configuration

3. **Publish @portalshq/constructs with rich JSDoc**
   - Add comprehensive documentation for all constructs
   - Include examples in JSDoc
   - Ensure agents can read and understand the API

4. **Create example channels**
   - Live movie theatre example
   - Interactive game show example
   - Text-image ebook example
   - Demonstrate different capability combinations

---

## Phase 5: Fill Implementation Gaps (Weeks 8-12)

**Priority order**:

1. **Identity capability** (Week 8)
   - Implement Cognito + Wallet (SIWE) integration
   - Federated identity across channels
   - Profile management

2. **Video delivery** (Week 8-9)
   - AWS IVS integration for live streaming
   - VOD support
   - Content rating enforcement
   - Akamai CDN for high-scale

3. **Chat + extraction** (Week 9)
   - Real-time chat with NATS fanout
   - Infra-side extraction pipeline
   - Moderation hooks

4. **Polls + lobby controls** (Week 9-10)
   - Real-time polling
   - Lobby presence management
   - Capacity gating

5. **Narrative engine adapter** (Week 10)
   - Extract from studio-app
   - Integrate with NAP resolver
   - Branching narrative support

6. **NAP resolver** (Week 10-11)
   - Extract from studio-app
   - Universal address resolution
   - World/narrative/asset lookup

7. **Testing & documentation** (Week 11-12)
   - Comprehensive test suite
   - Integration tests
   - Developer documentation
   - API reference
