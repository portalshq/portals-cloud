# Lore Cloud console — Phase 0 assessment

**Status:** Blocked — do not implement a browser console against this checkout yet.

**Assessment date:** 2026-09-21  
**Repository inspected:** `/Users/vibrantceo/Projects/portals/cloud` at `66a405550fe06834cc22d28f45d7b4ffa64223e5`  
**Lore source pinned:** `/Users/vibrantceo/Projects/portals/cloud/infra/lore/lore` at `3498dd56ad773630ca4871eef2197817dd593382` (`0.8.4-portals.9`; `lore-proto` `0.1.60`)

## Decision

The mandatory implementation gate does **not** pass. The requested console must only be built after a real development Lore deployment proves native gRPC, JWT-scoped authorization, safe byte streaming, and the required read surface. This checkout cannot provide that proof:

- The declared development stack deliberately scales Lore to zero (`infra/pulumi/Pulumi.dev.yaml:6`) and exposes no backend service (`:14`).
- No local Lore, Auth Gateway, or backend port is listening (`41337`, `8084`, `8085`, and `8088` were all closed).
- The configured public names did not resolve from this execution environment. `curl -I --max-time 8 https://lore.portals.works` and `curl -I --max-time 8 https://auth.portals.works/healthz` both failed with `curl: (6) Could not resolve host`.
- The available Docker endpoint is a disconnected remote context, so the checked-in development compose fixture cannot be started here: `docker ps` failed while attempting its SSH connection.

Building a UI, a Node gRPC adapter, or streaming endpoints under those conditions would require mocked integration behavior, which the assignment explicitly prohibits. No production-facing console code was added.

## Sources and contract findings

The pinned source includes the conceptual and deployment documentation requested in the assignment:

- `infra/lore/lore/docs/explanation/system-design.md` confirms the binary-first, partition-scoped, content-addressed model and lazy range-capable storage design.
- `infra/lore/lore/docs/reference/lore-server-config.md` documents public gRPC configuration and JWT/JWK configuration.
- The actual v1 proto sources are in `infra/lore/lore/lore-proto/proto/lore/{repository,revision,storage,thin_client}/v1` and are registered in `infra/lore/lore/lore-server/src/grpc/server.rs:698-716`.

### Confirmed RPC surface

| Console capability | Pinned method | Finding |
| --- | --- | --- |
| Create, get, list, hard-delete repositories | `lore.repository.v1.RepositoryService.RepositoryCreate`, `RepositoryGet`, `RepositoryList`, `RepositoryDelete` | Present in `repository.proto`. `RepositoryList` is server-streaming, not cursor-paginated. `RepositoryDelete` is explicitly hard delete; it is not archive or obliteration. |
| Repository metadata pointer | `RepositoryMetadataGet`, `RepositoryMetadataSet` | Present, but these are hash-pointer primitives. They do not establish a browser-safe general-settings model. |
| Branch list and revision history | `lore.revision.v1.RevisionService.BranchList`, `RevisionList` | Present. `BranchList` is server-streaming; `RevisionList` uses server-selected page size. |
| Revision summary / full tree | `lore.thin_client.v1.ThinClientService.RevisionInfo`, `RevisionTree` | Present. The documented `RevisionTree` request has no directory-path/cursor argument and returns a streamed tree, so it cannot yet prove the required one-directory-at-a-time browse contract. |
| Opaque blob reads | `lore.storage.v1.StorageService.Get` | Present as storage primitive. The current proto does not by itself establish a safe logical-file descriptor or HTTP range contract for the requested console. |
| Generic content HTTP response | Lore HTTP `GET /v1/repository/:repository/content/:address` | Source streams content with a bounded queue, but the current handler (`lore-server/src/http/repositories/repository/contents/content/get_repository_content.rs`) does not implement browser `Range` / `Content-Range` semantics. It cannot be substituted for the required authenticated BFF range proof. |
| Archive, access listing/change, repository control-plane fields | No confirmed Lore browser contract | The control plane contains infrastructure-resource CRUD, but no checked-in browser BFF that maps these generic console actions. Omit until an explicit gateway contract is tested. |

### Authentication and authorization findings

**Pass (source plus executable unit test):** The Auth Gateway produces RS256 JWTs with `kid`, `iss`, `aud`, `sub`, `iat`, `exp`, environment, and a single exact `resources[]` grant. Its authorization tokens have a five-minute lifetime (`control-plane/auth-gateway/src/jwt.rs:21-46,188-230`); the exchange rejects multiple resources and filters grants to `read`/`write` (`src/service.rs:355-412`). The token unit suite passed:

