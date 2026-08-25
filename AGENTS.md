# Agent Instructions

## Git Commit Attribution

All AI-assisted commits must include attribution for the agent app and model used. This ensures transparency and traceability of AI contributions.

### Required Format

Add the following footer to every commit message when AI assistance was used:

```
Co-Authored-By: <agent-app> (<model>)
```

### Examples

```
feat: add user authentication flow

Co-Authored-By: opencode (nemotron-3-ultra-free)
```

```
fix: resolve race condition in data sync

Co-Authored-By: codex (gpt-4o)
```

```
refactor: extract shared validation logic

Co-Authored-By: devin (devin-1.0)
```

### Agent App Values

Use one of these standard identifiers:
- `opencode` - OpenCode CLI agent
- `codex` - GitHub Copilot / Codex
- `devin` - Devin AI
- `claude` - Claude Code / Claude Desktop
- `cursor` - Cursor IDE
- `windsurf` - Windsurf IDE
- `other` - Any other AI agent (specify)

### Model Values

Use the actual model identifier (e.g., `nemotron-3-ultra-free`, `gpt-4o`, `claude-3.5-sonnet`, `devin-1.0`, etc.)

### When to Apply

Apply this attribution when:
- The agent wrote, modified, or reviewed code
- The agent provided architectural guidance that was implemented
- The agent generated commit messages or PR descriptions
- Any substantial AI contribution to the change

### When NOT to Apply

Do not add attribution for:
- Purely manual commits with no AI involvement
- Commits only updating documentation written by humans
- Routine dependency updates via dependabot/renovate

## Documentation Map — Security & Release

Load only the doc you need. Each link is a standalone topic; do not preload the entire `docs/security` folder.

* **Security contract & invariants** — `docs/security/lore-production-security.md` — endpoint inventory (41337/41339/8084-8087), hop trust (ALB→task `h2c`), token/relationship/API-key contracts, artifact-signing, recovery. Keep `Release checklist` here as the canonical gate; `release-cycle:8` mirrors it for operational use.
* **Reusable runbook (live)** — `docs/security/release-cycle-portals-works.md` — `§0` live snapshot (ACM/Service DNS/Source migration/Receipt ledger/OIDC/Egress/Alarm/Pulumi/Builds/Blocker), `§4` 13-phase procedure, `§8` pre-ingress checklist + E2E matrix, `§11` issues. This is the only live-status file; others point here.
* **Operator procedure (short)** — `docs/security/production-release-procedure.md` — contained foundation, build/tag, Cloudflare/ACM, Cognito login, JWKS, open edge. See `release-cycle:0` for live state; see `release-cycle:4` for phase owners/commands.
* **Execution record (dated, append-only)** — `docs/security/rollout-status-2026-08-10.md` — containment, private foundation, `2026-08-21` migration, `Verified Infrastructure State` dated log. Current state lives in `release-cycle:0`; this file records what was done on each date.
* **Identity & networking** — `docs/security/aws-deployment-identity.md`, `docs/security/egress-risk-acceptance.md`, `docs/security/BUILD_GUIDE.md` — loaded only when touching IAM/OIDC or VPC egress.

Guardrails:
* Never hand-edit `infra/lore/versions.yaml`, `infra/lore/verified-images.json`, `infra/lore/verified-releases.json` — they are written only by `verify-and-promote-*` scripts (`release-cycle: Never hand-edit`).
* `publicIngressEnabled` order is `authGatewayReady` → `securityControlsEnabled` → `releaseGateApproved` → `publicIngressEnabled` last (`lore-production-security`, `release-cycle:6`).