# Sales Implementation Specification

**Backlog:** SALES-001  
**Status:** Phase 1 design baseline; implementation not yet applied  
**Scope:** Existing ERP Sales workflow only. This document does not introduce a separate CRM, fulfillment, or accounting module.

## 1. Business lifecycle

1. Sales Order (SO) records the customer's order commitment.
2. A confirmed SO creates a soft stock demand for its remaining undelivered quantity.
3. One SO may be fulfilled by multiple Delivery Orders (DOs).
4. Each posted DO records only its own delivered quantity as sales recognition and reduces inventory in the same database transaction.
5. Sales Invoice is a billing document only. It must not reduce inventory or recognize the same sale again.

## 2. Phase boundaries

### Phase 1 — Sales Order and Delivery Order

- Sales Order list, create, detail, edit while draft, confirm, and cancel while no quantity has been delivered.
- Delivery Order list, create from a confirmed SO, detail, and post.
- Partial fulfillment and outstanding/backorder quantity.
- Soft reservation visibility and stock validation.
- Warehouse scope and module permissions.
- Atomic DO posting with inventory movement and sales recognition.
- No direct application writes to inventory balances.

### Phase 2 — Sales Invoice

- Invoice one eligible posted DO or group multiple eligible posted DOs.
- Every invoice line references its source DO line.
- Cumulative billed quantity must not exceed delivered quantity.
- Partial delivered-but-unbilled quantity remains invoiceable.
- Invoice posting does not repeat inventory reduction or sales recognition.
- Invoice issue/receivable/tax/accounting behavior is gated by separately accepted finance decisions.

## 3. Core entities and ownership

Use existing master entities: customers, products, product_variants, and warehouses. Sales line items must reference the canonical Product and Product Variant IDs; do not duplicate product/customer/warehouse master records.

Initial transaction entities are limited to:
- Sales Order header and lines.
- Delivery Order header and lines.
- Sales Invoice header and lines in Phase 2.

Do not add standalone reservation, CRM, fulfillment, shipment, or accounting submodules. Soft reservation is derived from eligible confirmed Sales Order line balances, not a separately maintained stock ledger, unless concurrency testing proves a dedicated allocation record is necessary.

## 4. Soft reservation and stock rules

- Only confirmed SOs reserve demand.
- Reservation quantity per SO line = ordered quantity minus quantities on posted DO lines.
- Cancelled or fully delivered SO lines do not reserve stock.
- Reservation order is deterministic: earlier confirmation timestamp first, then stable SO number/ID tie-breaker.
- Reservation is warehouse-specific. Do not silently substitute another warehouse.
- No automatic expiry. A confirmed SO remains active until fulfilled or explicitly cancelled under permitted rules.
- On Hand, Reserved, and Available must be shown distinctly. Available stock for DO posting is derived from the existing sellable inventory bucket and eligible soft reservations; quarantine, damaged, repair, and non-sellable stock cannot satisfy a DO.
- Posting revalidates and allocates stock inside the database transaction. Concurrent postings must serialize against the same warehouse/product identity and cannot double-consume stock or create negative balances.
- A DO can consume the current SO's eligible reservation only after higher-priority confirmed demand is respected.
- Backorder is the remaining SO quantity not yet delivered; it is not an inventory movement.

## 5. Posting and integrity rules

- Draft SO/DO records do not affect inventory or recognized sales.
- SO confirmation does not change inventory balances.
- DO posting is the single operational recognition boundary.
- DO posting must atomically: lock the relevant SO/DO rows and inventory scope; validate status, permissions, warehouse access, remaining SO quantity, reservation priority, product tracking rules and stock; create and post the outbound inventory movement using the established posting boundary; mark DO lines and header posted; update SO fulfillment state; record posted metadata.
- If any step fails, all writes in the transaction roll back.
- IMEI/Serial support must follow the existing Product tracking policy. Do not invent a parallel serialized inventory mechanism.
- Posted DOs are immutable. Corrections require an explicit reversal workflow and corresponding inventory reversal; no direct edit/delete of posted documents.

## 6. Sales Invoice guardrails (Phase 2)