```text
cargo test -p auth-gateway
7 passed; 0 failed; 2 ignored (database-dependent)
```

**Blocker:** This is not a complete, executable browser-to-Lore authorization proof. The claims type has no `jti`, so it does not meet the requested token contract. More importantly, the repository-service interceptor is marked as a placeholder and performs authentication without the repository authorization check (`lore-server/src/auth/jwt_interceptor.rs:70-87`). The ordinary interceptor does check the exact repository resource (`:33-53`), but Phase 0 must prove which interceptor protects every required service on the deployed server. The two database-backed gateway tests were skipped because no disposable test database was configured.

### Deployment and streaming findings

**Blocker:** Native gRPC connectivity, channel reuse, 100-concurrent-read latency, cancellation propagation, range streaming, and memory behavior are unproven. No reachable development deployment or valid test fixture is available in this environment. The checked-in deployment configuration also makes this expected: the dev Lore desired count is zero and JWT signing is disabled (`infra/pulumi/Pulumi.dev.yaml:6,33`).

**Safe fallback, if the gate is later cleared:** Exclude lifecycle and settings controls until the BFF has separately confirmed their gateway-backed semantics. Do not offer a delete button merely because `RepositoryDelete` exists; it is a hard delete. Do not claim an image, PDF, audio, video, or 3D preview until the authenticated streaming endpoint proves its MIME, range, and cancellation behavior.

## Required unblocker

Provide one reachable, isolated development deployment with:

1. A Lore gRPC authority whose running image reports the source/proto pin above (or a supplied replacement pin), plus TLS details usable from the BFF runtime.
2. A running Auth Gateway with JWT signing enabled, a live JWKS endpoint, a disposable test database, and two test principals with distinct repository grants.
3. A test repository containing a deep directory, bounded text, image, audio/video fixture, and a large asset.
4. A confirmed, authorization-safe path for repository listing, ref resolution, **paginated single-directory** listing, logical file descriptors, history, and byte-range streaming — including abort propagation.
5. A corrected or explicitly scoped repository-service authorization path, plus a token contract that includes the required `jti` (or an approved revision of the requirements).

Once available, run the BFF spike and concurrency/cancellation probes against that deployment before implementing the console. The BFF should be a persistent service colocated with Lore; the existing Next.js marketing deployment is not evidence that Vercel route handlers can safely own native gRPC channels or large protected streams.

## Phase 0 requirement table

| Requirement | Verified Lore/gateway method or setting | Test evidence | Implementation decision | Unresolved blocker |
| --- | --- | --- | --- | --- |
| Pin Lore implementation | Lore `3498dd56ad773630ca4871eef2197817dd593382`, `0.8.4-portals.9`; proto `0.1.60` | `git rev-parse` and manifest inspection | Pin any generated client to this source after the gate clears | No TypeScript generation workflow/BFF exists yet |
| Repository/ref/history read surface | `RepositoryList`, `RepositoryGet`, `BranchList`, `RevisionList`, `RevisionInfo` are defined in pinned v1 proto | Source inspection | Use only these confirmed methods; no browser VCS writes | No live contract test; list methods are streams, not cursor APIs |
| Single-directory browse and file descriptor | Only full-tree `RevisionTree` and storage primitives were found | Proto inspection | Do not invent a tree pagination or descriptor API | Required read operation is unconfirmed |
| Scoped JWT | Gateway exchange creates one exact repository `resources[]` grant, five-minute RS256 token | `cargo test -p auth-gateway`: 7 passed, 2 DB tests ignored | Keep Lore JWT server-side in the future BFF | No live gateway/JWKS test; `jti` absent; repository interceptor has an authorization TODO |
| Native gRPC connectivity and load | gRPC endpoints configured in source; dev desired count is zero | Local ports closed; Docker context unavailable; public DNS failed | Do not add BFF client code that claims integration | No reachable development Lore endpoint |
| Safe asset streaming | Lore has a streaming content handler | Source inspection only | Do not expose preview/download endpoints yet | HTTP Range, cancellation, and protected browser streaming are unproven |
| Lifecycle safety | `RepositoryDelete` is hard delete | `repository.proto` source comment and request/response definitions | Omit lifecycle UI until gateway semantics and audit path are tested | Archive/obliterate/reauth/idempotency contract not confirmed |
| Access management | Gateway has relationship storage and read/write exchange | Gateway unit suite and source inspection | Omit browser access-management controls pending an explicit BFF contract | Listing/mutation/audit semantics were not integration-tested |

