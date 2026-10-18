#!/usr/bin/env node
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)))
const workflow = readFileSync(resolve(scriptDir, '../../../.github/workflows/promote-px-release.yml'), 'utf8')
const pxPublisher = readFileSync(resolve(scriptDir, '../../../../px/.github/workflows/cli-release.yml'), 'utf8')
const verifier = readFileSync(resolve(scriptDir, 'verify-and-promote-px-release.sh'), 'utf8')
const recorder = readFileSync(resolve(scriptDir, 'record-px-release.mjs'), 'utf8')

assert.match(workflow, /workflow_dispatch:/)
assert.match(workflow, /dispatch_id:/)
assert.match(workflow, /inputs\.dispatch_id \|\| github\.run_id/)
assert.match(workflow, /run-name: PX BOM/)
assert.match(workflow, /github\.repository == 'portalshq\/portals-cloud'/)
assert.match(workflow, /target_ref:/)
assert.match(workflow, /PX_GITHUB_REPOSITORY: portalshq\/px/)
assert.match(workflow, /verify-and-promote-px-release\.sh/)
assert.match(workflow, /peter-evans\/create-pull-request@v7/)
assert.match(workflow, /base: \$\{\{ inputs\.target_ref \}\}/)
assert.match(workflow, /infra\/lore\/versions\.yaml/)
assert.doesNotMatch(workflow, /git push|gh pr merge|auto-merge/i)
assert.match(pxPublisher, /actions\/create-github-app-token@v2/)
assert.match(pxPublisher, /PORTALS_CLOUD_RELEASE_APP_ID/)
assert.match(pxPublisher, /PORTALS_CLOUD_RELEASE_APP_PRIVATE_KEY/)
assert.match(pxPublisher, /promote-px-release\.yml\/dispatches/)
assert.match(pxPublisher, /inputs\[dispatch_id\]/)
assert.match(pxPublisher, /gh run watch .*--exit-status/s)
assert.match(verifier, /cosign verify-blob/)
assert.match(verifier, /SHA256SUMS/)
assert.match(verifier, /record-px-release\.mjs/)
assert.match(recorder, /independently promoted top-level lore-client release/)
assert.match(recorder, /versions\.setIn\(\["px-client", "version"\]/)
assert.match(recorder, /versions\.setIn\(\["px-client", "source_repository"\], "https:\/\/github\.com\/portalshq\/px\.git"\)/)
assert.match(recorder, /\["px-client", "verification"\]/)
assert.doesNotMatch(recorder, /verified-releases\.json/)
assert.match(recorder, /version: metadata\.lore_client_version/)

console.log('PX promotion workflow contract passed: embedded verification evidence updates with selected pins; PR only, no direct merge/push')
