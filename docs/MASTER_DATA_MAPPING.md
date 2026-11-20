# Master Data Mapping — HEXA CORE

## Application route to entity mapping

| Entity | Route | Tables | Downstream consumers | Status |
|---|---|---|---|---|
| Product | `/products` | products, product_categories, brands, product_models | Purchasing, Inventory, variants | PARTIAL — model_id not yet persisted by create/edit actions |
| Product Variant | `/products/[id]/variants` | product_variants, products | Goods Receipt, Inventory balances/movements/units | PARTIAL |
| Category | `/product-categories` | product_categories | Product, attributes | PARTIAL |
| Brand | Shared create helper | brands | Product, Product Model | PARTIAL |
| Product Model | `/product-models` | product_models, brands, products, product_attribute_assignments | Product catalog | PARTIAL |
| Product Attribute | `/product-attributes` | product_attributes | Product assignments and variant values | PARTIAL |
| Product Attribute Value | `/product-attribute-values` | product_attribute_values, product_variant_attribute_values | Product/variant specifications | PARTIAL |
| Supplier | `/suppliers` | suppliers, supplier_addresses, supplier_contacts, supplier_bank_accounts, product_suppliers | Purchasing | PARTIAL |
| Customer | `/customers` | customers, regional reference tables | Sales (route absent) | PARTIAL |
| Warehouse | `/warehouses` | warehouses | Inventory, Purchasing/Goods Receipt | PARTIAL |

## Live relationships confirmed

- `products.category_id → product_categories.id`
- `products.product_subcategory_id → product_categories.id`
- `products.brand_id → brands.id`
- `products.model_id → product_models.id`
- `product_models.brand_id → brands.id`
- `product_variants.product_id → products.id`
- `product_attribute_assignments.product_id → products.id`
- `product_attribute_assignments.attribute_id → product_attributes.id`
- `product_attribute_values.attribute_id → product_attributes.id`
- `product_variant_attribute_values.product_variant_id → product_variants.id`
- `product_variant_attribute_values.attribute_id / attribute_value_id` relate to attribute definitions and values
- `product_variant_attribute_values.product_id` also references the owning product through a composite relationship to variant identity/product.
- The live DB has three validated composite FKs on `product_variant_attribute_values` plus three validated single-column FKs that overlap them. The simple FKs are structurally redundant, but must be checked against PostgREST embed usage before removal.
- Live integrity counts: 2 variant-attribute rows; 0 product/variant mismatches; 0 attribute/value mismatches; 0 missing product-attribute assignments; 0 product/model brand mismatches.

## Redundancy and integrity questions

| Candidate | Why it may be redundant | Required decision |
|---|---|---|
| products.brand_id + product_models.brand_id | Same brand may be stored at product and model level | Model inheritance vs product-level override |
| products.category_id + product_subcategory_id | Both point to category table | Parent/child semantics and whether parent is derivable |
| product_variant_attribute_values.product_id | Derivable from product_variants.product_id | Whether retained composite FK is valuable for consistency/performance |
| Multiple FK constraints on variant attribute values | Legacy composite and direct FKs overlap in referenced columns | Verify exact pairs, validation, and application reliance before removing any |
| Product-level attribute assignment + variant-level attribute values | Different data grain, not necessarily duplicate | Define whether assignments are allowed attributes and variant values are actual selections |

## Integration flow

- Product/Variant IDs feed Purchasing and Inventory.
- Goods Receipt captures variants and optional serialized units.
- Warehouse IDs are shared across purchase orders, receipts, transfers, and balances.
- Supplier IDs feed purchase orders.
- Customer master has no implemented Sales route in current app tree.

This mapping is live-schema plus source-derived. No destructive schema change has been made. Product server validation and client-side categorization recommendations now share the canonical top-level category list in `lib/master-data/categories.ts`.
