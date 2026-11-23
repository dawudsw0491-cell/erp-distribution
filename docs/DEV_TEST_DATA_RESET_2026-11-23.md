# Development Test Data Reset — 2026-11-23

## Execution record

- Environment: Supabase Development
- Project: `erp-distribution-dev`
- Project ref: `vwxzlvsigxeopibnfuhp`
- Region: `ap-southeast-1`
- PostgreSQL: `17.11`
- Execution mode: one transactional `TRUNCATE ... RESTART IDENTITY CASCADE` operation
- Result: completed; post-reset verification returned zero rows for every targeted application data table
- Production: not accessed or modified
- Backup: not created, per explicit user instruction that all entered application data was disposable test data
- Supabase Branch: not created; no paid service used

## Reset scope

The following Development application data tables were truncated:

`brands`, `category_attribute_templates`, `connection_test`, `customers`,
`goods_receipt_items`, `goods_receipt_unit_identifiers`, `goods_receipt_units`,
`goods_receipts`, `inventory_balances`, `inventory_movements`,
`inventory_valuation_logs`, `product_attribute_assignments`,
`product_attribute_values`, `product_attributes`, `product_categories`,
`product_models`, `product_suppliers`, `product_unit_identifiers`,
`product_units`, `product_variant_attribute_values`, `product_variants`,
`products`, `purchase_order_items`, `purchase_orders`, `sku_registry`,
`stock_opname_items`, `stock_opname_sessions`, `stock_opname_unit_counts`,
`supplier_addresses`, `supplier_bank_accounts`, `supplier_contacts`,
`suppliers`, `user_audit_logs`, `user_deletion_requests`,
`user_warehouse_access`, `warehouses`.

The recursive FK dependency closure of the explicit target list contained only those 36 tables. No additional public table was pulled into the TRUNCATE cascade.

## Preserved data and structures

The following application security/bootstrap data was preserved and verified:

| Table / source | Rows after reset |
|---|---:|
| `auth.users` | 1 |
| `public.user_profiles` | 1 |
| `public.user_roles` | 1 |
| `public.roles` | 7 |
| `public.permissions` | 39 |
| `public.role_permissions` | 100 |

Indonesia geographic reference tables were preserved:

| Table | Rows after reset |
|---|---:|
| `indonesia_provinces` | 38 |
| `indonesia_regencies` | 514 |
| `indonesia_districts` | 7,285 |
| `indonesia_villages` | 83,762 |

The migration ledger, schema, constraints, indexes, RLS policies, grants, functions and triggers were not intentionally changed. The critical Inventory movement/valuation guards and Product/Product Variant SKU registry triggers were checked after reset and remained enabled.

## Migration provenance

The Supabase migration ledger remained unchanged and contains 9 migrations. Latest entry:

- `20261122111715 md014_variant_inventory_movement`

This data reset was not a schema migration and did not add or remove a migration-ledger entry.

## Post-reset assertions

All 36 targeted tables returned zero rows after the transaction. Specifically:

- Inventory balances: 0
- Inventory movements: 0
- Inventory valuation logs: 0
- Product Units and identifiers: 0
- Products and Product Variants: 0
- Purchase Orders and items: 0
- Goods Receipts, items and unit identifiers: 0
- Stock Opname sessions, items and unit counts: 0
- Suppliers, Customers, Warehouses and catalog masters: 0
- SKU registry: 0
- User audit logs and deletion requests: 0

Protected counts remained intact as shown above. Migration ledger still contains the same 9 entries.

## Operational consequence

Development is now a clean application-data baseline, not a fully seeded operational dataset. Before testing purchasing or inventory workflows, create the required master records again (at minimum warehouse, supplier, product, product variants, and any required attributes). The Owner login and role/permission mappings remain.

No Production action was performed. No paid Supabase resource was provisioned.
