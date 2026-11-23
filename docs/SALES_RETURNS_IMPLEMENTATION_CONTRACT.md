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
