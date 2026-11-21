# Cross-Module Integration Matrix — HEXA CORE ERP

**Backlog ID:** INT-002  
**Source branch:** `fix/engineering-governance-masterdata-consolidation-20261120`  
**Live database project:** `vwxzlvsigxeopibnfuhp`  
**Evidence snapshot:** read-only Supabase schema, FK, function, RLS-policy, and migration-ledger inspection performed 2026-11-21.  
**Document status:** Integration map recorded; runtime business-flow verification and access-scope remediation remain open.

## 1. Evidence rules

This matrix distinguishes:

- **LIVE FK VERIFIED** — a foreign-key constraint exists in the live PostgreSQL catalog.
- **LIVE FUNCTION VERIFIED** — the live function exists and its signature/security mode was inspected.
- **LIVE RLS VERIFIED** — the current live table policy was inspected.
- **SOURCE ONLY** — code or migration exists in GitHub but is not established as applied to the live database.
- **NOT IMPLEMENTED** — no corresponding authoritative live transaction table was found in the inspected `public` schema.
- **RUNTIME PENDING** — source/catalog evidence does not prove that a complete authenticated business flow works end to end.

A foreign key proves referential structure; it does not prove business correctness, transaction atomicity, permission behavior, or successful UI workflow.

## 2. Canonical entity ownership

| Entity | Live source of truth | Key relationships | Owning workflow | Status |
|---|---|---|---|---|
| Product | `products` | Category, Brand, Product Model; parent of Product Variants; referenced by PO items, Stock Opname items, Product Units, Inventory Movements, Inventory Balances and Valuation Logs | Product Management | LIVE FK VERIFIED; lifecycle/browser checks pending |
| Product Variant | `product_variants` | Child of Product; referenced by PO items, Product Units, Movements, Balances, Stock Opname items and Valuation Logs | Product Management / Inventory | LIVE FK VERIFIED; downstream reference consistency checks pending |
| Product attributes | `product_attributes`, `product_attribute_values`, `product_attribute_assignments`, `product_variant_attribute_values` | Product assignment and variant/value mappings, including composite FK dependencies | Product Management | LIVE FK VERIFIED; canonical DDL provenance and complete lifecycle cleanup remain open |
| Supplier | `suppliers` | Parent of Purchase Orders, Goods Receipts, Product-Supplier links, bank accounts, contacts, addresses | Supplier Master / Purchasing | LIVE FK VERIFIED; end-to-end workflow pending |
| Customer | `customers` | Current inspected schema has no FK to a Sales order, invoice, receivable, or return source | Customer Master | Master exists; downstream consumer NOT IMPLEMENTED |
| Warehouse | `warehouses` | Referenced by PO, Goods Receipt, Movement, Balance, Product Unit, Stock Opname, Valuation Log and User Warehouse Access | Warehouse Master / all stock-bearing modules | LIVE FK VERIFIED; role/warehouse runtime tests pending |
| User / Profile | `auth.users`, `user_profiles` | Profile keyed to Auth user; assigned roles and warehouse access | Authentication / User Administration | LIVE FK VERIFIED; role matrix and RLS runtime tests pending |
| Role / Permission | `roles`, `permissions`, `user_roles`, `role_permissions` | User-to-role and role-to-permission bridge | RBAC | LIVE FK VERIFIED; complete role/action matrix pending |

## 3. Operational dependency matrix

