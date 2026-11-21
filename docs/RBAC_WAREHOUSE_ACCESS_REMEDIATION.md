# RBAC and Warehouse Access Remediation Plan

**Related backlog:** INT-002, SEC-003, GOV-001  
**Evidence date:** 2026-11-21  
**Live project:** `vwxzlvsigxeopibnfuhp`  
**Status:** Read-only audit completed; policy semantics and migration approval pending  
**Scope:** Permission-key consistency, warehouse-scope enforcement, SECURITY DEFINER RPC authorization

## 1. Executive finding

The live database has a permission model and an application model that do not fully agree:

1. Purchase Order and Goods Receipt application actions/RPCs primarily use `purchasing.*`.
2. Goods Receipt table RLS policies use `goods_receipt.*`.
3. Dashboard Goods Receipt feed checks `goods_receipt.view`.
4. The live `role_permissions` table maps no `goods_receipt.*` permission to any role.
5. Warehouse access exists as a helper function, and Inventory Balances SELECT RLS uses it. Several other warehouse-bound tables and SECURITY DEFINER transaction functions do not.

This is an authorization consistency gap. It is not proof of an observed data breach. No database objects, permissions, users, or data were changed during this audit.

## 2. Live facts — RBAC state

A read-only join of `roles`, `role_permissions`, `permissions`, and `user_roles` returned:

| Role | Active | Assigned users | Permission count |
|---|---:|---:|---:|
| auditor | No | 0 | 11 |
| finance | Yes | 0 | 10 |
| manager | Yes | 0 | 20 |
| owner | Yes | 1 | 34 |
| purchasing | Yes | 0 | 11 |
| sales | No | 0 | 7 |
| warehouse | No | 0 | 7 |

Only Owner currently has an assigned user. Manager, Finance and Purchasing are active but have no assigned users. Warehouse, Sales and Auditor are inactive and have no assigned users. Cross-role browser testing cannot be claimed from the current live assignments.

### Permission-key discrepancy

The live permission dictionary contains:

- `goods_receipt.view`
- `goods_receipt.create`
- `goods_receipt.update`
- `goods_receipt.post`

None is present in the live role-to-permission mapping.

Current consumers:

| Layer | Permission keys observed |
|---|---|
| Create Goods Receipt server action | `purchasing.create` |
| Post Goods Receipt server action | `purchasing.approve` |
| Live `create_goods_receipt_by_product` RPC | `purchasing.create` |
| Live `post_goods_receipt_by_product` RPC | `purchasing.approve` |
| Goods Receipt table SELECT/INSERT/UPDATE RLS policies | `goods_receipt.*` |
| Dashboard Goods Receipt activity feed authorization | `goods_receipt.view` |
| Purchase Order and Goods Receipt page guards | `purchasing.view` |

Owner passes `has_permission()` through its explicit `is_owner()` bypass. Other roles do not inherit Goods Receipt permissions because the mapping is empty. This explains why owner-only testing cannot establish that Purchasing or Manager roles can read the same Goods Receipt pages/feed.

The historical `database/05_rbac_permissions_seed.sql` and `database/06_rbac_role_mapping.sql` are documentation/seeding records, not safe scripts to rerun. Their contents do not fully represent the current live permission dictionary.

## 3. Live facts — warehouse access helper

Current `public.has_warehouse_access(uuid)`:

- Is `SECURITY DEFINER`, `STABLE`, and uses an empty search path.
- Requires a non-null warehouse ID.
- Requires the warehouse row to be active.
- Requires the current user's profile to be active.
- Returns true for Owner.
- Returns true for active roles `manager`, `finance`, and `purchasing` across all active warehouses; these roles do not need an explicit `user_warehouse_access` assignment.
- For role `warehouse`, requires an active role and a matching active `user_warehouse_access` row.

The function's ACL for the inspected live version lists `authenticated`, `service_role`, and `postgres`; no `PUBLIC` or `anon` EXECUTE entry was returned.

### Consequences requiring an explicit business decision

- Manager, Finance and Purchasing currently have broad access to every active warehouse by role.
- Warehouse staff are designed to be assignment-scoped, but the Warehouse role is currently inactive and has no users.
- Inactive warehouses are rejected by the helper even for Owner, which may prevent access to historical stock movements or archived operational documents.
- Whether Finance should access all warehouse stock, and whether Purchasing requires all-warehouse access or assigned-warehouse access, must be explicitly confirmed. Do not infer these business rules from role names.

## 4. Live facts — RLS coverage

Observed SELECT policies:

