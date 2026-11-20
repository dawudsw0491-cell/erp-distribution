# Test and Verification Evidence — HEXA CORE

## Repository and branch

- Protected master: `8eadef2a0cb7e03fa2eb3fdb194dee4987af2bfa`.
- Implementation branch: `work/hexa-core-implementation-20261120`.
- Branch base includes prior valid Master Data Hub and shared Brand helper work.
- No changes were made to master.

## Live Supabase

- Project: `erp-distribution-dev`; status ACTIVE_HEALTHY; PostgreSQL 17.11.
- Public tables: 47; functions: 73; SECURITY DEFINER: 44; non-internal triggers: 20; policies: 102; indexes: 189.
- Migration `hexa_core_harden_public_definer_function_execute` applied and appears in migration ledger as version `20261120012027`.
- ACL verification: anon EXECUTE false on all seven advisor-flagged functions. authenticated EXECUTE true for the six application/RLS functions; trigger function `generate_customer_code()` is not directly executable by authenticated.

## Checks

| Check | Result | Evidence |
|---|---|---|
| Repository tree | PASS | 258 entries on master; implementation branch retains earlier Master Data changes |
| Master Data Hub | PASS — source | Eight work areas linked |
| Shared Brand create helper | PASS — source | Product and Product Model use shared helper |
| Product Model assignment | PASS — source inspection | Product create/edit forms submit model_id; server actions validate active model and matching brand_id before persisting |
| Shared category recommendation | PASS — source inspection | Create/edit forms import one shared classifier; duplicate recommendation implementations removed |
| Product/model brand consistency | PASS — live data check | 0 mismatches among products with model_id at time of inspection |
| Live schema table inventory | PASS | 47 public tables |
| Product Model/attribute tables existence | PASS | Live schema lists all three relation tables |
| Security grants migration | PASS | Applied and ACLs re-queried |
| Build | NOT RUN | Must be executed on current branch |
| Lint | NOT RUN | Must be executed on current branch |
| Unit/integration/E2E | NOT RUN | No suite identified in package manifest |
| RLS behavior | NOT RUN | Advisor and catalog inspection only; no role simulation |
| Purchasing → GR → Inventory | NOT RUN | No test transaction executed |

## Limits

A successful migration and grant read-back prove the ACL change, not all function logic or business workflow correctness. Advisor findings remain open where policy/index changes require more context. No demo data was reset.


## Product Attribute Values reliability update

| Check | Result | Evidence |
|---|---|---|
| Attribute Value duplicate lookup handling | PASS — source inspection | Create/update now stop and return an error when duplicate-code or duplicate-name lookup fails; they no longer continue as if no duplicate exists |
| Attribute Value list counting | PASS — source inspection | Total/active/inactive counts use exact head-only count queries instead of fetching all matching rows into application memory |
| Attribute Value search input | PASS — source inspection | Search input is bounded to 100 characters and reserved filter characters are removed before PostgREST OR filtering |
| Product Attribute / Value assignment workflow | PARTIAL | CRUD for global Attribute and Attribute Value is present; inspected Product and Variant detail routes do not expose a complete assignment/value-maintenance workflow |
| Legacy attribute DDL provenance | OPEN | Repository SQL files 22/23 describe a different attribute schema from the live database tables; no schema migration was changed |

These are source-level checks only. Build, lint, and browser/runtime verification remain pending.


## 2026-11-20 — Variant specification workflow

| Check | Result | Evidence |
|---|---|---|
| RAM and ROM attribute masters | PASS — live DB | Both rows exist and are active; existing COLOR and WARRANTY rows were reused |
| Variant specification RPC | PASS — live catalog | `save_product_variant_specifications(uuid, uuid, jsonb)` exists; `prosecdef=false`; `anon_execute=false`; `authenticated_execute=true`; `service_role_execute=true` |
| Variant mapping removal policy | PASS — live catalog | DELETE policy exists for authenticated and checks `has_permission('master.update')` |
| Specification transaction design | PASS — source inspection | One RPC call handles all four attributes in a PostgreSQL transaction; no service-role client or SECURITY DEFINER path is introduced |
| Variant create/edit/detail UI | PASS — source inspection | Four fields are loaded/rendered from the shared attribute dictionary; create/edit calls the RPC |
| Browser submission / RLS role matrix | NOT RUN | Requires authenticated UI session with permission combinations; not inferred from catalog inspection |
| Production build after latest changes | NOT RUN | Previous local build was before these changes; rerun after pulling latest branch |
| ESLint after latest changes | NOT RUN | Previous local run reported 25 errors and 11 warnings before these changes; rerun after pulling latest branch |

The two applied specification migrations are recorded as `20261120031233` and `20261120031359`. No product, variant, purchase, inventory, or demo rows were deleted by these migrations.


## Latest deployment status — branch head 2f87aed

- GitHub combined commit status reports Vercel = FAILURE for branch head `2f87aed086d4fc23135621d2ca1897d07eaeac31`.
- No GitHub Actions workflow runs were returned for that commit.
- The Vercel target URL is present in GitHub status, but deployment logs are not available through the connected GitHub/Supabase tools. Failure cause is therefore UNKNOWN; do not infer it is caused by TypeScript, build, environment variables, or Supabase.
- Local build and lint must be rerun on the current branch to obtain actionable compiler/linter output.


## 2026-11-20 — Consolidated lint remediation batch

| Check | Result | Evidence |
|---|---|---|
| Local production build | PASS at commit `3d08b33` | User terminal: Next.js 16.4.3 compiled successfully, TypeScript passed, and 57 routes generated |
| ESLint baseline | FAIL at commit `3d08b33` | User terminal: 16 errors and 11 warnings |
| Client component directive ordering | FIXED — source | Five affected forms now place `"use client"` before imports |
| Customer/supplier region lookup state | FIXED — source | Parent-dependent options are derived; callback dependencies stabilized; edit fields remount on parent/selection identity |
| Filter URL synchronization | UPDATED — source | URL synchronization deferred to scheduled callback; search indicator derived from URL comparison |
| Purchase date initialization | FIXED — source | Local date initialized lazily rather than in an effect |
| Inventory query typing | UPDATED — source | Paginated query helper uses a typed range-query contract; unused realtime import removed |
| Purchase order row typing | UPDATED — source | Explicit row type replaces `any` in rendering |
| Supplier manager initial loading | UPDATED — source | Initial loads are scheduled and cancellable from effect cleanup |
| Sidebar active-group expansion | FIXED — source | Active route determines default expansion; user toggles remain state overrides |
| Current-head build/lint | NOT RUN | Changes after `3d08b33` have not yet been run locally; do not infer zero lint errors from source inspection |

Current implementation branch head recorded during this update: `8828366c7634986fc189379795c6f2962329bc33`. GitHub combined status: Vercel PENDING. PR #1 remains draft; `master` remains unchanged.
