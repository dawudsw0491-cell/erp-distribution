# Sales & Supplier Returns — Implementation Contract

Status: DESIGN BASELINE — NO DATABASE OR INVENTORY WRITES
Environment: Development design only. Production untouched.

## Purpose and scope

Implement customer returns and supplier returns as one Returns workspace with two source-aware transaction types. A return is not a free-form stock adjustment. Every return line must point to the original posted source line and must be limited by the source quantity not previously returned.

The workspace is a single entry point; customer/supplier is a transaction type, not a separate module or duplicate inventory ledger.

## Verified source contracts

### Customer return
- Source document: a posted `delivery_orders` record and its `delivery_order_items`.
- Optional commercial reference: related `sales_invoices` / `sales_invoice_items`.
- Customer, warehouse, Product, Variant and source quantity are inherited from the source transaction; they must not be independently editable.
- Invoice linkage must be validated against the same source DO line when supplied. The current invoice schema links invoice lines to `delivery_order_item_id`.
- Existing permission `sales.return` exists in Development. Its effective role assignments and warehouse boundary still require explicit verification before RPC authorization is finalized.

### Supplier return
- Source document: a posted `goods_receipts` record and its `goods_receipt_items`.
- Supplier, warehouse, Product/Variant and received quantity are inherited from the source GR/PO line.
- Return quantity must be bounded by posted receipt quantity less prior posted supplier returns.
- Existing source tables retain PO linkage through `purchase_order_item_id`; no separate supplier-return source ledger exists.

## Shared transaction lifecycle

1. Draft: create header and source-linked lines; no stock mutation.
2. Review: validate source document remains posted, source line belongs to that document, remaining returnable quantity, warehouse access, Product tracking type, and unit identity.
3. Approve/post: one atomic server-side operation locks the source document and warehouse, rechecks all quantities and unit state, writes source-linked inventory movements, updates serialized unit state where applicable, and marks the return posted.
4. Posted: immutable operational record. Corrections require a controlled reversal record; never edit/delete posted lines or directly rewrite inventory balances.
5. Cancel: draft-only cancellation. Posted returns cannot be cancelled by a simple status update.

Customer and supplier returns share the same lifecycle but retain distinct source constraints and movement types.

## Disposition and stock effects

The inventory movement engine supports inventory statuses `available`, `reserved`, `quarantine`, `damaged`, and `repair`; quantity movements accept `customer_return` as positive and `supplier_return` as negative.

- Customer return: returned stock must enter an explicitly recorded disposition bucket. A returned unit must not automatically become sellable. Disposition selection and inspection evidence are required before posting.
- Supplier return: stock must leave the exact bucket/status from which the item is being returned. Posting must reject insufficient eligible quantity or a serialized unit not located in the source warehouse.
- Quantity-tracked products may use aggregate quantity. IMEI tracking remains optional at unit level, so tagged units and untagged aggregate quantities must be handled without double-counting. Serial-tracked products require one unique Product Unit per returned unit.
- IMEI/Serial quantities must be integers. A Product Unit may appear only once per return and must match Product Variant and warehouse.
- Existing inventory posting functions are the only permitted balance/valuation mutation path. Do not write `inventory_balances` directly.

## Valuation and accounting gates

The existing inventory posting engine calculates weighted-average inventory valuation for inventory movements. Before enabling customer-return posting, verify the exact behavior for `customer_return` with a source-linked return and decide the unit-cost basis. Do not use invoice selling price as inventory cost by assumption.

Supplier-return valuation must reverse inventory cost using the original received cost / current valuation contract, not an arbitrary user-entered amount. This requires an explicit, tested valuation rule.

No GL journal, AR credit note, AP debit note, cash refund, or customer balance adjustment is part of this contract yet. These require the Chart of Accounts, double-entry mapping, tax/rounding policy, and approval of finance rules. A return must not silently change invoice paid amount or create a refund/payment.

