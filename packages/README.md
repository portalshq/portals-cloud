# Portals npm packages

Public packages under this directory release through GitHub Actions using npm
trusted publishing. Run these commands from the repository root.

One-time setup (Node 24, npm 11.15.0 or newer, npm maintainer access and 2FA):

```sh
npm login
npm run release:trust
npm run release:trust -- --apply
```

For each release, run `npm run changeset` and commit the changeset with your
code. After merging to `main`, review and merge the generated release PR.
GitHub Actions builds, tests, checks tarballs, and publishes the new versions.

Check locally without publishing:

```sh
npm run release:build && npm run release:check
```

See [the release guide](../docs/npm-package-releases.md) for exact trust values,
new package setup, manual retries, and troubleshooting.
