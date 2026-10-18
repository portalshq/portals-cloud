#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
command -v cargo >/dev/null 2>&1 || { echo 'Install Rust and cargo-audit before committing.' >&2; exit 1; }
cargo audit --version >/dev/null 2>&1 || { echo 'Install cargo-audit: cargo install cargo-audit --version 0.22.2 --locked' >&2; exit 1; }
[ -f infra/lore/lore/Cargo.lock ] || { echo 'Initialize the Lore submodule: git submodule update --init --recursive' >&2; exit 1; }
# Existing control-plane exceptions: legacy aws-smithy-http-client TLS and rsa
# have no compatible fixed dependency in that graph. Lore has no exceptions.
cargo audit --file control-plane/Cargo.lock \
  --ignore RUSTSEC-2026-0258 \
  --ignore RUSTSEC-2026-0098 \
  --ignore RUSTSEC-2026-0099 \
  --ignore RUSTSEC-2026-0104 \
  --ignore RUSTSEC-2023-0071 \
  --ignore RUSTSEC-2026-0346 \
  --ignore RUSTSEC-2026-0349
cargo audit --file infra/lore/lore/Cargo.lock