## Security and integrity requirements

- RLS enabled on all exposed return tables.
- No direct authenticated table writes; create/edit-draft/approve/post/cancel/reverse through narrowly scoped RPCs.
- SECURITY DEFINER only where required; empty search_path, explicit auth.uid check, exact permission checks, warehouse authorization, revoked PUBLIC/anon execute, authenticated grants only.
- `sales.return` must be checked for customer-return scope and not assumed to authorize supplier returns. Supplier-return permission mapping must be validated against existing purchasing permissions/roles before implementation.
- Lock order must be documented and consistent with existing Sales SO → DO → warehouse and Inventory warehouse locks. Recheck source quantity under lock to prevent duplicate/concurrent returns.
- Source reference type/id/number on each inventory movement must point to the return line/header according to one documented convention.
- Reject source document not posted, cross-document line, mismatched customer/supplier/warehouse/Product/Variant, non-positive quantity, over-return, duplicate source line overflow, invalid unit, unsupported disposition, and repeated posting.
- All line movements, Product Unit changes, return status and source return counters must commit or roll back together.

## Required validation before schema implementation

1. Inspect exact `post_inventory_movement_unlocked` valuation and stock-status behavior for `customer_return` and `supplier_return`.
2. Verify `sales.return` role grants and warehouse policy; define supplier-return permission using existing RBAC vocabulary.
3. Agree on customer-return disposition and inspection flow.
4. Agree on customer credit/refund and supplier credit/debit treatment; until then finance effects remain out of scope.
5. Define return reversal rules and audit metadata.
6. Build clean-baseline migration replay and role/warehouse/concurrency test fixtures; do not use the connected Development business data as a disposable test database.

## Implementation sequence

- RET-001A: source and permission contract verification.
- RET-001B: return header/line schema and draft RPCs (only after contract gates above).
- RET-001C: atomic approval/posting with inventory and serialized unit handling.
- RET-001D: one Returns workspace, register, source selection, draft detail and posting UI.
- RET-001E: authenticated role/warehouse, over-return, concurrency, rollback, valuation and browser E2E.
- RET-001F: finance integration only after ACC-001 double-entry policy is approved.

No database migration or inventory mutation is authorized by this design document.


## Verified live posting-engine behavior (Development)

Read-only inspection of `post_inventory_movement_unlocked(uuid,numeric)` confirms:

- Both return movement types require a separate approver: `approved_by` / `approved_at` must be present, creator and approver must differ, poster must differ from approver, and the posting actor must have `finance.approve`.
- Customer return is strictly positive and must enter `quarantine`; a serialized returned unit must currently be `sold` with no warehouse, then becomes `quarantine` in the destination warehouse. The movement requires a non-null source reference. The engine requires an explicit `p_unit_cost` and assigns it to a serialized unit.
- Supplier return is strictly negative. Its valuation uses the current warehouse average cost in the inventory posting engine; serialized units must be in the warehouse and their current status must match the movement's selected inventory bucket, then become `returned_to_supplier` with no warehouse.
- Positive movements require a valid `p_unit_cost`; outbound supplier return removes value at the current average cost. No arbitrary selling price should be passed to the movement engine.
- `inventory_valuation_logs` records the movement type, quantity/value deltas, and average cost before/after.
- Current role mapping includes `sales.return` for Sales, Manager and Owner; `purchasing.approve` for Manager and Owner; and `finance.approve` for Finance, Manager and Owner. Role mapping is confirmed, but live user assignments and warehouse isolation still require runtime tests.
- The engine's customer-return quarantine rule is stricter than a free choice of sellable/quarantine/damaged. Any disposition change must be a separate controlled inspection/status-change process after return receipt, not an override of the return posting movement.

### Customer return cost basis gate

