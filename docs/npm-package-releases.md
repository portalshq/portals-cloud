# npm package releases

Portals packages are published by the `Release Engine` GitHub Actions workflow.
The normal release path is Changesets, not a local `npm publish` command.

1. Add a changeset for every publishable package whose public API changes.
2. Merge it to `main`. The workflow opens or updates the version PR.
3. Review and merge that version PR. The same workflow builds, tests, and
   publishes each new package in Turbo dependency order.

The workflow uses npm trusted publishing with GitHub Actions OIDC. It has no
`NPM_TOKEN`, no registry credential in `.npmrc`, and no long-lived write secret.
The existing `production` GitHub environment remains the approval boundary for
the publish job.

## One-time npm setup

An npm organization owner must configure a trusted publisher for **each**
published package. In npmjs.com, open each package's **Settings → Trusted
Publisher**, choose **GitHub Actions**, and enter:

- Organization or user: `portalshq`
- Repository: `portals-cloud`
- Workflow filename: `release.yml`
- Environment: `production`
- Allowed action: `npm publish`

Configure these packages:

- `@portalshq/capability-realtime-fanout`
- `@portalshq/capability-video-delivery`
- `@portalshq/runtime-core`
- `@portalshq/capability-queue-broadcast`

Each package's `repository.url` already identifies
`https://github.com/portalshq/portals-cloud.git`, which npm uses when it
validates the workflow identity. The package must exist on npm before its
trusted publisher can be configured.

After the first successful OIDC release, set each package's publishing access
to **Require two-factor authentication and disallow tokens**. Trusted publishing
continues to work, while local tokens cannot bypass the release controls.

## Emergency local publish

Use local publishing only to recover a release workflow. It requires an
interactive OTP and the package's `npm run publish` script. The script checks
whether the exact version is already public and calls `npm publish` with
`--ignore-scripts`, preventing the package lifecycle from recursively invoking
itself.

Do not put an auth token in the workspace `.npmrc`; it intentionally contains
only `access=public`, which is safe for both local development and CI.
