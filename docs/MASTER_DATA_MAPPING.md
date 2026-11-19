# Master Data Mapping

## Application route to entity mapping

| Entity | Route | Tables referenced in source | Downstream consumers |
|---|---|---|---|
| Product | `/products` | `products`, `product_categories`, `brands` | Purchasing, Inventory, product variants |
| Product Variant | `/products/[id]/variants` | `product_variants`, `products` | Goods Receipt, Inventory balances/movements/units |
| Category | `/product-categories` | `product_categories` | Product, attributes |
| Brand | Inline actions | `brands` | Product, Product Model |
| Product Model | `/product-models` | `product_models`, `brands`, `products`, attribute-related tables | Product catalog and attribute assignment |
| Product Attribute | `/product-attributes` | `product_attributes` | Attribute values and product model logic |
| Product Attribute Value | `/product-attribute-values` | `product_attribute_values`, `product_variant_attribute_values` | Product/variant specification display |
| Supplier | `/suppliers` | `suppliers`, regional reference tables; detail subfeatures | Purchasing |
| Customer | `/customers` | `customers`, regional reference tables | Sales (not present as route in current tree) |
| Warehouse | `/warehouses` | `warehouses` | Inventory, Purchasing/Goods Receipt |

## Database relationships evidenced in committed SQL

- `products.category_id` → `product_categories.id`.
- `products.brand_id` → `brands.id`.
- `product_variants.product_id` → `products.id`.
- `product_attribute_values.product_variant_id` → `product_variants.id`.
- `product_attribute_values.product_attribute_id` → `product_attributes.id`.
- `product_units.product_variant_id` → `product_variants.id`.
- `product_units.warehouse_id` → `warehouses.id`.
- `product_unit_identifiers.product_unit_id` → `product_units.id`.

## Unresolved relationships

Application code also references `product_models`, `product_attribute_assignments`, and `product_variant_attribute_values`. Their canonical DDL was not found in the committed SQL files inspected. Do not infer columns, foreign keys, or deletion policy from application usage alone.

## Integration flow

- Product and Product Variant IDs are used by inventory and purchasing operations.
- Goods Receipt captures variant and optional serialized unit identifiers.
- Warehouse IDs are used in purchase orders, receipts, transfers, and balances.
- Supplier IDs are used in purchase orders.
- Customer is a master entity; Sales route implementation was not present in the inspected application tree.

This mapping is source-derived and must be reconciled with the live Supabase schema before schema changes.