| Flow | Verified structural path | Transaction / posting boundary | Dashboard contribution | Verification state |
|---|---|---|---|---|
| Product setup → Purchasing | `products.id → product_variants.product_id`; `purchase_order_items.product_id → products.id`; `purchase_order_items.product_variant_id → product_variants.id` | Product and initial variants are created atomically by live SECURITY INVOKER `create_product_with_variants(jsonb,jsonb)`; later variants use `create_product_variant_with_specs` / `next_product_variant_sku`. PO creation uses `create_purchase_order_by_product` (server action calls RPC). | Total Products; inventory SKU identity | Live structures/functions verified; local UI creation, variant/PO linkage and rollback tests pending |
| Supplier → Purchasing | `purchase_orders.supplier_id → suppliers.id`; Product-Supplier bridge `product_suppliers(product_id,supplier_id)` | PO create/approve workflow. Live PO fields include ordered totals and status; there is no payable ledger established by these fields. | Purchase Order activity | FK and route/RPC call pattern verified; complete approve/cancel/partial receipt flow pending |
| Warehouse → Purchasing | `purchase_orders.warehouse_id → warehouses.id` | PO stores the receiving warehouse; Goods Receipt must preserve the PO warehouse. | Purchase Order activity is warehouse-labelled/scoped in the Dashboard implementation | FK verified; current PO SELECT RLS is permission-only, not explicitly warehouse-scoped; enforcement must be verified separately |
| Purchasing → Goods Receipt | `goods_receipts.purchase_order_id → purchase_orders.id`; `goods_receipts.supplier_id → suppliers.id`; `goods_receipts.warehouse_id → warehouses.id`; `goods_receipt_items.purchase_order_item_id → purchase_order_items.id` | Live `create_goods_receipt_by_product` creates draft GR only for PO in approved/partially_received state, locks PO/item rows, validates receipt quantity against PO. Live `post_goods_receipt_by_product` requires purchasing approval, locks GR/PO and validates supplier/warehouse consistency before posting. Both inspected functions are SECURITY DEFINER and have authentication/permission guards; privilege/ACL review remains under SEC-003. | Posted Goods Receipt activity | FK/function verified; authenticated create/post, over-receipt rejection and rollback tests pending |
| Goods Receipt → Inventory Movement | Live `post_goods_receipt_by_product` calls `create_inventory_movement_by_product` and `post_inventory_movement` to record stock receipt. `inventory_movements.source_reference_id/type/number` link back by logical source reference; no direct FK from Movement source reference to Goods Receipt was established. | Movement posting is the inventory transaction boundary; do not write Inventory Balances directly from application code. Goods Receipt computes landed item cost allocation within the posting function. | Posted Inventory Movement activity; Inventory Overview counts posted movements | Function path verified in live definition; exact per-product/IMEI/Serial behavior and E2E posting reconciliation pending |
| Inventory Movement → Balance / Valuation | `inventory_movements.product_id/product_variant_id/warehouse_id/product_unit_id`; balance unique identity uses product + warehouse; valuation log references movement, product/variant and warehouse | `post_inventory_movement` is the controlled posting boundary. Live table structure includes movement reversal reference and posted metadata; valuation log records movement-linked quantity/value/cost history. | Available, On Hand, Value, Posted Movement Count and activity feed | FK/function and balance structure verified; all status-bucket, moving-average valuation, reversal and reconciliation tests pending |
| Warehouse → Inventory Transfer | Paired outbound/inbound Inventory Movement rows use `movement_group_id`; both reference product and their respective warehouses; optional product unit supports serialized movement | Live `create_inventory_transfer_by_product` creates transfer movement rows; `post_inventory_transfer` posts the movement group. Posting function is SECURITY DEFINER and guarded by `inventory.transfer`; SEC-003 privilege review remains open. No separate transfer master table was observed in the inspected live table set. | Transfer/movement activity through Inventory Movement source | Function signature and movement schema verified; source/destination warehouse scope, atomic pair, rollback and unit-tracking tests pending |
| Warehouse → Stock Opname | `stock_opname_sessions.warehouse_id → warehouses.id`; items belong to session and reference Product/Variant; unit counts reference Product Units | Live workflow includes `create_stock_opname`, `start_stock_opname`, count recording, `reconcile_stock_opname`, approval, and `post_stock_opname`. Posting creates adjustment movement records and updates balance state through database workflow. Key workflow functions are SECURITY DEFINER and require permission checks; SEC-003 remains open. | No dedicated Stock Opname KPI in current Dashboard contract | FK/function verified; complete count/reconcile/approve/post and valuation E2E pending |
| Product Unit / Identifier → Inventory | `product_units.product_id/product_variant_id/warehouse_id`; `product_unit_identifiers.product_unit_id → product_units.id`; movements and opname unit counts reference Product Unit | Unit identity and IMEI/Serial uniqueness are separate from aggregate product stock. Movement can reference an identified unit. | No individual-unit KPI currently | Base tables/FKs verified. Optional IMEI mixed aggregate behavior in migration files 57–59 is SOURCE ONLY; those migrations are not in the current live migration ledger. Do not treat optional IMEI SKU fallback as live-enabled until migrations are explicitly approved/applied and verified. |
| User / RBAC → all modules | `user_profiles.id → auth.users.id`; `user_roles.user_id → auth.users.id`; `user_roles.role_id → roles.id`; `role_permissions.role_id → roles.id`; `role_permissions.permission_id → permissions.id` | Application authorization uses `getAuthorizationContext`; live `has_permission(text)` resolves permission; privileged RPCs also check permission in their function bodies. | All Dashboard sources are permission-dependent | FK/function/RLS verified; runtime matrix by role/action remains pending |
| User → Warehouse Access → Inventory | `user_warehouse_access.user_id → user_profiles.id`; `warehouse_id → warehouses.id` | Live `has_warehouse_access(uuid)` permits owner and certain active roles across active warehouses; warehouse-role users require an active assignment. Assignment rows are controlled by owner policy. | Inventory Balance and activity/Movement warehouse scoping | Function/policy verified. Table RLS is inconsistent across modules; see critical integration gaps below. |

