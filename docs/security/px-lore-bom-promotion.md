# PX/Lore BOM promotion and verification

Reviewed against the working tree and GitHub documentation on 2026-10-18.
This is the client-artifact promotion procedure for the current Mac/Docker Hub
deployment. Runtime acceptance is defined in
[PRODUCTION-ACCEPTANCE.md](../../infra/mac-bootstrap/PRODUCTION-ACCEPTANCE.md).
It is separate from the npm package release engine in the root `RELEASE.md`.

## One verified client BOM, plus image history

| Record | Question it answers | Contents and consumer |
| --- | --- | --- |
| `infra/lore/versions.yaml` | Which exact versions form the selected release, and what verified them? | PX/Lore client pins and their signatures/checksums/source evidence now live together with the BOM. Pulumi compares the evidence to the selected pins. |
| `infra/lore/verified-dockerhub-images.json` | Which container digests passed the Docker Hub checks? | A digest-keyed ledger including platform, source/build identity, signature, vulnerability scan and provenance references. Used for both deployment and a verified rollback image. |
| Live acceptance reports | Does this exact release function in the target environment? | Actual browser login, PX authorization/renewal, QUIC, provider operations and restores. Artifact verification does not supply these results. |

The old separate `verified-releases.json` duplicated the selected PX/Lore
client pair. Schema 3 embeds that evidence under `px-client.verification`; the
historical `.8.19` record was migrated there and is intentionally rejected for
the currently selected Lore `.10` because it verified Lore `.9`. A new
promotion replaces the embedded evidence only after the verifier succeeds.
Container image evidence remains in a separate digest history because several
old digests must remain available as rollback candidates.

Receipt JSON is a verification report, not a signature by itself. Trust comes
from checking the actual Sigstore bundles/registry signatures against the
expected identity and source, preserving the CI evidence, and controlling
changes to the release files. Editing a `signatureVerified` boolean does not
verify an artifact. Existing deployment consumers compare receipt fields but
do not rerun every cryptographic check on each deployment.

This change unifies the PX and Lore client selected versions and verification
evidence in one `versions.yaml`. It does not collapse live acceptance into
artifact verification: a valid signature proves the published bytes and
identity, while acceptance still proves behavior against deployed services.
`verified-dockerhub-images.json` remains a rollback ledger of image digests.

## What the proposed workflow actually does

Source: `.github/workflows/promote-px-release.yml` and
`infra/pulumi/scripts/verify-and-promote-px-release.sh`.

1. PX's `cli-release` workflow builds and signs the complete artifact set,
   checks out the shared Cloud verifier from `PORTALS_CLOUD_RELEASE_REF`, and
   runs its `--verify-only` mode against the local signed assets. This checks
   signatures, every checksum, release metadata, the tag/source-commit binding,
   and the referenced Lore manifest before any GitHub Release is created.
2. Only if that gate passes does PX publish the release. Asset overwrite is
   explicitly disabled (`overwrite_files: false`); duplicate or partially
   published tags fail closed instead of replacing assets. The action also
   fails if its asset glob matches nothing.
3. After publication, PX dispatches the single Cloud workflow
   `promote-px-release.yml` with the release tag, target `release/*` branch,
   and unique PX run/attempt ID. A human can also dispatch that workflow
   manually to retry promotion without re-publishing assets.
4. Cloud downloads the published PX release and independently repeats the
   checksum-manifest and metadata signature checks and checks the downloaded
   PX artifact checksums. This detects publication/transfer discrepancies.
5. It verifies the referenced Lore checksum manifest's signature/digest and
   compares its source/version/install metadata with the independently
   promoted top-level Lore entry. It does not rebuild Lore or download all
   Lore binaries again.
6. The recorder writes the PX BOM fields and its verification evidence into
   the same `versions.yaml` file.
7. The job opens/updates a PR containing only `versions.yaml`. It does not
   change release approval, merge the PR,
   deploy services, execute runtime acceptance, or update a local checkout.

The workflow must first be merged to the Cloud default branch so GitHub
accepts workflow dispatch, and its intended copy must exist on the target
release branch. The PX repository also needs these two Actions secrets and
one repository variable:

- `PORTALS_CLOUD_RELEASE_APP_ID`
- `PORTALS_CLOUD_RELEASE_APP_PRIVATE_KEY`
- `PORTALS_CLOUD_RELEASE_REF` (for example `release/mac-bootstrap-20261002`)

The GitHub App must be installed on `portalshq/portals-cloud` with Actions
write permission. The token is short-lived and restricted to that repository.
These are activation prerequisites; local edits alone do not trigger a
published release.

## Triggering and waiting

PX publication automatically dispatches the central Cloud workflow through a
short-lived GitHub App installation token restricted to the Cloud repository
and Actions write permission. No copy of the promotion workflow lives in PX;
PX's signed-release workflow calls the shared Cloud verifier before publishing,
then dispatches and waits for Cloud's post-publication BOM workflow. Cloud
independently verifies the release assets. Manual dispatch stays available for
repair/retry.

GitHub requires the dispatchable workflow on the default branch. The selected
release ref must also contain the intended workflow and verifier versions;
merging only to `main` does not update an older release branch.

The PX publisher now waits for the exact Cloud workflow run to finish verifying
the artifacts and opening/updating its PR. These are still separate waits:

