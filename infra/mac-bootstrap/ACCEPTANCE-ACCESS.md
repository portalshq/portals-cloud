# Access for autonomous production acceptance

Reviewed 2026-10-18. This is the one-time handoff for completing the tests in
[PRODUCTION-ACCEPTANCE.md](PRODUCTION-ACCEPTANCE.md). Store secrets in the
service account's private files or a vault integration; provide file paths and
non-secret resource IDs in chat. Do not paste keys, database URLs, recovery
keys, passwords, refresh tokens or browser cookies into chat.

## Access already confirmed

- SSH alias `andresb` works. The exact installed `remote-ops-gate.sh status`
  and `preflight` invocations work noninteractively as `portals-svc`.
- The last status check showed Auth and Lore healthy and Caddy running;
  release preflight passed.
- PX and Lore release repositories are public. The current local
  `gh auth status` check reports the `DigitalCreationsCo` token is invalid, so
  GitHub Actions settings, remote workflow status and PR operations cannot be
  verified or changed through this CLI session. Reauthenticate with a
  credential that can read both repositories and open a PR in Cloud; do not
  paste the token into chat. No workflow or secret has been installed remotely.
- The client machine has `gh`, `cosign`, AWS CLI, Node, `grpcurl`, `jq` and
  Vercel CLI. Their presence does not establish provider-session validity.
- `frontend/.vercel/project.json` links `portals-cloud-frontend`. A prior
  `vercel whoami` identified the `digitalcreationsco` account, but current
  Vercel API checks fail with DNS `ENOTFOUND api.vercel.com`; do not assume
  the session or project permissions are usable until `vercel whoami` and
  project environment/log/cron reads succeed again.
- The local AWS CLI session is expired (`GetCallerIdentity` requested
  reauthentication). Refresh the intended acceptance/restore-role session.
  This says nothing about the separate credential file used by the running
  Lore container.
- Docker and sealed Auth/Lore/AWS files were configured on the Mac. The current
  restricted SSH gate does not grant arbitrary service-user commands or
  access to read/use those settings through a new acceptance script.

The previous invocation `sudo ... /bin/sh .../remote-ops-gate.sh status` failed
because the installed sudoers rule permits the executable path itself, not an
arbitrary interpreter invocation. Use:

```sh
ssh -T andresb 'sudo -n -u portals-svc /Users/portals-svc/portals/infra/mac-bootstrap/scripts/remote-ops-gate.sh status'
ssh -T andresb 'sudo -n -u portals-svc /Users/portals-svc/portals/infra/mac-bootstrap/scripts/remote-ops-gate.sh preflight'
```

Do not mistake that mismatch for a missing sudo grant. This grant still covers
only its named actions; it cannot run deployment, fixture-creation or recovery
commands.

## One-time execution arrangement

Choose one service-account access model:

1. A dedicated SSH operations key with an ordinary shell as `portals-svc`,
   authorized only from the intended client/network, without root sudo. This
   lets acceptance scripts read service settings in memory, create disposable
   fixtures, run Compose, and manage test tunnels. It grants access to that
   account's application secrets and Docker workloads; Docker access must be
   treated as privileged. Do not claim it isolates secrets from the Docker
   administrator.
2. Extend the existing forced-command dispatcher with reviewed fixed actions
   for deployment, fixture lifecycle, live acceptance, tunnel supervision and
   isolated recovery. Validate parameters against the pinned release and
   fixture manifest, and emit only sanitized reports. Protect the dispatcher
   and invoked code from modification by the invoking key/account. It must not
   accept arbitrary shell commands or use an unrestricted root sudo grant.

The first model has less setup and gives the agent the flexibility needed to
debug. The second preserves the narrow command boundary but requires each
new diagnostic or test action to be prepared and installed. Cached interactive
sudo is temporary and terminal-dependent; it is not a durable execution path.
A one-time administrator action is needed to install whichever extension is
chosen. Do not grant `NOPASSWD: ALL`.

Client-side temporary DNS/port-443 routing needs its own narrow administrator
helper, with a fixed marker, bounded lifetime and idempotent cleanup. An
alternative is an isolated test VM/container with its own resolver and network
namespace, using the correct platform binary. Use native macOS acceptance as
well when proving the macOS customer's keychain/client behavior.

## Provider and fixture inputs

