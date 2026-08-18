# Lore release process, explained simply

This document explains the Lore release process step by step: what each step
does, why it is necessary, and why it works the way it does. It is written for
anyone who needs to understand the process — not just the person running it.

Companion documents:
- [Production release procedure](../../docs/security/production-release-procedure.md)
  — the operator-facing checklist (this file explains *why*, that file says
  *what to do*).
- [`infra/lore/lore/AGENTS.md`](lore/AGENTS.md) — the release policy for the
  `portalshq/lore` fork itself.
- `infra/lore/versions.yaml` — the release bill of materials (the "what is
  approved" list).

---

## The big picture, in one paragraph

Lore is released from two places on purpose. First, a **human** runs a local
script that builds the two programs, runs all the tests, and proves
everything works — this happens *before* anything irreversible is created.
Then a **tag** is pushed to GitHub, which wakes up a **GitHub Actions
workflow** that repeats the same checks on GitHub's own machines and builds
the actual downloadable files for six different operating systems, signs a
list of their checksums, and publishes them as a GitHub Release. Finally, a
verification script in this repository records the release as "approved" in
`infra/lore/versions.yaml`.

The one-word reason there are two rounds of checks: **trust**. The tag is
permanent (immutable), so problems must be found before it exists. And the
files users download must be built and signed by GitHub itself, so the local
build can never be the source of the release artifacts — it can only be an
early warning system.

---

## The idea that explains everything: the immutable tag

A release tag like `v0.8.4-portals.2` is a name permanently attached to one
specific commit. It can never be moved, deleted, or reused.

- **Why:** anyone who downloads a release must be able to verify they got
  exactly what was approved. If tags could move, a "verified" release could
  silently become a different build later.
- **Consequence:** if something is wrong and you only find out *after* the
  tag exists, the tag is ruined forever. You cannot fix it — you must create
  a new version (`portals.3`, `portals.4`, ...) and start over.
- **Therefore:** all the local checks exist to make the failure happen
  *before* the tag, while it is still free to redo.

---

## Before the release: bumping the version

A release starts with a new version number. The fork uses versions like
`0.8.4-portals.2` — the upstream version, plus a `portals.N` suffix that
counts Portals-specific releases.

The version lives in three places that must all match:

| Place | What it is |
|---|---|
| `Cargo.toml` | The Rust workspace version — what the build reports |
| `lore-capi/lore.h` | A C header that reports the same version |
| `Cargo.lock` | The lock file, which records every crate's exact version |

One command updates all three at once, so they cannot drift apart:

```bash
scripts/bump-release.sh v0.8.4-portals.3
```

- **Why the lock file matters:** `Cargo.lock` pins the exact version of
  every dependency. The release builds use `--locked`, which refuses to
  build if the lock file doesn't match the manifests. If you bump the
  version in `Cargo.toml` but forget the lock file, every `--locked` build
  fails — everywhere, including CI. This exact mistake happened once; the
  bump script exists so it cannot happen again.

---

## Part 1: the local release gate

Run from the `lore` repository on the release branch:

```bash
scripts/release-local.sh v0.8.4-portals.2
```

This is the human's pre-flight check. It is deliberately strict. Every check
is a cheap way to avoid an expensive mistake. In order:

| # | Step | What it does, plainly | Why it's necessary | Why it works this way |
|---|---|---|---|---|
| 1 | Check the tag format | The argument must look like `vX.Y.Z-portals.N` | Garbage input shouldn't start a release | A simple pattern check stops typos immediately |
| 2 | Check tools exist | `cargo`, `git`, `uv` must be installed | The rest of the script needs them | Fail before doing anything, not halfway through |
| 3 | Check 12 GiB free disk | Building Lore is heavy | A full build can fill a small disk and corrupt caches | The disk check is nearly free and runs first |
| 4 | Check tag matches version | The tag's version must equal the version in `Cargo.toml` | The tag must describe exactly what is built | One number, two spellings of it — the script forces them to agree |
| 5 | Check branch name | The release must run on branch `0.8.4` (the version's base) | A release must come from its own branch, not a random one | The branch is named after the upstream version on purpose |
| 6 | Check remote | `origin` must be `portalshq/lore` | The fork's releases must never go to a different repository | The script refuses to run if it could push elsewhere by accident |
| 7 | Fetch latest | `git fetch origin 0.8.4 --tags` | The local copy might be stale | Releasing from outdated code is a silent mistake |
| 8 | Check branch is current | Local branch must contain the latest remote commit | You must release the newest state of the branch | If you're behind, your "release" is secretly older than what's on GitHub |
| 9 | Check clean tree | No uncommitted changes, no untracked files | The release must be exactly the committed code | Uncommitted edits would build something nobody can reproduce |
| 10 | Check tag is new | The tag must not already exist | Tags are immutable — a reused tag is fraud | Local check first; remote check comes later at publish time |
| 11 | Check lock file | `cargo metadata --locked` must succeed | The lock file must match the manifests before a long build | Fails in seconds with a clear message instead of after a 30-minute build with a confusing one |
| 12 | **Build** | `cargo build --locked --release` of `lore` and `loreserver` | You must prove the code compiles as a release build | `--locked` guarantees the exact locked dependencies; `--release` matches what users get |
| 13 | **Run Rust tests** | `cargo test --locked --release` on `lore-credential` and `lore-server` | These are the security-sensitive crates — auth and the server | Tests must run against the release build, not the debug build |
| 14 | **Run smoke tests** | `scripts/run-smoke-tests.sh` | Real CLI-vs-server integration across dozens of scenarios | The smoke suite exercises the actual built binaries end to end, split into batches to bound disk usage |
| 15 | Print versions | `lore --version` and `loreserver --version` | Prove the binaries report the release version | If the version string is wrong, the release is mislabeled |

If all of this passes, the script prints:

```
Local release gate passed for v0.8.4-portals.2. Re-run with --publish after review.
```

Nothing has been pushed. Nothing is permanent. The human now looks at the
result and decides.

---

## Part 2: publishing (the `--publish` run)

```bash
scripts/release-local.sh v0.8.4-portals.2 --publish
```

Publishing **reruns every gate from Part 1** and then adds:

| # | Step | What it does, plainly | Why it's necessary | Why it works this way |
|---|---|---|---|---|
| 16 | Check `gh` and login | The GitHub CLI must exist and be logged in | The operator must be a real, authenticated GitHub user | A tag pushed by an unauthenticated script is a supply-chain hole |
| 17 | Check remote tag | The tag must not exist on GitHub yet | Someone else may have already published it | Local check (step 10) and this remote check together close the gap |
| 18 | Push the branch | `git push origin HEAD:refs/heads/0.8.4` | The tagged commit's branch must be on GitHub | The tag alone would dangle without the branch |
| 19 | Create the tag | `git tag -a v0.8.4-portals.2 -m "..."` | The annotated tag names the exact commit being released | Annotated tags carry who/when/why — plain tags don't |
| 20 | Push the tag | `git push origin refs/tags/v0.8.4-portals.2` | This is the moment the release becomes real | Pushing the tag is what wakes up GitHub Actions |

That push is the point of no return. From here on, everything is automated.

---

## Part 3: what GitHub Actions does (`.github/workflows/release.yml`)

Pushing a tag matching `v*-portals.*` triggers the `Release` workflow. It has
three jobs, each waiting for the previous one.

### Job 1: `test` — "prove the source is good, on GitHub's machines"

| Step | What it does, plainly | Why it's necessary | Why it works this way |
|---|---|---|---|
| Checkout the tag | Get the exact source of the tag | Builds must use the tagged commit | The tag is the only thing CI trusts |
| Install tools | Rust stable, Python, `uv` | The build and smoke tests need them | Pinned versions make CI reproducible |
| Verify tag vs version | The pushed tag must equal the version in `Cargo.toml` | Same check as local step 4, repeated | If the tag and manifest disagree, nothing should be built from it |
| Build | Same `--locked --release` build as local step 12 | Prove the tagged source compiles on GitHub's Linux machines | This repeats the local build on a clean machine — if it builds for you but not on a fresh runner, something is wrong with your machine |
| Rust tests | Same tests as local step 13 | Prove the security-critical crates pass on Linux | Local ran on macOS; CI runs on Linux — two different environments agreeing |
| Smoke tests | Same suite as local step 14 | Prove CLI + server work together on Linux | Runs faster than locally because CI runs batches in parallel |

**Why repeat everything?** The local gate ran on *your* machine. CI runs the
same thing on a *fresh* machine that GitHub controls, from the exact tagged
source. Two independent machines agreeing is the whole point. This is not
wasted work; it is the definition of verification.

### Job 2: `build` — "make the actual download files"

The release must work on every platform users use, so this job runs six
parallel builds, one per target:

| Target | Why it exists |
|---|---|
| `x86_64-unknown-linux-gnu` | Standard Linux (most servers, CI, containers) |
| `aarch64-unknown-linux-gnu` | ARM Linux (Graviton, Raspberry Pi-class servers) |
| `x86_64-apple-darwin` | Intel Macs |
| `aarch64-apple-darwin` | Apple Silicon Macs |
| `x86_64-pc-windows-msvc` | Standard Windows |
| `aarch64-pc-windows-msvc` | ARM Windows |

Each build uses `--locked --profile release-lto` — the same locked
dependencies, but with link-time optimization for smaller, faster binaries.
Each result is packed: `.tar.gz` on Unix, `.zip` on Windows.

- **Why LTO instead of plain `release`?** LTO is a compile-time
  optimization that produces better binaries. CI uses it for the shipped
  artifacts; the local gate uses plain `release` to keep local builds fast
  and equivalent in behavior.
- **Why can't the local machine do this?** It could build its own platform,
  but not Windows or ARM Linux. Only GitHub's hosted runners can.
- **Why doesn't this job reuse the `test` job's build?** Different profiles
  (`release` vs `release-lto`), different targets, and an independent build
  is itself a check. Sharing would save ~10 minutes but remove the
  "two machines agree" property.

### Job 3: `release` — "sign and publish"

| Step | What it does, plainly | Why it's necessary | Why it works this way |
|---|---|---|---|
| Collect artifacts | Download everything the build job made | The release needs all six platforms' files | Nothing is signed until every build succeeded |
| Copy installers | Add `install.sh` and `install.ps1` | Users need a way to install | The installers are part of the release, so they're signed too |
| Create `SHA256SUMS` | Hash every file into a manifest | Users must be able to verify downloads | A hash proves a downloaded file is byte-for-byte the released one |
| Sign the manifest | `cosign sign-blob` with GitHub OIDC/Sigstore | Prove the manifest came from this repo's CI | GitHub's identity is used as the signer — no private keys stored anywhere |
| Create the release | `gh release create` with `--verify-tag` | Publish the files with the tag's name | `--verify-tag` refuses if the tag doesn't match the release name |

When this finishes, the GitHub Release page exists with the signed
`SHA256SUMS` and its signature. **This is the only official source of
release files** — the installer downloads from here, never from a branch
archive.

---

## Part 4: after CI — promoting the release

The GitHub Release exists, but Portals doesn't trust it yet. A human must
promote it, from the parent repository (`portals-cloud`):

```bash
infra/pulumi/scripts/verify-and-promote-lore-client-release.sh v0.8.4-portals.2
```

| Step | What it does, plainly | Why it's necessary | Why it works this way |
|---|---|---|---|
| Resolve the tag | Find the exact commit the tag points to | "v0.8.4-portals.2" must mean one specific commit | The tag is the immutable identity |
| Verify checksums & signature | Download and check `SHA256SUMS` and the signature | Only files signed by the workflow are acceptable | This is the trust anchor: the signature, not the name, proves authenticity |
| Record in `versions.yaml` | Write `source_commit`, tag, checksums, signature URLs | `versions.yaml` is the approved list — the bill of materials | Hand-editing is forbidden; only the verified script may write it |
| Commit the gitlink | Update the `infra/lore` submodule pointer in the parent repo | The parent repo must reference the exact approved Lore commit | A submodule pointer is the parent's "this is the Lore we use" record |

Then the `versions.yaml` update and the submodule update are committed
together. Finally, **Nap** (the product that embeds Lore) is updated to pin
this exact Lore version and its checksum, and a new Nap release is made.

**Why does the installer matter?** The installer receives the pinned
`SHA256SUMS` digest from Nap. It must refuse to run if the manifest is
missing or mismatched, and must verify every downloaded archive before
extracting. The signed manifest is therefore a *runtime* trust anchor, not
just paperwork.

---

## Why so much duplication? (the honest answer)

The same build, tests, and smoke suite run in three places. That is
intentional, and each repetition has a different job:

| Where | What it catches |
|---|---|
| Local gate (your machine, macOS) | Problems before the irreversible tag — while redoing is free |
| CI `test` job (GitHub, Linux) | Problems the local machine's environment hides; proves builds are reproducible on a fresh machine |
| CI `build` matrix (6 targets) | Platform-specific problems only real target machines can show |

What is *not* duplicated: the artifacts. Only the CI build's outputs are
signed and shipped. The local build exists purely as an early warning
system — its output is never published anywhere.

---

## Plain-language glossary

| Term | Meaning |
|---|---|
| **Tag** | A permanent name for one commit. Cannot be changed. |
| **Immutable** | Cannot be modified or deleted. Applied to release tags on purpose. |
| **`Cargo.lock` / lock file** | The exact list of every dependency version. `--locked` means "build only what the lock file says". |
| **`--locked`** | A Cargo flag that fails the build if the lock file and manifests disagree, instead of silently updating the lock file. |
| **Release profile / LTO** | Build settings. `--release` is the standard optimized build; `release-lto` adds link-time optimization on top. |
| **`SHA256SUMS`** | A text file listing each file's SHA-256 hash — the checksum manifest. |
| **Sigstore / OIDC signing** | Signing with GitHub's own identity, so no private key has to be stored anywhere. The signature proves "GitHub's workflow produced this". |
| **Smoke tests** | Integration tests that run the real CLI against a real server and exercise actual workflows. |
| **Bill of materials (`versions.yaml`)** | The approved list: which Lore CLI, server image, and Nap binary are allowed together. |
| **Gitlink / submodule pointer** | The parent repository's record of which exact commit of the Lore submodule it uses. |
| **`portals.N` suffix** | The Portals-specific release counter. `portals.1`, `portals.2`, ... each tag is a fresh, permanent release. |