- User may invoice one posted DO or combine eligible posted DOs.
- Group only records with the same customer, currency, and compatible invoice-level tax/payment configuration.
- Every invoice line references one source DO line.
- Lock source DO lines during invoice posting; cumulative invoiced quantity cannot exceed delivered quantity.
- A partially invoiced DO line retains its uninvoiced balance.
- Invoice posting is billing only; no new inventory movement and no duplicate sales recognition.
- Do not post receivables, tax, COGS, revenue journal, or general-ledger entries until their own accounting decisions and ledger architecture are accepted.

## 7. Authorization and warehouse boundaries

Use the existing getAuthorizationContext application pattern and existing RBAC helpers/RLS approach. Add only the permissions needed for Sales Order and Delivery Order actions, following existing naming conventions after verifying the live permission catalogue. Every header and child write must enforce warehouse access, including SECURITY DEFINER RPC boundaries. Never widen access to make a screen work.

## 8. Required verification

- Migration replay from a clean baseline and development migration-ledger reconciliation.
- RLS and role allow/deny tests.
- Warehouse boundary tests.
- SO create/edit/confirm/cancel tests.
- Multiple partial DOs against one SO.
- Backorder and soft-reservation priority tests.
- Concurrent DO posting against the same stock.
- Insufficient stock and transaction rollback tests.
- Aggregate quantity and IMEI/Serial tests where the product tracking type requires them.
- Inventory balance, movement, valuation, and sales recognition reconciliation.
- Preview deployment READY and authenticated end-to-end smoke tests.

## 9. Explicit exclusions until separately approved

- Customer credit blocking/limit enforcement.
- Payment collection and settlement.
- Accounts Receivable ledger.
- Tax calculation/reporting.
- Revenue/COGS journal and General Ledger.
- Returns/credit notes and posted-document reversal UI.
- Cross-warehouse auto-substitution.
- External carrier/shipping integrations.

These are not silently inferred from customer master fields or existing inventory movement types.


## 10. Implementation blocker — inventory variant granularity

A live Development schema inspection on 2026-11-21 found that `inventory_balances` has the unique constraint `(product_id, warehouse_id)`. The current `post_inventory_movement_unlocked` implementation locks and updates the balance using `product_id + warehouse_id`; it does not partition the balance by `product_variant_id`. Although `inventory_movements`, `inventory_balances`, and `product_units` contain nullable `product_variant_id` columns, this does not provide independent stock balances for multiple variants of one Product.

This conflicts with the accepted product identity model in which each Product Variant has its own immutable SKU and stock must be attributable to that SKU. Sales Order reservation, Delivery Order availability checks, and outbound posting cannot safely be implemented at variant level until Inventory supports a canonical balance key of `product_variant_id + warehouse_id` (or a formally accepted equivalent that preserves SKU-level stock identity).

Required prerequisite work under Inventory / MD-010 integration:
- Inspect all existing Inventory read/write RPCs, balance views, valuation logs, stock opname, transfers, Goods Receipt, and product-unit tracking for assumptions that balances are product-level.
- Define a non-destructive migration from current product-level rows to variant-level balances. Do not guess a variant assignment for historical aggregate balances where the source cannot prove it.
- Update all stock movement posting and valuation paths to lock and update the canonical stock key consistently, including quantity-tracked and IMEI/Serial-tracked products.
- Add uniqueness, FK, RLS, warehouse scope, and concurrency controls for variant-level balances.
- Verify existing historical movements reconcile to opening balances and valuation totals; ambiguous legacy balances must remain explicitly unresolved rather than silently allocated.
- Run Goods Receipt, Inventory Movement, Transfer, Stock Opname, and valuation regression tests before unblocking SALES-001.

No Sales migration or live schema change is authorized by this finding. Sales implementation remains blocked until this prerequisite is source-committed, validated in Development, and its migration/legacy-data reconciliation evidence is recorded.


### 10.1 Expanded blocker evidence — source and UI contract divergence

The follow-up read-only audit found that the conflict is broader than the original live balance key:

