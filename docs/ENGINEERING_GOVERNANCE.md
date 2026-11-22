# HEXA CORE Engineering Governance

## Purpose

Stop repetitive audits and unfinished revisions. Deliver work in small, verifiable increments while preserving one shared implementation baseline.

## Source of truth

- GitHub implementation branch: source code, migrations, tests, architecture decisions, and shared backlog.
- Supabase project: actual live schema, functions, grants, RLS, and migration ledger.
- Vercel: build/deployment state and runtime evidence.
- `docs/BACKLOG.md`: sole work queue. `docs/DECISIONS.md`: accepted architecture decisions.
- No separate task lists or independent findings are authoritative unless reconciled into these files.

## Work protocol

1. Select one existing backlog ID. If absent, create one concise item.
2. Read only the files and DB objects directly required by that item. Reuse existing evidence; do not run broad audits by default.
3. State the root cause and the smallest safe change before implementation.
4. Implement only that scope. Preserve working behavior and downstream contracts.
5. Run checks appropriate to the changed surface:
   - UI/server code: TypeScript/build; lint changed scope or full lint when available.
   - Database: source migration, apply to intended non-production DB, verify resulting schema/ACL/RLS.
   - Business flow: exercise the changed user path and its immediate dependency.
6. Deploy Preview once after a coherent batch, not after every file.
7. Smoke-test the actual Preview URL and record the result.
8. Update the same backlog row with commit, test evidence, deployment, and blockers.

## Completion states

- `DONE`: all relevant gates passed.
- `IN PROGRESS`: implementation is active and no blocking external dependency prevents the next step.
- `BLOCKED`: exact external or technical blocker is known; do not retry until its condition changes.
- `PARTIAL`: some implementation exists but required acceptance criteria remain unmet.
- `NOT IMPLEMENTED`: no implementation exists.

Do not use vague statuses such as “audited”, “checked”, or “almost done” as completion.

## Change boundaries

- No Production changes during Preview stabilization.
- No secret exposure, secret rotation, schema drops, bulk data deletion, or migration rewriting without explicit approval.
- Do not remove a database object merely because its UI route is consolidated. Prove references, triggers, RPC dependencies, foreign keys, and downstream consumers first.
- Do not create duplicate master-data entities or maintenance screens.
- A failed deployment is not a code failure unless the build itself failed. Record quota/access/infrastructure blockers separately.
- A READY deployment is not a passed workflow test.

## Current consolidation rule

Product, category, model, attributes, and attribute values are maintained through the single Product Management workspace at `/products`. Legacy standalone pages redirect there. Existing database structures remain until a dependency-safe retirement plan is proven.

## Build-first delivery mode — project owner instruction (2026-11-22)

- Complete the remaining functional modules before broad system-wide polishing: Sales, Returns, Accounting, Reports, and Settings.
- At module start, perform a bounded alignment check (approximately 20–30% of relevant scope) across table contracts, business logic, frontend/backend integration, permissions, and UI/UX. Expand only when a concrete blocker or safety risk is found.
- Do not repeat full audits or polish completed modules at every module handoff. Reuse accepted evidence and inspect only changed scope.
- Classify findings as blockers or later improvements. A blocker prevents safe implementation or causes incorrect transactions, authorization exposure, or data corruption. Noncritical cleanup, cosmetic refinement, and speculative SKU normalization remain in the shared backlog for the overall audit milestone.
- Application records in the current Development project are test data. Do not let demo-data cleanup or repeated SKU consistency checks displace module implementation. This does not authorize destructive reset or deletion; obtain explicit owner approval before any such action.
- After the core modules exist, run one cross-module audit and integration pass, then perform the larger refinement and regression cycle.
- Continue to use Preview deployments for coherent implementation batches. A READY build is not proof of an authenticated end-to-end workflow.

## Required task closeout record

For each backlog item, record:
- Backlog ID and root cause
- Changed paths / migration IDs
- Commit SHA
- Automated check results
- Database verification (if applicable)
- Preview deployment ID, URL, and status
- User-flow smoke test result
- Remaining blocker, if any