| Table | Current live condition | Missing control |
|---|---|---|
| `inventory_balances` | `inventory.view AND has_warehouse_access(warehouse_id)` | None identified in this specific SELECT policy |
| `purchase_orders` | `purchasing.view` | Warehouse scope |
| `purchase_order_items` | EXISTS matching Purchase Order | Explicit permission and inherited warehouse scope in child policy |
| `goods_receipts` | `goods_receipt.view` | Role mapping and warehouse scope |
| `goods_receipt_items` | EXISTS matching Goods Receipt with `goods_receipt.view` | Role mapping and inherited warehouse scope |
| `inventory_movements` | `inventory.view OR is_owner()` | Warehouse scope |
| `product_units` | `inventory.view OR is_owner()` | Warehouse scope |
| `stock_opname_sessions` | `inventory.view OR inventory.opname OR is_owner()` | Warehouse scope |
| `stock_opname_items` | `inventory.view OR inventory.opname OR is_owner()` | Warehouse scope through session |
| `stock_opname_unit_counts` | `inventory.view OR inventory.opname OR is_owner()` | Warehouse scope through item/session |

The Dashboard's recent movement-count/feed logic performs an extra `has_warehouse_access` check and fails closed. That application-level correction does not replace database policy enforcement for all consumers.

## 5. SECURITY DEFINER RPC review — warehouse authorization

Read-only inspection covered operational mutation functions and their wrappers. Relevant live functions are `SECURITY DEFINER` and use an empty `search_path`. Their inspected ACLs list `authenticated`, `service_role`, and `postgres`; no `PUBLIC` or `anon` EXECUTE entry was observed for the sampled functions.

The following inner/mutation functions reference `auth.uid()` and check module permissions but do not directly call `has_warehouse_access()`:

- `create_purchase_order_by_product`
- `create_goods_receipt_by_product`
- `post_goods_receipt_by_product`
- `create_inventory_movement_by_product`
- `post_inventory_movement_unlocked`
- `create_inventory_transfer_by_product`
- `post_inventory_transfer_unlocked`
- `create_stock_opname`
- `start_stock_opname`
- `record_stock_opname_count`
- `record_stock_opname_counts_bulk`
- `record_stock_opname_unit_count`
- `reconcile_stock_opname`
- `post_stock_opname_unlocked`

The locking wrappers `post_inventory_movement`, `post_inventory_transfer`, and `post_stock_opname` lock rows/warehouses and delegate to their unlocked functions. The helper `lock_inventory_warehouse(uuid)` acquires an advisory transaction lock only; it does not authenticate, authorize a module permission, or check warehouse access.

This is a gap for future assignment-scoped roles: SECURITY DEFINER functions bypass table RLS. A table policy alone cannot constrain a mutation performed inside such a function. A future migration must check the actual warehouse IDs inside each privileged function, after safely resolving and locking the target document. Transfers must validate both source and destination warehouses. Posting wrappers must not rely on a client-supplied warehouse ID; derive the warehouse from the locked database row/group.

This catalog-level finding is not a runtime exploit demonstration. Function call paths and role behavior still require transaction tests.

## 6. Proposed remediation design — no database change executed

### 6.1 Goods Receipt permission model — decision required

Two viable models exist:

**Option A — one Purchasing permission namespace (minimum compatibility change; recommended based on current application/RPC usage).**

- Keep PO and Goods Receipt under `purchasing.*`.
- Change Goods Receipt table RLS policies to the corresponding Purchasing permissions.
- Change Dashboard Goods Receipt feed guard to `purchasing.view`.
- Keep one consistent set of permission checks across UI, RPC and RLS.
- Retain the currently unused `goods_receipt.*` dictionary codes temporarily; do not grant them or delete them until every caller and migration is audited.

**Option B — separate Goods Receipt permission namespace (more granular, larger coordinated change).**

- Use `goods_receipt.view/create/update/post` consistently in server actions, RPC bodies, Dashboard and RLS.
- Define an explicit role mapping before migration. At minimum, the business owner must decide which roles can create, view, update and post receipts.
- Do not assume `purchasing.approve` is interchangeable with `goods_receipt.post`; PO approval and receipt posting are distinct actions.

No option has been applied. Option A is the smallest change consistent with the existing server actions and RPC checks, but it reduces permission granularity. It requires approval as the intended business policy before implementation.

### 6.2 Warehouse-scope policy

After warehouse-role semantics are confirmed, the intended database contract should be:

