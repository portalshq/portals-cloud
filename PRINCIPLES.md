# Platform Architecture Principles

**Status:** Foundational
**Applies to:** All Portals products, services, SDKs, infrastructure, and AI agents

---

# Purpose

This document defines the architectural boundaries of the Portals platform.

Every system in the company should be designed to reinforce these boundaries rather than duplicate responsibilities.

Whenever new functionality is proposed, the first question should be:

> **Which layer owns this capability?**

If ownership is ambiguous, the architecture should be refined before implementation.

---

# Platform Philosophy

The Portals platform is built from independent layers.

Each layer owns a single domain of responsibility.

Higher layers compose lower layers.

Lower layers never understand higher-level product concepts.

The architecture intentionally favors composition over duplication.

---

# Platform Stack

```
Applications

↓

Portals

↓

NAP

↓

Lore

↓

Storage
```

Each layer exists for a different purpose.

---

# Lore

Lore is the version control engine.

Lore owns repository semantics.

Lore is responsible for:

* repositories
* commits
* branches
* merges
* synchronization
* object storage
* repository persistence
* repository history
* distributed collaboration

Lore is **not** aware of narratives, entities, workflows, AI, or media.

Lore is infrastructure.

---

# NAP

NAP is the Narrative Addressing Protocol.

NAP provides domain semantics on top of Lore.

NAP is responsible for:

* stable addressing
* repository identities
* manifests
* asset resolution
* content addressing
* resolvers
* workflow primitives
* entity identities
* references
* asset metadata
* repository orchestration

NAP does **not** implement version control.

NAP never duplicates Lore.

NAP treats Lore as the authoritative repository engine.

---

# Portals

Portals is the product layer.

Portals provides creator workflows.

Portals owns:

* editing
* collaboration
* AI workflows
* production tooling
* cloud services
* authentication
* user experience
* project management
* application APIs

Portals does not implement repository semantics.

Portals builds upon the NAP SDK.

---

# Architectural Responsibilities

## Lore owns repository semantics.

Examples:

* commits
* branches
* synchronization
* object persistence

---

## NAP owns narrative semantics.

Examples:

* identities
* manifests
* resolver
* addressing
* repository orchestration

---

## Portals owns product semantics.

Examples:

* editing
* collaboration
* cloud workflows
* AI orchestration
* creator experiences

---

# Separation of Concerns

Each layer should become smaller as the platform matures.

Responsibility should never migrate upward simply because another layer already exists.

For example:

Repository synchronization belongs in Lore.

Not in NAP.

Not in Portals.

Likewise:

Narrative addressing belongs in NAP.

Not in Lore.

Not in Portals.

Likewise:

Collaboration UX belongs in Portals.

Not in NAP.

Not in Lore.

---

# The Repository Model

There is exactly one repository implementation.

That implementation is Lore.

NAP never provides an alternative repository implementation.

Applications never bypass Lore.

Every repository operation ultimately executes against Lore.

---

# Server Topology

Repository behavior is independent of deployment.

A Lore repository may be hosted by:

* a local Lore daemon
* Portals Cloud
* an enterprise deployment
* a self-hosted server

These are deployment topologies.

They are **not** different repository implementations.

Applications should not distinguish between them.

---

# Repository API

Applications communicate only with the NAP Repository API.

Applications never:

* invoke Lore CLI
* generate Lore configuration
* manage Lore processes
* generate certificates
* manage synchronization directly

NAP owns repository orchestration.

---

# Local and Remote

Local and remote are deployment choices.

Repository behavior remains identical.

The only changing component is the server provider.

```
Repository

↓

Lore

↓

Server Provider

    Local

    Portals Cloud

    Enterprise

    Custom
```

---

# Server Providers

NAP supports multiple Lore server providers.

The server provider determines where repositories are hosted.

The repository implementation never changes.

Providers may include:

* Local Lore
* Portals Cloud
* Enterprise Lore
* Custom Lore Server

The provider is infrastructure.

It is not part of repository semantics.

---

# NAP Local Runtime

NAP owns the complete lifecycle of local Lore deployments.

Responsibilities include:

* installation
* configuration
* certificate generation
* daemon startup
* daemon monitoring
* health checks
* upgrades
* diagnostics

Applications never manage these concerns.

---

# Repository Provisioning

Repository creation always occurs through NAP.

NAP provisions repositories using the configured server provider.

Applications never provision repositories directly.

---

# Addressing

NAP provides stable addressing.

Repositories represent universes.

Resources are addressed within repositories.

Conceptually:

```
Repository

↓

Branch

↓

Commit

↓

Resource
```

For example:

```
nap://starwars/character/luke

nap://starwars@episode3/character/luke

nap://starwars@episode3:commit/character/luke
```

Branches represent semantic timelines.

Commits represent immutable historical states.

---

# Identity

Identity is independent of deployment.

A repository maintains the same identity regardless of where it is hosted.

Repositories may move between:

* local machines
* Portals Cloud
* enterprise deployments
* self-hosted servers

Changing infrastructure must never change repository identity.

Likewise, changing deployment must never require changing resource addresses.

---

# Storage

Storage is an implementation detail.

Repositories reference assets.

Assets are resolved through NAP.

Storage providers remain interchangeable.

Possible providers include:

* filesystem
* object storage
* Git LFS
* NAS
* cloud storage
* future implementations

Applications never depend on storage implementations.

---

# Publish

Publish is an application semantic.

Applications invoke:

```
publish()
```

The repository provider determines how publish is executed.

Examples:

Local

* commit

Cloud

* commit
* synchronize

Applications never distinguish between implementations.

---

# Architectural Invariants

The following rules should never be violated.

1. Lore is the only repository implementation.

2. Lore owns repository semantics.

3. NAP owns narrative semantics.

4. Portals owns product semantics.

5. Applications communicate only through the NAP SDK.

6. Applications never manage Lore directly.

7. Repository behavior must remain independent of deployment.

8. Stable identities must survive deployment changes.

9. Repository addresses must remain stable regardless of storage location.

10. Storage providers remain interchangeable.

11. Higher layers never duplicate lower-layer responsibilities.

12. Every capability has exactly one architectural owner.

---

# Architectural Test

Whenever a new feature is proposed, answer these questions before implementation.

**Does Lore already own this?**

If yes, implement it in Lore or use existing Lore functionality.

**Does this define narrative semantics?**

If yes, it belongs in NAP.

**Does this define a creator experience or application workflow?**

If yes, it belongs in Portals.

If ownership is unclear, refine the architecture before writing code.

---

# Long-Term Vision

The platform intentionally separates infrastructure from domain semantics and product semantics.

* Lore provides repository semantics (commits, branches, synchronization, object storage).
* NAP provides domain semantics (addressing, manifests, resolver, assets, identities, workflow primitives).
* Portals provides product semantics (editing, collaboration, AI workflows, cloud services).

This separation allows every layer to evolve independently while preserving stable interfaces between them.

The goal is not merely modularity—it is long-term architectural clarity.

A change in one layer should rarely require changes in another.

By maintaining strict ownership boundaries, the platform remains extensible, interoperable, and understandable as it grows.

This is the **first document every engineer and AI coding agent reads**. More than a coding standard or style guide, it establishes the mental model for the entire company. Every subsequent architectural decision—from the NAP SDK to Portals Studio to future services—can be evaluated against these principles, helping prevent responsibility creep and preserving clear ownership boundaries as the platform evolves.
