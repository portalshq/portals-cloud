#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "${ROOT}"

status=0
aws_key_files="$(git grep -IlE 'AKIA[0-9A-Z]{16}|aws_secret_access_key[[:space:]]*[:=]' -- ':!**/package-lock.json' || true)"
if [[ -n "${aws_key_files}" ]]; then
  echo "Potential AWS credentials found in:" >&2
  printf '%s\n' "${aws_key_files}" >&2
  status=1
fi

private_key_files="$(git grep -IlE -- '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----' || true)"
unexpected_private_keys="$(printf '%s\n' "${private_key_files}" | grep -vE '^infra/lore/lore/lore-server/src/protocol/test_data/(test_client_key|test_key|untrusted_key)\.pem$' || true)"
if [[ -n "${unexpected_private_keys}" ]]; then
  echo "Deployable or unexpected private keys found in:" >&2
  printf '%s\n' "${unexpected_private_keys}" >&2
  status=1
fi

if [[ -f infra/lore/certs/key.pem ]] &&
  git ls-files --error-unmatch infra/lore/certs/key.pem >/dev/null 2>&1; then
  echo "The obsolete deployment TLS private key is still tracked" >&2
  status=1
fi

exit "${status}"
