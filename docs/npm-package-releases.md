# npm package releases

All 15 public workspaces in `packages/*` and `packages/stubs/*` use Changesets
and the **Release Engine** workflow (`.github/workflows/release.yml`). Private
frontend and `lib/*` workspaces are not published.

## One-time setup

Use Node 24 and npm 11.15.0 or newer. Log in as an npm maintainer with write
access to the packages and account 2FA enabled:

```sh
npm login --registry=https://registry.npmjs.org/
npm run release:trust                 # Preview all 15 commands, no network writes
npm run release:trust -- --apply      # Configure missing trust connections
npm run release:trust -- --list       # Inspect the resulting connections
```

The setup command uses npm's supported `npm trust` CLI, pauses between requests,
and lets npm handle interactive 2FA. If npm offers to remember 2FA for five
minutes, that can cover the batch. Run the command in an interactive terminal
without piping or redirecting output: npm needs both stdin and stdout attached
to a terminal to open browser 2FA. Setup stops at the first npm error. npm refuses
to overwrite existing trust; inspect an existing connection with `npm trust list
@portalshq/package-name`. If setup stops partway through, the preview prints the
individual commands you can run for the remaining packages.

Every package uses these exact values, also available in each package's npm
**Settings → Trusted publishing → GitHub Actions**:

| Field | Value |
| --- | --- |
| Organization or user | `portalshq` |
| Repository | `portals-cloud` |
| Workflow filename | `release.yml` |
| Environment | `production` |
| Allowed action | `npm publish` |

The old `DigitalCreationsCo/portals-cloud` Git remote redirects to
`portalshq/portals-cloud`. Use the current owner above for npm trust.

The package must already exist on npm. For a new package, first build and check
all packages, then publish that package once with your interactive npm login:

```sh
npm run release:build
npm run release:check
npm publish --workspace=@portalshq/your-package --access=public
```

Then rerun trust setup. Review the selected package and version before this
first publish; npm versions cannot be overwritten.

GitHub must allow Actions to create pull requests. The `production` environment
must exist; its name is part of the npm trust identity. An environment name alone
does not require human approval: configure required reviewers in GitHub if that
is desired. The workflow itself only runs the release job for this repository's
`main` branch, including manual runs.

## Everyday releases

1. Run `npm run changeset`, select changed packages and version bumps, and write
   a summary. Commit the generated `.changeset/*.md` with your code.
2. Merge to `main`. Changesets opens or updates **chore: release packages**, with
   version bumps, changelogs, internal dependency updates, and the npm lockfile.
3. Merge that version PR. The workflow builds packages in dependency order,
   runs their available lint/test tasks, validates every packed entry point, and
   publishes versions missing from npm. Changesets produces package tags and
   GitHub release records.

For local verification, run `npm run release:build && npm run release:check`.
This includes `npm pack --dry-run` for every public package and checks the JS,
declaration, CLI, and export entry points, package identity, repository metadata,
and allowed tarball contents. It does not publish.

Use **Actions → Release Engine → Run workflow → main** to retry after fixing
trust or another failure. Already-published versions are skipped. Changesets
publishes any local version absent from npm, including a new package without a
changeset; configure its initial publication and trust before merging it.

`npm run release` performs the same checks and then actually publishes. It is
intended for CI or deliberate local recovery. The old root
`local-version-script` and `local-publish-script` remain aliases. Per-package
`publish` lifecycle scripts have been removed to avoid recursive publishing.

## Authentication

CI uses GitHub OIDC (`id-token: write`) with a GitHub-hosted runner, Node 24 and
npm 11. Package `publishConfig` selects the public npm registry. No `NPM_TOKEN`
or `NODE_AUTH_TOKEN` secret is needed for publishing. Provenance is generated
automatically by npm for trusted publishing from this public GitHub repository.

After a successful OIDC release, npm's **Require two-factor authentication and
disallow tokens** package setting can disable token-based publishing while
allowing trusted publishing. Keep credentials out of the committed `.npmrc`.

If npm returns E404 during CI publish, verify the owner, repository, workflow
filename, environment, and allowed action all match the table. A dry-run checks
package contents, but cannot prove the OIDC exchange will succeed.

References: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/),
[npm trust CLI and bulk setup](https://docs.npmjs.com/cli/v11/commands/npm-trust/),
[Changesets Action v1](https://github.com/changesets/action/tree/maintenance/v1).
