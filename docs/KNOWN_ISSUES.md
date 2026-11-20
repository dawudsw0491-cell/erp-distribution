# Known Issues — HEXA CORE

| ID | Priority | Description | Evidence | Status |
|---|---|---|---|---|
| MD-003 | P1 | Product attribute relationship model has assignment and variant-value paths | Live tables: product_attribute_assignments, product_variant_attribute_values, product_attribute_values | PARTIAL — existence verified; semantics and ownership still require mapping |
| MD-004 | P1 | DDL provenance for Product Model and attribute relations is not clear from numbered SQL files | Live schema vs repository migration inventory | OPEN — recover authoritative DDL and migration history |
| MD-005 | P2 | No dedicated Brand route | No app/brands route | OPEN |
| NAV-001 | P2 | Sidebar has Sales, Returns, Accounting, Settings links without corresponding route pages | Recursive app route tree | NOT IMPLEMENTED / scope decision required |
| SEC-002 | P0 | Four RLS-enabled tables have no policies | Supabase Security Advisor | PARTIAL — inspect table grants and intended access |
| SEC-003 | P1 | Seven SECURITY DEFINER functions were executable by anon | Supabase Security Advisor + ACL introspection | FIXED AND VERIFIED by migration 20261120012027 |
| SEC-004 | P1 | 44 SECURITY DEFINER functions require systematic privilege/authorization review | pg_proc inspection | OPEN |
| SEC-005 | P1 | Overlapping permissive policies on user_profiles, user_roles, user_warehouse_access | Supabase Performance Advisor | OPEN |
| PERF-001 | P2 | Missing covering indexes on multiple FK columns | Supabase Performance Advisor | OPEN |
| PERF-002 | P3 | 36 indexes reported unused | Supabase Performance Advisor | OPEN — do not remove without usage-window analysis |
| QA-001 | P1 | No test script or suite identified | package.json / source tree | OPEN |
| DOC-001 | P2 | README remains create-next-app template | README.md | OPEN |
| GOV-001 | P1 | Supabase migration ledger did not match repository SQL history | list_migrations returned empty before new migration | OPEN — reconcile prior SQL deployment history |

## Interpretation

An RLS-enabled table with no policy is default-deny for roles subject to RLS, but its actual exposure also depends on table grants and privileged access paths. Do not create permissive policies merely to silence the advisor.

A SECURITY DEFINER function being executable by anon is a privilege-surface issue. Whether it is exploitable depends on function body, auth checks, reachable data, and transaction behavior. The seven findings were corrected by removing PUBLIC/anon execution while retaining the intended authenticated/service-role access.

Unused-index findings are not proof that indexes are unnecessary; the observation window and expected workload must be considered.