- The publishing PX release job must finish producing all signed assets.
- The Cloud promotion run must finish successfully and produce a PR (or an
  explicit verified no-change result).
- The PR's required checks and approvals must complete before merge.
- The merged commit must be fetched into a clean release checkout before
  deployment. The deployer then has its own image/health/rollback checks.

The pre-publication verification runs in the PX release job and blocks the
public release on failure. PX then polls for the Cloud run matching the unique
dispatch ID and uses `gh run watch --exit-status`; a verification or PR-creation
failure there causes the PX job to fail visibly even though the preverified
release assets have already been published. The wait ends after candidate PR creation. It does not wait for
required PR checks/approval, merge, or a local fetch/pull. The generated run name includes
the release tag and target ref, and the caller correlates that name and start
time to find its specific run rather than selecting the newest arbitrary run.

If pre-publication verification fails, no release assets are published. If
the post-publication Cloud check or PR creation fails, keep the immutable
published release and re-dispatch `promote-px-release.yml`; do not rerun the PX
publisher against the same tag because overwriting release assets is disabled.

After installing the corrected workflow on `main` and the intended release
branch, an example operator sequence is:

```sh
gh workflow run promote-px-release.yml \
  --repo portalshq/portals-cloud \
  --ref release/mac-bootstrap-20261002 \
  -f release_tag=v0.9.8 \
  -f target_ref=release/mac-bootstrap-20261002

gh run list --repo portalshq/portals-cloud \
  --workflow promote-px-release.yml \
  --branch release/mac-bootstrap-20261002 --event workflow_dispatch \
  --limit 10 --json databaseId,createdAt,headSha,status,conclusion,url

# Select and verify this dispatch's run ID, then replace RUN_ID below.
gh run view RUN_ID --repo portalshq/portals-cloud
gh run watch RUN_ID --repo portalshq/portals-cloud --exit-status --interval 10

# After inspecting the generated PR, replace PR_NUMBER below.
gh pr checks PR_NUMBER --repo portalshq/portals-cloud --required --watch
```

Do not select the newest run blindly when multiple dispatches are possible.
Match the actor, branch, source SHA, input tag and creation time. A future
dispatch-and-wait wrapper should correlate an explicit request ID/run ID and
propagate failure. `gh run watch --exit-status` reports workflow failure, not
whether runtime acceptance or PR merge succeeded. If the installed CLI cannot
watch with its credential type, poll `gh run view` and require
`status=completed` and `conclusion=success`; a successful dispatch request is
insufficient.

After reviewed merge, fetch the exact merged release commit. Use an isolated
release checkout/worktree when the development checkout is dirty. Verify the
BOM and receipt from the same commit, transfer the verified bundle to the Mac,
then use the documented service changeover procedure and live acceptance.
Do not overwrite the current dirty feature branch with a pull.

## Known limitations to resolve before using this for unattended releases

- **Signer policy:** the PX verifier currently accepts only a tag-ref Lore
  signature. The `.11` release log records a manual-dispatch signature from
  `main`, supported by a source-bound verification path on the release work.
  Reconcile the verifier with that established policy and verify workflow/build
  source commits. Do not broaden the allowed signer with a wildcard merely
  to make the check pass.
- **Source binding:** the current PX recorder validates the metadata source
  commit's shape, but the PX verifier does not independently resolve the PX
  tag and compare its source commit or inspect that source's
  `PINNED_LORE_VERSION`. Add those comparisons before claiming independent
  PX source verification.
- **Verification versus compatibility:** the PR body currently says it records
  a tested pair, although the workflow runs no real PX/Lore integration test.
  Treat it as a cryptographically verified candidate until live acceptance
  evidence is attached. The existing local workflow test checks wiring only.
- **PR checks:** current GitHub documentation says `GITHUB_TOKEN`-created PR
  `opened`/`synchronize`/`reopened` events can create approval-required workflow
  runs. Other event types differ, and pushes made using `GITHUB_TOKEN` do not
  recursively run push workflows. Verify the actual repository behavior;
  explicitly dispatch required validation or use a scoped GitHub App where
  appropriate. PR creation is not evidence that required tests ran.
- **Repository settings:** Actions must be allowed to create PRs and branch
  protection must permit the automation branch. PX and Lore are currently
  public, so downloading their releases needs no new private-repository token.
  If that changes, the Cloud `GITHUB_TOKEN` alone is not cross-repository access.
- **Concurrent targets:** concurrency and the automation branch are currently
  keyed only by release tag, so using the same tag for two release branches
  can conflict. Include the target branch in both identities; different tags
  updating one target branch also require revalidation against its current head.
- **Reproducibility/cost:** action tags and `ubuntu-latest` can change, full
  release downloads consume time/bandwidth, and verification can fail when
  GitHub/Sigstore is unavailable. Pin trusted actions to reviewed commits,
  bound retries/timeouts and retain verification artifacts/run URLs. Existing
  JSON/YAML writes are individually atomic, not a filesystem transaction
  spanning both files; the reviewed Git commit is their shared release unit.

## References

- [GitHub manual dispatch and branch requirements](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
- [GitHub workflow triggering and GITHUB_TOKEN behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
- [GitHub CLI run watch](https://cli.github.com/manual/gh_run_watch)