- Every row in a warehouse-bound base table is readable only with the module permission plus effective warehouse access.
- Child tables inherit the parent warehouse scope by joining to the parent PO, Goods Receipt, or Stock Opname session inside the RLS expression.
- Insert/update policies validate both the old row and proposed new row scope; changing a row to a warehouse the user cannot access must fail.
- All SECURITY DEFINER RPCs validate effective access to the server-resolved target warehouse.
- Transfer RPCs validate access to both source and destination warehouses.
- Goods Receipt posting derives warehouse from the locked Goods Receipt/PO and validates both are consistent and accessible.
- Stock Opname count/reconcile/approve/post validates access through the locked session's warehouse.
- RLS is defense in depth; function-level checks remain mandatory for SECURITY DEFINER write paths.
- Read policies, write policies and RPC checks must use one shared definition of effective warehouse access.

### 6.3 Warehouse role policy — decision required

Confirm one of these models before migration:

1. **Current broad-role model:** Owner, Manager, Finance and Purchasing may access every active warehouse; Warehouse role is assignment-scoped.
2. **Assignment-first model:** all non-owner roles, including Manager, Finance and Purchasing, require active warehouse assignment, with documented exceptions only where needed.
3. **Hybrid model:** Manager and Finance retain broader visibility, while Purchasing and Warehouse are assignment-scoped; the exact role list must be approved.

Also decide whether historical records in inactive warehouses should remain visible to users with appropriate history/report permissions. The current helper returns false for an inactive warehouse.

### 6.4 Suggested target policy coverage

| Table / RPC path | Required module permission | Required warehouse check |
|---|---|---|
| Purchase Orders | `purchasing.view/create/update/approve` as applicable | PO warehouse |
| Purchase Order Items | Corresponding parent PO operation | Parent PO warehouse |
| Goods Receipts | Approved canonical GR/Purchasing permission model | GR warehouse and parent PO warehouse |
| Goods Receipt Items | Corresponding parent GR operation | Parent GR warehouse |
| Inventory Movements | `inventory.view/update` and finance approval where applicable | Movement warehouse |
| Product Units / identifiers | `inventory.view/update` as applicable | Unit's current warehouse |
| Inventory Balances | `inventory.view` | Balance warehouse |
| Stock Opname Sessions | `inventory.view/opname` as applicable | Session warehouse |
| Stock Opname Items / Unit Counts | Corresponding parent session operation | Parent session warehouse |
| Inventory Transfer create/post | `inventory.transfer` | Both source and destination warehouses |

This is a design target, not a current-state claim.

## 7. Required test matrix before activation

| Test | User profile | Expected access |
|---|---|---|
| RBAC-01 | Owner | Access according to approved owner policy; confirm behavior for inactive warehouses |
| RBAC-02 | Purchasing assigned only Warehouse A (if assignment-first/hybrid chosen) | Can create/view/approve PO and Goods Receipt only within approved scope |
| RBAC-03 | Manager with approved scope | Can view/approve only approved PO, GR and Stock Opname scope |
| RBAC-04 | Finance with approved scope | Can view/approve financial functions only within approved scope; no unintended inventory mutation |
| RBAC-05 | Warehouse role assigned Warehouse A | Cannot SELECT, create, post, transfer from, or count Warehouse B |
| RBAC-06 | Active user with module permission but no warehouse assignment | No warehouse-bound rows or RPC mutations under assignment-scoped policy |
| RBAC-07 | Active user with warehouse assignment but no module permission | Warehouse assignment alone does not grant module access |
| RBAC-08 | Inactive profile or inactive role | No module or warehouse access |
| RBAC-09 | Cross-warehouse transfer | Requires effective access to both source and destination; failure rolls back the entire transfer |
| RBAC-10 | Goods Receipt through PO | Consistent permission keys across application action, RPC, base-table RLS and Dashboard feed |
| RBAC-11 | Archived/inactive warehouse | Behavior matches the explicitly approved historical-access rule |

Existing live assignments are insufficient for RBAC-02 through RBAC-08. Use dedicated test users/warehouse assignments only after an approved test-account plan. Do not modify production users merely to satisfy test coverage.

## 8. Migration and deployment gates

1. Confirm the canonical Goods Receipt permission model.
2. Confirm role-to-warehouse semantics and inactive-warehouse history behavior.
3. Review each affected SECURITY DEFINER body and its EXECUTE ACL.
4. Prepare a source-controlled migration that updates policies and relevant functions atomically.
5. Test migration on an isolated Supabase development/preview database with seeded test identities and at least two warehouses.
6. Test both allowed and denied SELECT/INSERT/UPDATE/RPC paths, including cross-warehouse transfers and rollback.
7. Run Supabase database advisors and inspect resulting grants/policies.
8. Apply to live only after explicit user approval; verify migration ledger, policy definitions, function definitions, EXECUTE ACLs and representative role outcomes.

No live SQL was executed for remediation. No user/role assignments, data, or database schema were changed by this plan.