## 4. Customer, Sales, Returns and Finance boundary

Read-only inspection of the live `public` schema found no base tables with names matching Sales, Returns, Receivables, Payables, Journal, Ledger, or Invoice.

Consequences:

- Customer master is currently a standalone master entity; it is not evidence of a Sales transaction module.
- Supplier fields such as `credit_limit`, `payment_term_days`, and PO totals are master/workflow data, not a vendor payable ledger.
- Goods Receipt and Inventory Movement posting do not by themselves establish Accounts Payable, COGS, Sales Revenue, Accounts Receivable, tax ledger, or general ledger entries.
- Sales KPIs, customer receivables, returns impact, supplier payables, profit, cash, and accounting reports must remain unavailable until authoritative transaction/ledger modules and posting rules exist.
- Do not create placeholder transaction tables or fake dashboard amounts as part of INT-002.

## 5. Live authorization and warehouse-scope findings

Live SELECT policies were inspected for the following tables:

| Table | Observed SELECT policy | Scope implication |
|---|---|---|
| `inventory_balances` | `inventory.view AND has_warehouse_access(warehouse_id)` | Permission and warehouse scope are both enforced in the observed RLS policy |
| `purchase_orders` | `purchasing.view` | Permission is checked; policy does not itself include warehouse access |
| `goods_receipts` | `goods_receipt.view` | Permission is checked; policy does not itself include warehouse access |
| `inventory_movements` | `inventory.view OR is_owner()` | Policy does not itself include warehouse access; Dashboard uses an additional fail-closed warehouse check for its feed/count |
| `product_units` | `inventory.view OR is_owner()` | Policy does not itself include warehouse access |
| `stock_opname_sessions`, `stock_opname_items`, `stock_opname_unit_counts` | `inventory.view OR inventory.opname OR is_owner()` (items/session/unit-count policies as inspected) | Policy does not itself include warehouse access |
| `user_warehouse_access` | Owner manages all; user can view own assignments | Assignment table is not a complete enforcement layer by itself; consumers must check effective access |

**Important:** This is an observed policy gap, not a conclusion that unauthorized users have already accessed data. Application query filters, SECURITY DEFINER RPC validation and role behavior must be tested before deciding a remediation. The next security task must evaluate whether to enforce warehouse scope in RLS, in SECURITY DEFINER function guards, or both. Do not widen permissions and do not add policies without dependency analysis and an approved migration.

### 5.1 Live RBAC assignment and permission-key snapshot

A read-only join of `roles`, `role_permissions`, `permissions`, and `user_roles` returned this live state on 2026-11-21:

| Role | Active | Assigned users | Permission count |
|---|---:|---:|---:|
| auditor | No | 0 | 11 |
| finance | Yes | 0 | 10 |
| manager | Yes | 0 | 20 |
| owner | Yes | 1 | 34 |
| purchasing | Yes | 0 | 11 |
| sales | No | 0 | 7 |
| warehouse | No | 0 | 7 |

Only the Owner role currently has an assigned user. Role/warehouse browser verification cannot be demonstrated using existing assigned non-owner accounts. Do not activate roles or assign users just to make tests pass; use an explicitly approved test-account and role-assignment plan.