| Area | Access/values needed | Work the agent can then perform |
| --- | --- | --- |
| Release | Existing GitHub session; intended release branch; permission to open the verified promotion PR. Merge must satisfy repository rules. | Correct CI source/signer checks, verify published artifacts, prepare/promote the exact client pair, wait for identified runs/checks, stage the merged bundle. |
| Mac services | Service-user execution model above; permission to use existing private env files and Docker, read sanitized logs, restart only the listed Portals services, preserve verified rollback. | Complete live test drivers, fix runtime endpoint/config mismatches, deploy pinned images, run Auth lifecycle probes and collect evidence without printing secrets. |
| Pinggy/DNS | Ability to run/reconnect the saved TCP and UDP commands as `portals-svc`; current endpoint output; verified known-hosts file; permission for temporary client routing and cleanup. Cloudflare zone-scoped DNS token only if DNS-01 renewal or controlled DNS changes are needed. | Establish both routes, record expiring host/ports, validate TLS/SNI and QUIC, restore temporary configuration. Public production DNS does not need to move for test tunnels. |
| OIDC | Existing ZITADEL issuer/client/callback config; one dedicated non-admin human test user; access to its sign-in method through a controlled test browser/mailbox. | Complete browser authorization-code/PKCE, claims/TTL, callback negatives, refresh/replay, logout, key overlap and audit checks. Admin console access alone is not a browser-user fixture. |
| Auth/PX/Lore | Permission for host-side tests to use the internal admin credential already in `auth.env`; permission to create two isolated test principals, API keys and Lore partitions; a writable isolated PX home/keychain/profile; approved native PX/Lore binaries. | Create reciprocal known-existing repositories/entities, issue disposable credentials, test identity/read/write/denial/renewal/QUIC, revoke keys and clean up. The operator need not invent subject/repository IDs or test keys manually. |
| AWS runtime | Permission to use Lore's scoped credential file in a host-side test; account/region, configured S3 bucket and four DynamoDB table/index names; a controlled existing unrelated resource for denial tests. | Verify the actual workload identity and allowed/denied operations, then prove real Lore persistence through client operations. Do not expand the workload identity to perform administrative restores. |
| AWS recovery | A separate temporary acceptance/restore role limited to the named source stores and tagged/prefixed isolated restore targets, plus IAM/policy read access for effective-permission review. It needs the actual backup/PITR, restore, target configuration, verification and cleanup actions used by the selected drill. | Create/check/delete isolated S3/DynamoDB recovery targets, restore known fixtures, boot an isolated Lore instance, verify content/state, retain audit evidence. Policy review must account for bucket policies, boundaries and organization restrictions where applicable. |
| Neon | The Auth and application/CRM project IDs, production branch IDs, safe restore points; Neon API access scoped as narrowly as the provider supports to create/read/delete isolated branches, plus TLS DB connections for those branches. For production, read-only schema inspection suffices. | Clone/restore both databases, verify ordered migrations and schemas, test Auth persistence and application memberships/invitations/outbox on isolated branches. A SQL connection alone cannot exercise provider branch/restore APIs. |
| Vercel/invitations | Project/team/deployment IDs and access to deployment settings/logs/cron history; the real deployed frontend and Backend API destinations; private cron/shared/email secrets available to the test process; two test customer accounts/pilots; controlled recipient mailboxes. | Verify the two invitation contracts separately, delivery/acceptance/expiry/replay, target authorization and cross-account/pilot denial through the deployed routes. Controlled mailbox read access is needed to consume the one-time link. |
| CRM | Exact provider/workspace, scoped credential, intended active scheduler/outbox, isolated contact/company/deal targets or approval to create clearly tagged synthetic records; read/write/cleanup access and webhook test secret if testing callbacks. | Submit one synthetic lead, trace Neon outbox to the real CRM, prove repeat-event idempotency, controlled failure/retry, cron authorization/delivery, webhook validation and cleanup. A mocked CRM test does not supply this evidence. |
| Backup/host recovery | Off-Mac encrypted backup location; ability for the restore process to retrieve/decrypt test recovery material; a clean spare VM/host or isolated Compose project; named AWS/Neon restore targets; approved maintenance window, budget, RPO/RTO. | Implement real backup/restore drivers, reconstruct Auth/Lore from verified material, measure data loss/recovery time, test tunnel/DNS/certificate recovery, clean up targets. Existing backup scripts cover manifests only. |

Keep signing private keys, peppers and provider credentials on their owning
host/vault. Acceptance scripts can consume them there and return subjects,
digests, non-sensitive fixture IDs and outcomes. A developer should not need to
copy a production signing key to the client machine to test a token signature;
JWKS supplies the public key.

### ZITADEL test identity handoff