The Sales DO line stores its outbound movement ID, and the valuation log stores the exact inventory value removed by that movement. For an aggregate customer return, the candidate historical cost is the absolute original sale movement's `inventory_value_delta` divided by its absolute `quantity_delta`. For a serialized unit, the Product Unit's historical `unit_cost` may be used only if it is preserved and independently verified. This candidate basis must be tested for partial returns, multiple sales at different average costs, and repeat returns before implementation; the schema must not derive return cost from invoice selling price.

### Remaining blockers

- Confirm how source return quantities are protected against duplicate and concurrent requests and how a source movement is located for both aggregate and serialized returns.
- Confirm supplier return source-line valuation against Goods Receipt's posted purchase movement and its valuation log, especially if stock has since been transferred or mixed.
- Confirm the intended approval action and actor permissions in RPC design, including whether supplier return approval should require both `purchasing.approve` and the engine's `finance.approve`.
- Validate clean-baseline migration replay and browser flows before applying any schema change to connected Development.


### Additional source-lineage inspection (Development, read-only)

The current source linkage is asymmetric and must be respected:

- Each posted Delivery Order line stores its exact outbound inventory_movement_id. The DO posting function creates one sale movement per DO line and uses source_reference_type = 'delivery_order' with source_reference_id = delivery_order_items.id. This gives customer returns a deterministic source movement and valuation-log lookup.
- Goods Receipt lines do not store an inventory movement ID. The Goods Receipt posting function creates one or more purchase movements per receipt header and sets source_reference_type = 'goods_receipt' and source_reference_id = goods_receipts.id. Quantity-tracked GR lines can therefore share the receipt-level source reference; IMEI/serial receipt movements may be split into one movement per tagged unit plus one aggregate movement for untagged quantity.
- Goods Receipt line cost is computed from net goods value plus proportionally allocated PO shipping, excluding recoverable tax. The movement valuation log records the posted movement value. Supplier-return source attribution cannot safely assume a one-to-one GR-line-to-movement relationship.
- The movement engine values supplier returns at the current average cost of the exact warehouse/variant balance, not the original GR unit cost. This is the existing live inventory valuation contract and must remain the stock ledger's authoritative result. A supplier-return workflow may preserve original GR cost for traceability, but must not override the movement engine's current-average-cost calculation.
- The customer return source movement can be resolved through delivery_order_items.inventory_movement_id; source valuation must use its posted valuation log, not invoice price. Partial return quantities must be costed against the original movement's recorded unit value basis, with rounding reconciliation explicitly defined before posting is enabled.

### Implementation gate update

Read-only inspection confirms a deterministic customer-return source movement, but does not resolve the complete supplier-return per-line lineage or the accounting treatment. Therefore RET-001B/RET-001C remain gated: do not create return tables, draft RPCs, posting RPCs, or UI actions until the source-lineage strategy, serialized/aggregate IMEI split rules, return-quantity lock key, approval actor sequence, and reversal contract are finalized. No connected Development schema or business data was changed by this inspection.


## Return implementation decisions resolved from existing engine contracts

The following implementation rules are now fixed by the live source relationships and posting function behavior; they do not require new accounting assumptions:

1. **Concurrency boundary:** draft creation does not reserve returnable quantity. Posting locks the source parent document first (`delivery_orders` for customer returns, `goods_receipts` for supplier returns), then locks the source lines in stable ID order, then locks the target warehouse through the existing inventory warehouse lock. Every return posting for the same source document therefore serializes on the same parent row. Remaining quantity is recomputed from posted return lines while holding that lock. Drafts may race; only one posting can consume the last remaining quantity.
2. **Customer return cost:** aggregate return cost uses the original DO line's `inventory_movement_id` and its posted `inventory_valuation_logs` row. The per-unit basis is `abs(inventory_value_delta) / abs(quantity_delta)` at the source movement precision; final movement cost is rounded by the existing valuation engine. Serialized return cost comes from the original Product Unit `unit_cost`, and posting must reject missing or negative cost. Invoice selling price is never used.
3. **Supplier return cost:** the existing posting engine intentionally removes stock at the current warehouse/variant average cost. The return record keeps the source GR item and receipt reference for traceability, but must not attempt to reverse the historic receipt movement or inject a historic cost into the posting engine. This preserves current weighted-average inventory valuation after transfers and mixed receipts.
4. **Approval sequence:** a return draft is created by its initiator. A separate authorized approver records approval metadata; creator and approver must differ. The posting actor must also differ from the approver and must hold `finance.approve`, as required by the existing inventory engine. Customer return additionally requires `sales.return`; supplier return requires `purchasing.approve`. No single actor may bypass the engine's separation-of-duties check.
5. **IMEI/Serial:** each explicitly tagged unit is one return line with quantity exactly 1 and a unique Product Unit; untagged IMEI stock is returned as an aggregate line without Product Unit. Serial-tracked lines always require a Product Unit and quantity 1. The same Product Unit cannot occur twice in one return or in already-posted returns for the same source unit.
6. **Customer disposition:** posting always enters quarantine, as enforced by the engine. Inspection and disposition changes remain a separate controlled inventory process.
7. **Supplier eligible bucket:** the line captures the exact source inventory status selected at return time; posting validates the Product Unit status and aggregate bucket stock through the existing movement engine. No direct balance updates are permitted.

### Remaining implementation work (not permission to bypass gates)

The source document lock, quantity recomputation, and valuation source are now defined. Before writing migrations, the implementation must inspect the complete goods-receipt unit identifier relationship and the inventory movement creation signature, then define exact RPC lock order and return-to-movement source reference convention. Migration replay remains required before applying schema to connected Development. Finance-side credit/refund and supplier debit/credit notes remain outside inventory return posting until the Accounting source-event contract exists.


### Goods Receipt serialized-unit lineage resolved

`goods_receipt_units` stores `goods_receipt_item_id` and `unit_code`; the Goods Receipt posting function creates `product_units` with the same `unit_code` and `product_variant_id`, then copies identifiers into `product_unit_identifiers`. Therefore a supplier-return tagged unit can be resolved through the source GR item to its Product Variant and the matching Product Unit `unit_code` (with warehouse and identifier consistency checks). The return line must retain both `goods_receipt_item_id` and `product_unit_id`; it must not infer source ownership from an IMEI value alone. A unit is returnable only while it remains in the receipt's warehouse, has an eligible inventory status, and has not already been returned.

This closes the serialized source-lineage question for Goods Receipt. The remaining implementation prerequisites are to inspect exact approval RPC/RBAC conventions and settle the canonical movement source reference convention; both are source-level checks. The final accounting treatment of supplier credit/debit remains separate.


### Approval and permission contract verification — 2026-11-23

The live Development RBAC and inventory movement authorization were inspected together:

- `inventory_movements` has RLS enabled, authenticated SELECT only, and no authenticated INSERT/UPDATE/DELETE grant. Its only SELECT policy requires `inventory.view` (or owner) plus warehouse access.
- Movement draft creation helpers require `inventory.update`. The core posting engine also requires `inventory.update` for every movement except `sale`.
- Current role permissions relevant to Returns:
  - Sales: `sales.return`
  - Manager: `sales.return`, `purchasing.approve`, `finance.approve`
  - Finance: `finance.approve`
  - Warehouse: `inventory.update`
  - Owner: `sales.return`, `purchasing.approve`, `finance.approve`, `inventory.update`
  - Purchasing: `purchasing.approve`; it does not currently have `inventory.update` in the inspected mapping.