- Variant-oriented migrations 26, 29, 33–35, and 44–49 define variant-based movement, balance, transfer, reversal, and Stock Opname paths.
- Later source migrations 57–59 redefine Goods Receipt, movement creation/posting, transfer helpers, and mixed-IMEI Stock Opname around `product_id`.
- Current Inventory server actions `app/inventory/movements/actions.ts` and `app/inventory/transfers/actions.ts` call RPCs with `p_product_id`.
- The live Development database currently uses product-level posting and has 11 of 16 balance rows with NULL `product_variant_id`; some of those rows have non-zero on-hand quantity/value. Existing product-only movement and IMEI unit history also cannot be assigned to a variant from those rows alone.
- The complete evidence, exact source references, and non-destructive remediation phases are recorded in `docs/INVENTORY_VARIANT_IDENTITY_AUDIT.md`.

This means the Sales blocker cannot be resolved by changing the balance constraint alone or by introducing a second parallel variant balance table. All active posting/read paths and historical data treatment must be reconciled as one migration plan. SALES-001 remains blocked; no Sales schema or posting implementation is authorized before MD-014 passes its Development validation gates.


### 10.2 Variant-keyed Inventory migration applied; Sales posting permission bridge required

MD-014 has now been applied to `erp-distribution-dev` as migration `20261122111715 md014_variant_inventory_movement`. Read-only post-apply checks confirm the six affected tables retained their row counts, historical Product-only rows remain unresolved (no guessed Variant mapping), Variant/Product parent mismatches are zero, and active Variant + Warehouse uniqueness is enforced with partial indexes. See `docs/INVENTORY_VARIANT_IDENTITY_AUDIT.md` §13.2.

A bounded Sales prerequisite inspection then found that the current `public.post_inventory_movement_unlocked(uuid,numeric)` requires `inventory.update` for every movement before it reads the movement row. The existing `create_inventory_movement` RPC also requires `inventory.update`. Granting `inventory.update` to all Sales users would improperly expose manual inventory adjustments.

Required narrow bridge before DO posting:

- Sales RPC validates `sales.create`, active customer, confirmed SO, exact warehouse scope, product Variant tracking policy, reservation priority, and outstanding quantity.
- Sales RPC inserts the outbound movement with immutable `source_reference_type='delivery_order'` and DO line reference.
- The shared internal posting boundary permits a `sale` movement only when it is linked to a valid DO and caller has `sales.create`; all other movement types continue to require `inventory.update`.
- The bridge must verify `has_warehouse_access(warehouse_id)` and lock the warehouse before allocation/posting. It must not set a forged service-role claim or widen warehouse access.
- One database transaction must post the movement, update the Variant balance and valuation log, transition serialized unit state when applicable, and mark DO/SO fulfillment metadata.

No Sales table or posting RPC has been created yet. The current Sales tables/RPC count is zero in Development. Existing `sales.create` and `sales.view` permissions are present; do not add redundant permission codes until the exact action matrix is proven. Sales Invoice remains Phase 2 and finance/AR/GL posting remains excluded.

## 10.3 Phase 1 implementation execution checkpoint — 2026-11-22

The feature work is isolated on `feat/sales-order-delivery-phase1-20261122`. This checkpoint is source planning and schema-contract verification only; it does not claim that Sales tables, RPCs, or UI routes have been implemented or applied.

Verified Development master contracts:
- `customers`: `id`, `customer_code`, `customer_name`, `is_active`; customer master remains canonical.
- `product_variants`: `id`, `product_id`, `variant_sku`, `variant_name`, `is_active`; Sales lines must store Variant ID and its parent Product ID consistently.
- `products`: `tracking_type` is the authoritative quantity / IMEI / serial policy.
- `warehouses`: `id`, `is_active`; warehouse access must be checked with the existing `has_warehouse_access(uuid)` boundary.
- `inventory_balances`: active stock identity is Variant + Warehouse; available, reserved, quarantine, damaged, repair, on-hand and valuation fields are already present.
- `inventory_movements`: supports Variant, Warehouse, Product Unit, movement type/status, quantity delta and source reference fields. The existing posting algorithm is the only stock mutation boundary.
- `product_units` and `product_unit_identifiers`: existing serialized unit tracking is authoritative; Sales must not create a parallel IMEI registry.

