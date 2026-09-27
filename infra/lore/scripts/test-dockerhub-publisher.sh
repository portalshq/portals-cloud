#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PUBLISHER="${ROOT}/infra/lore/scripts/docker-buildx-lore-dockerhub.sh"
PROMOTER="${ROOT}/infra/pulumi/scripts/verify-and-promote-dockerhub-lore.sh"
RECORDER="${ROOT}/infra/pulumi/scripts/record-verified-dockerhub-lore.mjs"

grep -q 'REPOSITORY="${LORE_DOCKERHUB_REPOSITORY:-portalshq/lore}"' "${PUBLISHER}"
grep -q 'docker buildx build --platform linux/amd64' "${PUBLISHER}"
grep -q -- '--provenance=true --sbom=true --push' "${PUBLISHER}"
grep -q 'linux/amd64) : ;;' "${ROOT}/infra/lore/Dockerfile.loreserver.base"
grep -q 'linux/arm64) apt-get install -y gcc-aarch64-linux-gnu' "${ROOT}/infra/lore/Dockerfile.loreserver.base"
grep -q 'portalshq/lore@sha256' "${PROMOTER}"
grep -q -- '--certificate-oidc-issuer https://token.actions.githubusercontent.com' "${PROMOTER}"
grep -q -- '--severity CRITICAL,HIGH --exit-code 1' "${PROMOTER}"
grep -q 'provenance does not bind build ID' "${PROMOTER}"
grep -q 'provenance does not bind base image' "${PROMOTER}"
grep -q 'atomicWriteJson(receiptsFile, ledger)' "${RECORDER}"
grep -q 'atomicWriteYaml(versionsFile, versions)' "${RECORDER}"
bash -n "${PUBLISHER}" "${PROMOTER}" "${BASH_SOURCE[0]}"
node --check "${RECORDER}"