- Therefore the existing generic movement helpers cannot be called directly by every intended Returns role. Do not silently grant broader `inventory.update` permission to Sales, Purchasing, or Finance.
- The Returns implementation must use narrowly scoped SECURITY DEFINER RPCs for draft creation, approval, and posting. A narrowly scoped authorization bridge in the inventory posting engine is still required so that customer-return posting accepts the Returns-specific authorization contract (`sales.return` plus the existing maker-checker/finance approval requirements), and supplier-return posting accepts `purchasing.approve` plus those same separation-of-duties requirements. Other movement types must continue to require `inventory.update`.
- Approval RPC must set `approved_by` and `approved_at` only on draft movements linked to the same draft Return header/line. No direct authenticated table update is allowed.
- Canonical movement source references are fixed as `source_reference_type = 'customer_return'` or `'supplier_return'`, `source_reference_id = return line id`, and `source_reference_number = return document number`. This keeps the movement traceable to the exact Return line and avoids overloading the original DO/GR source reference.

**Implementation gate:** do not apply a Return migration to connected Development until the scoped posting-authorization bridge and clean-baseline migration replay are in place. This inspection was read-only; no schema, role assignment, or business data was changed.


## Source implementation milestone — RET-001B/001C/001D (2026-11-23)

Source files now exist on the implementation branch; they have **not** been applied to Development and have not been functionally tested.

- Migration source: `supabase/migrations/20261123140000_sales_returns_lifecycle.sql`.
- Tables: `sales_returns`, `sales_return_items`; SELECT-only authenticated grants with RLS policies for Sales and Purchasing visibility.
- RPCs: `sales_return_create_draft`, `sales_return_approve`, `sales_return_post`, and `sales_return_cancel_draft`.
- The canonical `post_inventory_movement_unlocked` definition is replaced in the migration with a narrow authorization bridge. Customer return requires `sales.return` and `finance.approve`; supplier return requires `purchasing.approve` and `finance.approve`. Other movement types retain the existing `inventory.update` gate.
- Movement source refs are Return-line-specific: `customer_return` / `supplier_return` and Return line UUID.
- Posting serializes on source parent, then source lines, then warehouse. It rechecks remaining source quantity and duplicate serialized-unit returns. Multiple lines for the same source line are cumulatively counted in stable line-ID order.
- Customer return uses the original DO movement valuation log for aggregate cost, and Product Unit historical cost for tagged units. Supplier return leaves cost null so the existing engine uses current warehouse average cost.
- Customer return enters quarantine. Supplier return removes the exact selected source inventory bucket. Tagged Product Units are one unit per line; untagged IMEI aggregate quantities remain supported.
- UI source files: `app/returns/actions.ts`, `app/returns/page.tsx`, `app/returns/new/page.tsx`, `app/returns/return-composer.tsx`, and `app/returns/[id]/page.tsx`. The existing sidebar already contained a single Returns entry.

### Not yet complete / release blockers

- Migration has not been replayed on an isolated clean baseline. It must not be applied to connected Development or Production before that gate.
- No ad-hoc functional tests, build, lint, browser E2E, or business data creation were run, per the deferred integrated-validation policy.
- Supabase Data API exposure for newly created public tables still needs confirmation before relying on direct table reads from the UI.
- Draft edit, document-level cancellation UX is present for draft only; posted reversal is not implemented and must remain unavailable.
- Source document navigation/reference display can be improved; current detail page identifies source document type but not yet its source number/link.
- Finance credit/refund, supplier debit/credit, AR/AP and GL remain outside Returns until Accounting contract is approved.


### UI/source-lineage refinement

- Customer-return Product Unit is derived server-side from the selected posted DO line; the browser cannot substitute a different unit. This avoids depending on direct Product Unit table visibility for Sales users.
- Supplier-return unit selection sends the original Goods Receipt `unit_code`; the draft RPC resolves it to the canonical Product Unit and verifies receipt-line ownership, Variant, warehouse and source inventory status.
- The initial composer exposes one individually tagged unit per source line per draft. The database posting contract supports multiple tagged unit lines; the current UI may require separate drafts for multiple units from one GR line until multi-unit selection is added.