Verified application conventions:
- Server pages/actions use `getAuthorizationContext(permissionCode)` and the authenticated Supabase server client.
- Inventory movement creation/posting is routed through database RPCs; Sales must not write `inventory_balances` directly or reuse the manual movement action because that action intentionally requires `inventory.update`.
- Existing `sales.create` and `sales.view` permission codes are present. Do not add redundant permission codes before the exact action matrix is validated.

Implementation order:
1. Define SO/DO tables, constraints, indexes, RLS, and narrowly executable RPC grants in a source migration.
2. Add the internal posting permission bridge that permits only a valid DO-linked `sale` movement for a caller with `sales.create`; preserve `inventory.update` for every other movement type and preserve the existing posting algorithm unchanged.
3. Implement transactional SO lifecycle and FIFO soft-reservation calculation.
4. Implement DO creation and atomic posting with warehouse lock, stock/serialized-unit checks, movement posting, and SO fulfillment update.
5. Add Sales server actions and pages, then test role/warehouse denial, partial deliveries, FIFO priority, rollback, and concurrent posting.

Hard gates: no Development schema application until the complete migration has passed source review and explicit Development approval; no Production changes. The user's existing untracked local migration `20261122113113_sales_order_delivery_order_phase1.sql` must be preserved; this work must not overwrite or delete it. The feature branch uses a separate migration path once its timestamp is generated by the Supabase CLI.


## 10.4 Schema foundation committed — 2026-11-22

Source migration committed on the Sales feature branch:
- `supabase/migrations/20261122210000_sales_order_delivery_phase1_schema.sql`
- Creates Sales Order header/lines and Delivery Order header/lines, with references to canonical customer, product, variant, warehouse, and inventory movement records.
- Product Variant + parent Product is enforced by composite foreign keys.
- SO and DO lifecycle status metadata and posting metadata have database constraints.
- RLS is enabled on all four tables. Authenticated users receive read-only table grants, guarded by `sales.view` and warehouse access policies. Direct table writes remain revoked.
- `sales_order_line_fulfillment` is a derived read model; it calculates delivered and outstanding quantities from posted DOs only. No separate reservation ledger is introduced.

Not yet implemented: write RPCs, SO confirmation/cancellation, DO creation/posting, narrow inventory posting permission bridge, server actions, pages, and automated tests. The migration remains source-only and has not been applied to Development or Production.


## 10.5 Sales Order and draft Delivery Order RPCs — source committed

The source migration now also defines:
- `sales_create_order`: permission and warehouse-scope checks, active customer and active Product Variant validation, quantity/price validation, and integer quantities for IMEI/serial products.
- `sales_confirm_order`: row lock, non-empty draft validation, confirmation metadata, and subtotal calculation.
- `sales_cancel_order`: only draft/confirmed orders with no posted delivery can be cancelled; cancellation releases the derived soft reservation by changing SO status.
- `sales_create_delivery_order`: row lock, warehouse lock, partial quantity checks against posted fulfillment, FIFO soft-reservation priority by confirmed timestamp / SO number / ID, and serialized Product Unit validation.
- Optional Product Unit reference on DO lines to support unit-level serial/IMEI capture.

Still outstanding before this migration is executable: implement and review the narrow permission bridge in `post_inventory_movement_unlocked`, then implement atomic DO posting that creates a `sale` movement, invokes the existing valuation/posting algorithm, and commits movement + unit location/status + DO/SO fulfillment in one transaction. Do not bypass the existing movement algorithm or grant Sales users `inventory.update`.

No SQL from this source migration has been applied to Development or Production. No build, SQL parser, or integration test has been run yet.


## 10.6 Narrow inventory posting permission bridge — source committed