The issuer's public discovery/JWKS and Auth's `StartAuthSession`/PKCE contract
were verified previously. A real browser callback, token issuance and refresh
were not. This turn found no ZITADEL CLI, no OIDC/ZITADEL credential in the
agent environment, and no authenticated ZITADEL console session: the console
redirects to its login-name prompt. No test user or management credential was
created.

Create one dedicated human user in the same ZITADEL organization as the Auth
Gateway OIDC application. Give that person **no ZITADEL administrator role**
and no application role unless the application explicitly requires one for
login. Use a controlled mailbox/sign-in factor available for the acceptance
browser, and verify the account can sign in before starting the suite. Keep the
account distinct from the administrator and from real customers. Record its
opaque ZITADEL user ID and expected Auth subject in the private acceptance
profile; do not put its password, recovery codes or login link in the profile
or repository.

The preferred setup is for the organization owner to create this one fixture
through the ZITADEL Console and retain normal MFA on the administrator. This
does not give the test user management rights. If automated creation is later
needed, the documented User API requires `user.write`; ZITADEL's standard
`ORG_USER_MANAGER` role manages users and their authorizations across the
organization, rather than providing a project-only user-creation role. Do not
grant that broad role to the acceptance runner just to avoid creating one test
identity manually. [ZITADEL Create User API](https://zitadel.com/docs/reference/api/user/zitadel.user.v2.UserService.CreateUser),
[administrator scopes and roles](https://zitadel.com/docs/guides/manage/console/administrators).

For the live browser test, the runner can create the Auth login session and
open its one-time ZITADEL URL, but the test user must complete the normal
credential/MFA step in the controlled browser unless a dedicated approved
test-browser sign-in is already available. This does not require weakening
administrator MFA or using an administrator as the test subject. Afterward,
verify the Auth subject matches the fixture, the token TTL is 900 seconds, and
refresh/replay/logout/audit checks pass. Revoke/delete the fixture account or
disable it after evidence is collected, following the owner's test-account
retention policy.

## Small amount of guidance needed

Record these non-secret decisions once in a private acceptance profile:

- Environment and allowed fixture namespace, for example `acceptance-<run-id>`;
  permitted service restarts/config changes and which accounts/data are excluded.
- Source projects/branches/resources and the approved isolated destinations.
  If no fixtures exist, authorize creation inside that namespace and let the
  agent create the identities/repositories and record their actual IDs.
- Intended CRM owner: frontend daily Vercel job, or the separately deployed
  BackendService path. State whether both are intentionally active; they use
  different outboxes.
- Recovery RPO/RTO, permitted outage window, maximum temporary-resource cost,
  resource lifetime and cleanup rules. Provider restores/storage may bill;
  a strict zero-spend rule can limit which full restore drills are possible.
- Where evidence should be stored and retained. Use private mode-600 reports
  with UTC timestamps, exact artifact digests, case results and cleanup status.

Suggested private layout on the service host (create through the service-user
execution path; none of these files are checked in):

```text
/Users/portals-svc/secrets/acceptance.env        # new test-only provider credentials/references
/Users/portals-svc/.config/portals/acceptance.json # non-secret fixture/resource/policy profile
/Users/portals-svc/acceptance-evidence/<run-id>/   # sanitized private evidence
```

Reuse `portals-release.env`, `secrets/auth.env`, `secrets/lore.env`,
`.config/portals/lore-aws.env` and `secrets/caddy.env` at their existing paths;
do not duplicate their values into new files. Keep references in the acceptance
profile. Client fixtures use a separate temporary home/profile and remove
their routing/credentials afterward. Continue logging SSH activity in ignored
`infra/mac-bootstrap/ssh-activity.log`, with no secret contents.

## Limits of unattended completion

Access enables the remaining implementation work; it does not mean the live
drivers already exist. The OIDC script currently covers provider/session-start
smoke only. AWS restore, Neon invitation, live CRM and full host recovery need
their live drivers, fixtures, cleanup and report assertions completed. The
agent should implement these instead of asking the operator to write tests.

Browser MFA/hardware-key challenges may require a person once unless the
dedicated test identity has an approved automated sign-in method. Never weaken
real customer/admin MFA to make a fixture unattended.

A FileVault-protected cold reboot waits for an authorized preboot unlock before
normal macOS/SSH/Docker can run. Plan an operator to unlock the Mac for that
drill, or an independently approved supported recovery method. Post-unlock
Docker startup and service recovery still have to be verified. No amount of
SSH sudo access guarantees recovery while the boot volume remains locked.

Repository required reviews and provider ownership/recovery controls remain
their own gates. The agent can prepare, run, diagnose and report every allowed
test, but must label a human-dependent step pending until it actually occurs.