The live `permissions` dictionary contains `goods_receipt.create`, `goods_receipt.post`, `goods_receipt.update`, and `goods_receipt.view`, but the live `role_permissions` mapping contains none of these permission codes for any role. The source documentation `database/06_rbac_role_mapping.sql` also does not map Goods Receipt permissions to roles and is explicitly marked documentation-only; do not rerun it as a migration.

There is an additional permission-key mismatch in the live Goods Receipt path:

- Goods Receipt table RLS policies require `goods_receipt.view/create/update/post`.
- The current application/RPC flow uses Purchase permissions: `create_goods_receipt_by_product` checks `purchasing.create`; `post_goods_receipt_by_product` checks `purchasing.approve`.
- Dashboard activity feed reads Goods Receipts only when `goods_receipt.view` is authorized.

Consequently, the current active roles do not satisfy the Goods Receipt table policy permission keys. SECURITY DEFINER RPCs that use the purchasing permission keys may still perform their guarded operation, but direct RLS-protected reads/updates and the Dashboard Goods Receipt feed can be unavailable. This must be resolved with one canonical permission model and an explicit role matrix; do not patch it by adding arbitrary role grants.

The live `has_warehouse_access(uuid)` function recognizes active `manager`, `finance`, and `purchasing` roles as broad warehouse-access roles; a `warehouse` role needs an active `user_warehouse_access` assignment. The `warehouse` role is currently inactive with no assigned users. The function's intended policy must be reconciled with the observed role map and module RLS policies.

### 5.1 SECURITY DEFINER warehouse-check follow-up

A follow-up read-only inspection of function definitions found that the sampled mutation functions below check `auth.uid()` and/or module permissions but do not directly call `has_warehouse_access()`:

- Purchase Order create/approve/cancel
- Goods Receipt create/post
- Inventory Movement create and unlocked post
- Inventory Transfer create and unlocked post
- Stock Opname create/start/count/bulk-count/unit-count/reconcile/unlocked post

The locking wrappers for Inventory Movement, Inventory Transfer and Stock Opname resolve and lock the target warehouse/session before delegating to the unlocked workflow. Their shared `lock_inventory_warehouse(uuid)` helper acquires an advisory transaction lock only; it is not an authorization check.

Because these functions run as SECURITY DEFINER, table RLS alone cannot establish warehouse isolation for their internal writes. Before any assignment-scoped Warehouse role is activated, each write path must validate the warehouse ID resolved from the locked database records. Transfer must validate both source and destination. This is a catalog-level authorization gap requiring a focused call-graph review and transaction test; it is not proof of an observed exploit.

The inspected function ACLs for the sampled operational functions list `authenticated`, `service_role`, and `postgres`; no `PUBLIC` or `anon` EXECUTE entry was returned. Their inspected `search_path` is empty. These positive controls do not replace user/warehouse checks inside SECURITY DEFINER functions.

### 5.2 Current warehouse-role semantics

The live `has_warehouse_access(uuid)` helper grants Owner and active Manager, Finance, and Purchasing roles access to every active warehouse. An active Warehouse role requires a matching active `user_warehouse_access` assignment. Only the Owner role currently has a user assignment; the Warehouse role is inactive. The helper rejects inactive warehouse rows, including for Owner, so historical access to inactive warehouses needs an explicit policy decision.

See `docs/RBAC_WAREHOUSE_ACCESS_REMEDIATION.md` for the current role snapshot, Goods Receipt permission options, target policy coverage, required tests, and approval gates.

## 6. Live database vs source migration alignment

The live migration ledger currently contains seven applied versions, ending at `20261120081908 canonical_variant_sku_and_unit_label`.

Repository SQL files `database/57_optional_imei_goods_receipt.sql`, `database/58_stock_opname_mixed_imei_count.sql`, and `database/59_optional_imei_inventory_movement.sql` are present in the implementation branch but are absent from the live migration ledger.

Therefore:

- Those files are SOURCE ONLY relative to the inspected live project.
- The live functions/tables must not be described as having completed optional IMEI aggregate fallback until the 57–59 migrations are applied under explicit approval and verified.
- No live schema or data mutation was performed during this matrix inspection.

## 7. Required E2E test matrix