Source migration committed:
- `supabase/migrations/20261122223000_sales_delivery_posting_permission_bridge.sql`
- Replaces the authorization gate in the current Development definition of `post_inventory_movement_unlocked(uuid,numeric)`.
- The original posting algorithm for valuation, Variant balance mutation, serialized-unit state/location and movement metadata is retained; only the permission gate is moved until after the movement row is locked and read.
- A `sale` movement is accepted only when it has `source_reference_type='delivery_order'`, its source reference resolves to a DO line whose `inventory_movement_id` points back to that movement, the parent DO remains draft, and Product/Variant/Unit/quantity/Warehouse all match. Caller must have `sales.create` and warehouse access.
- Every non-sale movement continues to require `inventory.update`. The manual `create_inventory_movement` RPC remains unchanged and still requires `inventory.update`.

The bridge migration is source-only and has not been applied to Development or Production. Its source transformation was checked against the live canonical function definition: the reviewed permission gate and movement-read block each matched exactly once, and the generated definition retains the inventory balance and valuation sections. This is a source-level check only, not a database execution test. The bridge is designed to accept only a source-linked draft DO sale movement with `sales.create` and warehouse access; all other movement types retain `inventory.update`. The atomic DO RPC and initial UI are now committed. SQL execution, role/warehouse/concurrency/rollback, build, and browser tests remain outstanding.


## 10.7 Atomic Delivery Order posting — source committed

Source migration committed:
- `supabase/migrations/20261122230000_sales_delivery_order_atomic_posting.sql`
- Adds `sales_post_delivery_order(uuid)`, executable by authenticated users only and guarded by `sales.create`.
- Locks the DO and SO, validates active customer, exact SO/DO customer and warehouse match, warehouse access, warehouse posting lock, SO outstanding quantities, FIFO reservation priority, tracking policy, and Product Unit availability.
- Aggregates requested DO quantity per SO line before validating outstanding quantity, so repeated references cannot bypass the remaining SO quantity.
- Creates one outbound `sale` movement per DO line, links the movement to its DO line before posting, and invokes the canonical `post_inventory_movement_unlocked` algorithm. That existing function remains responsible for available-bucket checks, average-cost valuation, balance updates, valuation log and serialized-unit sold/location transition.
- Marks DO posted and updates SO to partially delivered or delivered in the same transaction. A failure in any movement rolls back the entire posting transaction.

Source-only limitations:
- This migration has not been applied to Development or Production.
- No SQL execution, parser, role/warehouse test, concurrency test, rollback test, build or browser test has been run.
- The initial single-entry Sales UI and server action layer are now committed; see §10.8.
- Sales Invoice remains excluded from Phase 1; no invoice/AR/GL logic is added.


## 10.8 Initial single-entry Sales UI — source committed

The first UI slice now exists under one `/sales` entry:
- `app/sales/page.tsx`: Sales Order list, status filter, and one create-entry action.
- `app/sales/new/page.tsx` + `sales-order-form.tsx`: customer, warehouse, order date, and repeatable product detail lines.
- `app/sales/[id]/page.tsx`: one transaction detail view containing SO lines, delivered/outstanding quantities, DO list, and available lifecycle actions.
- `app/sales/[id]/delivery-order-composer.tsx`: draft DO composition, including Product Unit selection for serialized stock when the user has `inventory.view`.
- `app/sales/actions.ts`: server actions call permission-checked SO/DO RPCs; no direct table writes.

This is intentionally a single Sales module entry, not a collection of independent sales submodules. The UI is an initial source slice and still requires TypeScript/build, authenticated role and warehouse checks, and browser validation. Serialized-unit selection depends on the caller's existing `inventory.view` permission and warehouse-scoped Product Unit read policy; this implementation does not broaden that permission.

Sales Invoice remains outside this Phase 1 slice. No invoice, payment, tax, AR, or GL behavior has been introduced.


## 10.9 Narrow inventory permission bridge — source committed

Migration:
- `supabase/migrations/20261122220000_inventory_sales_posting_permission_bridge.sql`
- Reads the canonical `post_inventory_movement_unlocked(uuid,numeric)` definition using `pg_get_functiondef`, verifies the exact expected original permission gate and movement-lock/read block, then changes only the authorization gate.
- The `sale` exception requires `source_reference_type='delivery_order'`, a source DO line linked back to the same movement ID, matching product, variant, Product Unit and exact negative quantity, DO warehouse and SO relationship, a draft DO, current user's `sales.create`, warehouse access, and movement creator identity.
- Non-sale movements retain the existing `inventory.update` requirement. Manual movement creation and the public wrapper were not changed. The internal unlocked function ACL remains unchanged; authenticated callers do not receive direct execute access.
- Source transformation was checked against the live Development function definition: exact expected blocks each matched once, and the transformed definition retains inventory balance and valuation operations. No function was changed in Development.

