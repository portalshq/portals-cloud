#!/usr/bin/env bash
# Build the Intel Mac Lore release on Docker Hub. The ECR publisher remains a
# separate dual-architecture path with AWS/KMS requirements.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
SOURCE_ROOT="${REPO_ROOT}/infra/lore/lore"
REPOSITORY="${LORE_DOCKERHUB_REPOSITORY:-portalshq/lore}"
VERSION="${1:?usage: docker-buildx-lore-dockerhub.sh <0.8.4-portals.N>}"

[[ "${REPOSITORY}" == "portalshq/lore" ]] || { echo "LORE_DOCKERHUB_REPOSITORY must be portalshq/lore" >&2; exit 2; }
[[ "${VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+-portals\.[1-9][0-9]*$ ]] || { echo "invalid Lore version: ${VERSION}" >&2; exit 2; }
command -v docker >/dev/null || { echo "docker is required" >&2; exit 2; }
docker buildx version >/dev/null

SOURCE_COMMIT="$(git -C "${SOURCE_ROOT}" rev-parse HEAD)"
PACKAGING_COMMIT="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
[[ -z "$(git -C "${SOURCE_ROOT}" status --porcelain)" ]] || { echo "Lore source must be clean" >&2; exit 2; }
[[ -z "$(git -C "${REPO_ROOT}" status --porcelain -- .dockerignore infra/lore/Dockerfile.loreserver infra/lore/Dockerfile.loreserver.base infra/lore/scripts/docker-buildx-lore-dockerhub.sh)" ]] || { echo "Lore packaging inputs must be clean" >&2; exit 2; }

BUILD_ID="${BUILD_ID:-$(date -u +%Y%m%d-%H%M%S)-$(od -An -tx4 -N4 /dev/urandom | tr -d ' ')}"
[[ "${BUILD_ID}" =~ ^[A-Za-z0-9._-]{1,64}$ ]] || { echo "invalid BUILD_ID" >&2; exit 2; }
BASE_TAG="${VERSION}-build-${BUILD_ID}-base"
SERVER_TAG="${VERSION}-build-${BUILD_ID}"

resolve_digest() {
  local ref="$1" digest=""
  for _ in 1 2 3; do
    digest="$(docker buildx imagetools inspect "${ref}" 2>/dev/null | awk '/^Digest:/ {print $2; exit}' || true)"
    [[ "${digest}" =~ ^sha256:[a-f0-9]{64}$ ]] && { printf '%s\n' "${digest}"; return 0; }
    sleep 5
  done
  echo "unable to resolve digest for ${ref}" >&2
  return 1
}

docker buildx build --platform linux/amd64 \
  --build-arg "LORE_BUILD_VERSION_NAME=${VERSION}" \
  --label "org.opencontainers.image.revision=${SOURCE_COMMIT}" \
  --label "io.portals.packaging-revision=${PACKAGING_COMMIT}" \
  --label "io.portals.build-id=${BUILD_ID}" \
  --provenance=true --sbom=true --push \
  -f "${REPO_ROOT}/infra/lore/Dockerfile.loreserver.base" \
  -t "${REPOSITORY}:${BASE_TAG}" "${SOURCE_ROOT}"
BASE_IMAGE="${REPOSITORY}@$(resolve_digest "${REPOSITORY}:${BASE_TAG}")"

docker buildx build --platform linux/amd64 \
  --build-arg "BASE_IMAGE=${BASE_IMAGE}" \
  --label "org.opencontainers.image.revision=${SOURCE_COMMIT}" \
  --label "io.portals.packaging-revision=${PACKAGING_COMMIT}" \
  --label "io.portals.build-id=${BUILD_ID}" \
  --provenance=true --sbom=true --push \
  -f "${REPO_ROOT}/infra/lore/Dockerfile.loreserver" \
  -t "${REPOSITORY}:${SERVER_TAG}" "${REPO_ROOT}"
IMAGE="${REPOSITORY}@$(resolve_digest "${REPOSITORY}:${SERVER_TAG}")"

PACKAGE_VERSION="$(sed -n 's/^version = "\([^"]*\)"$/\1/p' "${SOURCE_ROOT}/Cargo.toml" | head -n 1)"
VERSION_OUTPUT="$(docker run --rm --platform linux/amd64 -e LORE__SERVER=invalid "${IMAGE}" 2>&1 || true)"
grep -Fq "Server version: ${PACKAGE_VERSION}+${VERSION}" <<<"${VERSION_OUTPUT}" || { printf '%s\n' "${VERSION_OUTPUT}" >&2; exit 1; }

printf 'base_image=%s\nimage=%s\nplatform=linux/amd64\nsource_commit=%s\npackaging_commit=%s\nbuild_id=%s\n' \
  "${BASE_IMAGE}" "${IMAGE}" "${SOURCE_COMMIT}" "${PACKAGING_COMMIT}" "${BUILD_ID}"
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  printf 'base_image=%s\nimage=%s\nsource_commit=%s\npackaging_commit=%s\nbuild_id=%s\n' \
    "${BASE_IMAGE}" "${IMAGE}" "${SOURCE_COMMIT}" "${PACKAGING_COMMIT}" "${BUILD_ID}" >> "${GITHUB_OUTPUT}"
fi