| Test ID | Scenario | Preconditions | Expected result | State |
|---|---|---|---|---|
| INT-T01 | Product + multiple variants saved atomically | User with master.create; valid product and variant payload | Product, variants and specification links created together; invalid child causes transaction rollback | Pending |
| INT-T02 | Approved PO creates draft Goods Receipt | purchasing.create; PO approved/partially_received; selected warehouse and item belong to PO | Draft GR inherits supplier/warehouse and cannot exceed remaining PO quantity | Pending |
| INT-T03 | Goods Receipt posting adds stock | purchasing.approve; valid draft GR and matching PO | Posted GR creates corresponding posted Inventory Movement; balances and valuation reconcile | Pending |
| INT-T04 | Partial receipt lifecycle | PO quantity > first receipt; valid second receipt | received_quantity and PO status progress correctly; over-receipt rejected | Pending |
| INT-T05 | Inventory movement posting/reversal | inventory.update and any required finance approval | Draft is not included in balance; posted movement updates correct bucket/value; reversal is traceable and balanced | Pending |
| INT-T06 | Transfer across two warehouses | inventory.transfer; access to source and destination | One logical transfer group with outbound/inbound rows; source/destination balances reconcile; failure rolls back whole transfer | Pending |
| INT-T07 | Stock Opname lifecycle | inventory.opname; one accessible warehouse | Snapshot → counting → count → reconciliation → approval → post; adjustment movements and balance/value reconcile | Pending |
| INT-T08 | Warehouse-role isolation | Warehouse role with assignment to warehouse A only | Reads, counts, details and RPC writes cannot access warehouse B | Pending — high priority |
| INT-T09 | Purchasing/Finance role scope | Purchasing/Finance roles under current has_warehouse_access behavior | Verify permitted cross-warehouse access is intentional and matches documented business policy | Pending — high priority |
| INT-T10 | Product/SKU identity continuity | Product with multiple variants and aggregate stock | PO, receipt, movement, balance, opname and valuation all resolve the intended product/variant without SKU drift | Pending |
| INT-T11 | Optional IMEI mixed tracking | Only after approved migrations 57–59 are applied | Identified IMEI units and untagged aggregate quantity reconcile across receipt, movement, transfer and opname | BLOCKED — migrations not applied |
| INT-T12 | Customer Sales / AR / Returns | Sales/returns/ledger source modules exist | Correct posted sales/returns and customer balances; never infer from customer master | BLOCKED — source modules absent |
| INT-T13 | Supplier AP / Accounting | Payable/accounting ledger source exists | PO/GR liability and finance postings reconcile to the general ledger | BLOCKED — source modules absent |

## 8. Security and transaction review queue

1. **SEC-003 — SECURITY DEFINER review:** live metadata reports several Goods Receipt, Inventory Movement, Transfer, Stock Opname, RBAC and warehouse-access functions as SECURITY DEFINER. Review each function body, `auth.uid()` requirement, permission checks, row/warehouse ownership, search_path, and EXECUTE ACL. A function existing or checking one permission is not enough to mark it secure.
2. **GOV-001 — migration provenance:** reconcile live migration history with repository SQL source before applying any source-only migration.
3. **INT-001 — Purchasing → Goods Receipt → Inventory:** complete authenticated E2E and rollback testing.
4. **INT-002 — warehouse isolation:** test current role policies and each module's app/RPC path; design a minimal migration only after expected access semantics are agreed and reviewed.

## 9. Definition of DONE

INT-002 can be marked DONE only when:

- All critical master-to-transaction FK paths are source-controlled and aligned with live schema.
- Every critical create/approve/post/reverse flow passes authenticated E2E and rollback checks.
- Warehouse isolation is demonstrated for warehouse, purchasing, finance, manager and owner role profiles.
- Product/Variant, stock quantity and valuation reconcile across Purchasing, Goods Receipt, Movement, Transfer and Stock Opname.
- Optional IMEI mixed tracking is tested only after its migrations are explicitly approved and live-verified.
- Sales/Returns/Accounting integrations remain deferred until their authoritative schemas and posting logic exist.
- Exact commits, migrations, test evidence and remaining blockers are recorded in the shared backlog.

This document is a verified dependency map with explicit open gates; it does not declare the modules fully integrated.
