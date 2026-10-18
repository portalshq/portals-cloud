# Portals cloud

Read applicable parent instructions and `frontend/AGENTS.md` before frontend work. Preserve existing working-tree edits. The marketing and lead folders have additional scoped instructions.

For assessment-to-paid-pilot work, read `marketing/ASSESSMENT.md` (diagnostic/scoring) and `marketing/PILOT.md` (application, inheritance, room, commercial approval). The dated audit in `marketing/PAID-PILOT-IMPLEMENTATION.md` records conversion decisions and validation; it is not a second business-logic specification.

The application database owns identity, assessments, applications, pilot rooms, terms, acceptance, and payments. Apollo is a durable projection. Browser analytics and typed email addresses cannot grant access or approve commercial transitions. Keep the existing scoring/state machines and server pricing authority.

Use the unified approved-version/context/handoff success test by default. Never introduce another required discovery or success-selection wizard. Preserve original assessment evidence alongside explicit pilot overrides. Keep public metadata free of private production details; private rooms must be noindex.

Run relevant lead tests, frontend typecheck, marketing checks, whitespace checks, and a production build after funnel changes. Use explicit non-production dry-run mode for local integration tests. Report actual results and external-service limitations; do not claim conversion or ranking lift without production evidence.

## Source code authority

**Source code is always authoritative.** Documentation is best-effort up-to-date.

- Always review the actual source code before making implementation decisions
- Do not make decisions based on documentation alone
- Always update applicable documentation after code changes
- When documentation and code conflict, the code is correct