The complete migration sequence remains unapplied. Explicit Development approval is still required before any schema/function DDL is executed.


## 10.10 Serialized delivery composition refinement

The DO composer now supports multiple rows referencing the same SO line. This is required when a serialized SO quantity is fulfilled by multiple distinct Product Units. Client validation prevents duplicate unit selection and quantities above the SO line's remaining outstanding quantity. The server-side aggregate guard remains authoritative and prevents duplicate SO-line references from bypassing the remaining quantity.


## 10.11 Ordered migration and live Development verification — 2026-11-22

The Sales migration set is now ordered by dependency:
1. `20261122210000_sales_order_delivery_phase1_schema.sql` — SO/DO tables, RLS, derived fulfillment view and SO/DO draft lifecycle RPCs.
2. `20261122220000_inventory_sales_posting_permission_bridge.sql` — narrow authorization bridge, applied after Sales source tables exist and before the atomic posting RPC.
3. `20261122230000_sales_delivery_order_atomic_posting.sql` — atomic DO posting.
4. `20261122231500_sales_delivery_order_quantity_guard.sql` — aggregate quantity and duplicate Product Unit guard for draft DO creation.

The previous `20261122223000_sales_delivery_posting_permission_bridge.sql` full-function replacement was removed before any database application because it conflicted with the later fail-closed bridge transformation. It is not part of the active migration set.

Read-only Development verification on 2026-11-22:
- The live migration ledger contains MD-014 `20261122111715` as its latest applied project migration.
- No `sales_orders`, `sales_order_items`, `delivery_orders`, `delivery_order_items`, or `sales_*` RPC functions exist in Development.
- The canonical inventory posting function still contains the exact permission gate and movement-lock/read block expected by the bridge migration; both exact source blocks match the live function definition.
- The bridge therefore has a verified source precondition, but its SQL has not been executed against Development.

Remaining gates: test clean ordered migration replay in an isolated database, inspect resulting function ACL/RLS and security advisors, test SO edit-while-draft, test partial DO and serialized unit cases, rollback and concurrent posting, then run TypeScript/lint/build and authenticated end-to-end validation. No Sales migration has been applied to Development or Production.


## 10.12 Draft Sales Order editing and RPC boundary hardening — 2026-11-22

Source additions:
- `20261122235900_sales_order_draft_edit.sql` adds `sales_update_draft_order`, a SECURITY DEFINER RPC with an empty search_path, explicit `sales.create` and old/new warehouse checks, row locking, active customer/Variant validation, IMEI/Serial integer quantity validation, and a guard that prevents editing once any DO exists.
- The existing SO form is reused for create and edit to avoid duplicate UI implementations. `/sales/[id]/edit` is available only for draft SOs; the detail page exposes the edit link only to users with `sales.create`.
- Draft cancellation now also cancels child draft DOs, preventing an actionable DO from remaining under a cancelled SO. Posted DOs still block SO cancellation.
- Draft SO creation now calculates subtotal immediately rather than displaying zero until confirmation.
- SO/DO RPCs now reject NULL `p_items` explicitly; SQL three-valued logic must not allow NULL JSON payloads to pass an array guard.

These are source-only changes. No Sales migration has been applied to Development or Production. Required verification remains isolated migration replay, function ACL/RLS review, transaction/rollback and concurrency tests, TypeScript/lint/build, and authenticated end-to-end testing.


## 10.13 RPC input-boundary limits — 2026-11-22

Server-side validation now enforces a maximum of 2,000 characters for SO and DO notes in the create/edit RPC paths. The 100-row limit is enforced in the SO create, DO create, and SO draft-edit RPCs; these limits are not dependent solely on browser/server-action validation. Matching client actions already apply the same note length limit.
