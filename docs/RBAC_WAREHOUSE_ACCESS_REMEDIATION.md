# RBAC and Warehouse Access Implementation

**Evidence date:** 2026-11-21  
**Live project:** `vwxzlvsigxeopibnfuhp`  
**Source status:** Implemented in Git; development database validation pending  
**Source migration:** `database/60_rbac_warehouse_scope_alignment.sql`  
**Related backlog:** INT-002, SEC-003, GOV-001

## 1. Implementation status

The source branch now uses one canonical permission namespace for Purchase Order and Goods Receipt: `purchasing.*`.

The source migration adds warehouse-scope enforcement at both layers:
- 22 RLS policy updates for parent and child operational records.
- A SECURITY INVOKER trigger function, `private.enforce_warehouse_scope()`, attached to 13 warehouse-related tables. It resolves child-record scope through the parent document and checks `public.has_warehouse_access()` for the existing and proposed row versions.
- Transfer movement rows are checked independently, so the outbound and inbound warehouse IDs are each validated.
- Dashboard activity feed reuses the same `purchasing.view` authorization context for Purchase Order and Goods Receipt.

**This is source implementation only.** Migration 60 has not been applied to any database. The live Supabase catalog, policies, users, grants and data were not changed.

## 2. Live RBAC snapshot before source implementation

Read-only inspection returned the following state:

| Role | Active | Assigned users | Permission count |
|---|---:|---:|---:|
| auditor | No | 0 | 11 |
| finance | Yes | 0 | 10 |
| manager | Yes | 0 | 20 |
| owner | Yes | 1 | 34 |
| purchasing | Yes | 0 | 11 |
| sales | No | 0 | 7 |
| warehouse | No | 0 | 7 |

Only Owner had an assigned user. No user or role assignment was changed during implementation. Cross-role end-to-end validation therefore remains pending.

## 3. Canonical Purchase Order and Goods Receipt permissions

The live implementation inspection found:
- Purchase Order pages, actions and RPCs use `purchasing.*`.
- Goods Receipt create/post actions and RPCs use `purchasing.create` and `purchasing.approve`.
- Before migration 60, Goods Receipt RLS and Dashboard activity feed still used `goods_receipt.*`.
- The live permission dictionary contains `goods_receipt.view/create/update/post`, but no role mapping used those keys.

Migration 60 updates Goods Receipt base and child RLS policies to the Purchasing namespace. The Dashboard source now calls `getAuthorizationContext("purchasing.view")` once and reuses that result for both PO and GR activity.

Unused `goods_receipt.*` dictionary entries are retained. The implementation does not grant or delete those permission records.

## 4. Warehouse access contract retained

The source migration does not change `public.has_warehouse_access(uuid)` semantics observed in the live database:

- Null warehouse IDs are denied by the helper.
- The warehouse must be active.
- The user's profile must be active.
- Owner, Manager, Finance and Purchasing retain access to all active warehouses.
- Warehouse role access remains dependent on an active `user_warehouse_access` assignment.
- Inactive warehouses remain inaccessible through this helper, including for Owner.

No roles were activated and no warehouse assignments were created.

## 5. Scope enforcement added in source

### 5.1 RLS coverage

The migration updates policies for:
- Purchase Orders and Purchase Order Items.
- Goods Receipts, Goods Receipt Items, Goods Receipt Units and Goods Receipt Unit Identifiers.
- Inventory Movements, Product Units and Product Unit Identifiers.
- Stock Opname Sessions, Items and Unit Counts.

The existing `inventory_balances` policy already required `inventory.view` and `has_warehouse_access(warehouse_id)`; migration 60 leaves it unchanged.

Child-table policies inherit the warehouse scope of their parent record. Product Units and Product Unit Identifiers with a null warehouse remain readable under the existing inventory permission rule as unassigned/historical records; the trigger also retains that null-warehouse behavior.

### 5.2 SECURITY DEFINER write boundary

The live catalog scan identified 31 SECURITY DEFINER functions touching the audited PO, GR, Inventory, Transfer and Stock Opname paths. Their bodies did not directly invoke `has_warehouse_access()`. SECURITY DEFINER functions can perform writes outside ordinary caller RLS evaluation, so a table-policy-only change would not be sufficient.

Migration 60 adds a SECURITY INVOKER trigger guard on the actual table write boundary. It validates the authenticated request's effective warehouse access for both old and new row versions on updates. Child rows resolve their warehouse from the parent PO, GR, Product Unit or Stock Opname session.

Inventory Transfer is stored as paired outbound/inbound Inventory Movement rows using `movement_group_id`. Each row's warehouse is validated separately, covering both endpoints. The source migration does not alter business posting calculations, stock valuation, quantities or workflow statuses.

This is an implementation design in source; its behavior has not yet been demonstrated by transaction tests.

## 6. Required development validation

Before any live deployment, apply the migration only to an isolated development database and verify:

1. Authenticated user with access to Warehouse A can read and write eligible records in A.
2. Same user cannot read or write records in Warehouse B.
3. A user without the relevant module permission is denied even when warehouse access exists.
4. PO and GR create, edit, post, and child-row writes use the canonical Purchasing permissions.
5. Transfer from A to B validates both source and destination; denied destination access rolls back the whole transaction.
6. Inventory Movement, Product Unit, Product Unit Identifier and Stock Opname paths reject out-of-scope writes.
7. Updates that move a record from an allowed warehouse to a forbidden warehouse are rejected.
8. Existing null-warehouse Product Unit behavior remains consistent.
9. Transaction rollback leaves no partial balances, movement rows, receipt rows or opname postings.
10. Supabase security and performance advisors show no new unresolved issue attributable to the migration.

Cross-role tests require dedicated development identities and two test warehouses. Production assignments must not be modified to manufacture test coverage.

## 7. Live deployment status

No live database migration has been applied. The live migration ledger remains at seven entries through `20261120081908 canonical_variant_sku_and_unit_label` at the last read-only check. Migration 60 is not in that ledger.

The source remains pending development-database execution, transaction tests, advisor review and final verification.