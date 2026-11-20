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
