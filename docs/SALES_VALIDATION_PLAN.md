# Sales Phase 1 — Validation and Replay Plan

Status: PREPARED — NOT EXECUTED  
Scope: Sales Order → partial Delivery Order → atomic inventory posting.  
Environment: isolated disposable Development database only. No Production changes.

## Preconditions

1. Use a clean disposable database whose baseline matches the active Development schema after MD-014.
2. Reconcile the source migration chain and migration ledger before replay. Do not assume the existing Development database is a clean baseline.
3. Preserve the active migration order:
   - `20261122210000_sales_order_delivery_phase1_schema.sql`
   - `20261122220000_inventory_sales_posting_permission_bridge.sql`
   - `20261122230000_sales_delivery_order_atomic_posting.sql`
   - `20261122231500_sales_delivery_order_quantity_guard.sql`
   - `20261122235900_sales_order_draft_edit.sql`
4. Verify the bridge precondition against the exact canonical `post_inventory_movement_unlocked(uuid,numeric)` definition before applying it.
5. Use dedicated disposable fixtures for customers, warehouses, Products, Product Variants, Product Units, users, roles, and stock. Do not use production records or modify the live Development dataset.
6. Capture schema, row counts, inventory balances, movement rows, valuation logs, Product Unit state/location, and migration ledger before and after every test group.

## A. Schema and referential integrity

- Confirm the four Sales tables and the derived `sales_order_line_fulfillment` view exist.
- Confirm SO/DO header references point to canonical customers and warehouses.
- Confirm SO and DO lines enforce the composite Product Variant + parent Product relationship.
- Confirm DO line Product Unit references are nullable and reference the canonical `product_units` table.
- Confirm SO/DO status and posting-metadata checks, indexes, RLS enablement, explicit PUBLIC/anon/authenticated revocation on Sales tables/view/sequences, SELECT-only table grants, and authenticated RPC grants.
- Confirm there are no direct authenticated table write grants and no duplicate Sales tables, alternate IMEI registry, or separate reservation ledger.
- Confirm the derived fulfillment view counts posted DO quantities only.

## B. Function security and authorization

- Inspect owner, `SECURITY DEFINER`, `search_path`, ACL, and execute grants for every Sales RPC and the transformed inventory posting function.
- Verify no Sales RPC is executable by `PUBLIC` or `anon`; only intended authenticated functions are executable by `authenticated`.
- Verify internal `post_inventory_movement_unlocked` remains non-executable by `authenticated`, `anon`, and `PUBLIC`.
- Verify `sales.view` permits reads only for authorized users and warehouse scope.
- Verify `sales.create` permits SO/DO RPC actions only for authorized users with access to the selected warehouse.
- Verify serialized Product Unit reads respect the existing `inventory.view` and warehouse RLS boundary.
- Verify a source-linked draft DO sale movement can pass the narrow bridge, while manual adjustment, purchase, transfer, return, and other non-sale movements still require `inventory.update`.
- Attempt mismatched DO line, movement ID, product, variant, unit, quantity, warehouse, creator, status, and source-reference combinations; all must fail closed.

## C. Sales Order lifecycle

- Create a valid SO with one and multiple Product Variants; verify server-calculated subtotal and line totals.
- Reject missing/invalid customer, inactive customer, inaccessible/inactive warehouse, inactive Product/Variant, malformed UUID, invalid price/quantity, empty or NULL item payload, more than 100 rows, and notes longer than 2,000 characters.
- Verify IMEI/Serial quantities must be integers; quantity-tracked products may retain supported fractional quantities.
- Confirm only a non-empty draft SO can be confirmed and confirmation metadata is written.
- Edit a draft SO with no DO; verify header and lines replace atomically and subtotal recalculates.
- Reject draft edit after any DO exists, after status changes, with inactive customer/warehouse/Variant, or without permission.
- Cancel a draft/confirmed SO; verify draft child DOs are cancelled and soft reservation is released.
- Reject cancellation after any posted DO exists.

## D. Delivery Order and fulfillment

- Create one DO and multiple partial DOs against a confirmed SO.
- Create multiple DO lines for one SO line to represent separate serialized Product Units.
- Reject empty/NULL payload, more than 100 rows, invalid SO line, non-positive quantity, aggregate duplicate-line quantity above outstanding, duplicate Product Unit IDs, wrong Variant, wrong warehouse, unavailable Product Unit, and quantity-product/Product Unit mismatch.
- Verify Serial requires one Product Unit per DO line and quantity 1.
- Verify IMEI accepts integer aggregate quantities without a Product Unit; a selected Product Unit must represent one unit.
- Verify outstanding quantity derives only from posted DOs; draft DOs do not falsely reduce delivered quantity.
- Verify older confirmed SO soft-reservation priority blocks a later SO for the same Variant and warehouse.
- Verify DO cannot be created or posted against inactive customer or inactive/inaccessible warehouse.

## E. Atomic posting, inventory and valuation

- Post a valid DO; verify each DO line creates exactly one source-linked outbound `sale` movement.
- Verify movement source type is `delivery_order`, source ID is the exact DO line ID, movement linkage points back to the same movement, and quantity delta equals the negative DO line quantity.
- Verify the canonical inventory posting algorithm remains responsible for available-stock checks, Variant balance mutation, average-cost valuation, valuation log, and serialized unit sold/location transition.
- Verify posted DO and SO fulfillment status change in the same transaction as all inventory movements.
- Force a later line to fail after an earlier line has passed; verify all movements, balances, valuation logs, unit state, and DO/SO status roll back.
- Reject insufficient available stock, invalid unit status/location, duplicate unit, over-delivery, and invalid FIFO priority.
- Run concurrent posting attempts for the same SO and warehouse; verify SO/DO/warehouse locks prevent double fulfillment, negative stock, and duplicate unit sale.
- Verify independent warehouse transactions remain isolated and authorized warehouse scope is enforced.

## F. UI and server-action checks

- List page: search by SO number, filter each status, paginate beyond 50 rows, preserve filters across pages, and display exact result count.
- Create/edit form: master-data read failures are explicit; invalid serialized fractional quantities are blocked client-side and remain rejected server-side.
- Detail page: status labels are readable; SO lines, delivered/outstanding quantities, DO rows, and action visibility match permissions and status.
- Error states: failed master/detail reads must not render as a valid empty transaction; failed actions must show their error notice.
- Serialized delivery: without `inventory.view`, Serial DO composition must not proceed; aggregate IMEI delivery remains available without unit selection.
- Confirm, cancel, edit, create DO, and post DO actions are hidden or denied when permission/status gates do not allow them.

## G. Exit criteria

A test group passes only with captured assertions and evidence. SALES-001 cannot be marked DONE until:
- ordered migration replay succeeds on the isolated clean baseline;
- schema, FK, index, RLS, ACL, and Security Definer checks pass;
- role and warehouse allow/deny tests pass;
- SO/DO lifecycle, partial delivery, FIFO, Product Unit, rollback, and concurrency tests pass;
- TypeScript, lint, and build pass on the exact tested commit;
- authenticated browser end-to-end checks pass;
- Preview deployment for the tested commit is READY;
- the shared backlog records exact commit, environment, evidence, and remaining blockers.

No migration is applied to the connected Development database or Production as part of preparing this plan.
