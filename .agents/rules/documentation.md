---
globs:
  - "packages/**"
---

When updating a package under `packages/`, review and update that package's documentation in the same change whenever its public API, behavior, configuration, dependencies, release requirements, or known limitations change. Keep package-specific documentation accurate; do not rely on the root `packages/README.md` to document package-level changes.

Structure important documentation as focused, standalone Markdown sections that can be linked from or loaded by other `.md` files. Keep each section independently understandable, give it a descriptive heading, and link to it from the package README. Package agent modules belong in `docs/package-agents/`, outside publishable package directories; each must include **Load when**, **Use**, and **Do not assume** sections. Split a document when a section serves a distinct purpose (for example, setup, API reference, operational runbook, or limitations); do not split short, tightly related documentation merely to create files.
