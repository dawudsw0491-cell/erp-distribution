# Master Data Analysis — AS-IS and TO-BE

**Repository baseline:** `master` at `8eadef2`; implementation work retains the valid Hub and shared Brand helper.
**Live schema:** Supabase `erp-distribution-dev`, inspected 2026-11-20.

## AS-IS inventory

| Entity / capability | Route / implementation | Status | Assessment |
|---|---|---|---|
| Product | `/products` | PARTIAL | Core identity, SKU, category, brand, type, condition, tracking; product also has optional model_id and subcategory |
| Product Variant | `/products/[id]/variants` | PARTIAL | Retain; Goods Receipt and Inventory depend on variant IDs |
| Product Category | `/product-categories` | PARTIAL | Separate reference CRUD is appropriate; category hierarchy exists |
| Brand | Shared helper, no dedicated route | PARTIAL | Create logic centralized; management/list lifecycle still not a canonical standalone surface |
| Product Model | `/product-models` | PARTIAL | Live table exists; product references model_id; brand also exists directly on Product |
| Product Attributes | `/product-attributes` | PARTIAL | Attribute dictionary exists |
| Product Attribute Values | `/product-attribute-values` | PARTIAL | Live value dictionary and assignment/variant value relations exist; duplicated relationship constraints require rationalization |
| Supplier | `/suppliers` | PARTIAL | Main record plus addresses, contacts, bank accounts, product relations |
| Customer | `/customers` | PARTIAL | Master CRUD exists; Sales route not implemented |
| Warehouse | `/warehouses` | PARTIAL | One shared location master consumed by Inventory and Purchasing |

## Live data model facts

- `product_models` has `brand_id`, `model_code`, `model_name`, `description`, `is_active`, timestamps.
- `products` has both `brand_id` and nullable `model_id`, plus `category_id` and `product_subcategory_id`.
- `product_attribute_assignments` links `product_id` to `attribute_id`, with required/active/display-order metadata.
- `product_attribute_values` is a value dictionary keyed by `attribute_id`, `value_code`, and `value_name`.
- `product_variant_attribute_values` stores `product_variant_id`, `attribute_id`, `attribute_value_id`, and also `product_id`.
- The live schema has three validated composite foreign keys on `product_variant_attribute_values`: `(attribute_id, attribute_value_id)` → `(attribute_id, id)` on `product_attribute_values`; `(product_id, attribute_id)` → `(product_id, attribute_id)` on `product_attribute_assignments`; and `(product_variant_id, product_id)` → `(id, product_id)` on `product_variants`. Three additional single-column FKs on `attribute_id`, `attribute_value_id`, and `product_variant_id` overlap these guarantees. Their constraints are structurally redundant, but removal is deferred until all PostgREST relationship embeds and code consumers are checked.
- Live existence of these tables is now confirmed; their migration provenance is still not found in the tracked numbered SQL inventory.

## Live integrity checks

- Current `product_variant_attribute_values` row count: 2.
- Product/variant ownership mismatches: 0.
- Attribute/value mismatches: 0.
- Variant attribute values missing a matching product-level attribute assignment: 0.
- Product/model brand mismatches for products with a model: 0.
- All three composite foreign keys and all three overlapping simple foreign keys are validated.

## Redundancy candidates — no destructive change made

1. Product-level `brand_id` duplicates the brand reachable through `products.model_id → product_models.brand_id` whenever a model is assigned. Decide whether brand is inherited from model or may intentionally override it.
2. Product category and product_subcategory_id both exist. Confirm whether subcategory is a child row of the same category table and whether category_id is redundant when subcategory is populated.
3. `product_variant_attribute_values.product_id` is derivable through `product_variant_id → product_variants.product_id`; current composite FK may be present to guarantee consistency. Evaluate query benefit vs duplicated state.
4. Attribute assignment is product-grain, while attribute values are variant-grain. Preserve this distinction until requirements confirm whether all assigned attributes are required on every variant.
5. Duplicate-looking FK constraints on variant attribute values must be evaluated by their exact column pairs; no FK has been dropped.

## Requirement decision — single Product Management workspace

The authoritative requirement is one Product Management workspace. Category, Brand, model information, SKU type, variants, and specifications are product details in the same workflow, not independent user work areas. Product creation and editing must not require navigation across standalone Product Model, Product Attribute, Attribute Value, or Category screens.

Navigation consolidation has been implemented in the Master Data Hub and sidebar: only Product Management is exposed for product setup. The standalone route source is retained temporarily while its actions, forms, API consumers, foreign keys, triggers, and inventory/purchasing dependencies are traced. This is a retirement state, not a decision to preserve those modules.

### Destructive cleanup gate

- Demo rows are not a reason to retain redundant schema.
- Do not drop Product Variant identity while purchasing, receipt, stock movement, serialized-unit, or valuation consumers still depend on it.
- Product and Product Variant both store SKU (`products.sku`, `product_variants.variant_sku`). Select canonical SKU ownership only after tracing transaction foreign keys and RPCs.
- Product and Product Model both store Brand ownership. Treat Product Model as a candidate descriptive property, not an independently managed entity.
- Product Attribute, Attribute Value, product assignments, and variant values should be managed in the same Product Management workflow, not separate CRUD screens.
- Category hierarchy remains a classification dimension but must be captured inline in Product Management.
- No permanent database drop until the consumer inventory and replacement migration are complete and verified.

## Design principles

1. Product `id` remains the stable product identity.
2. Product SKU remains generated by database RPC `generate_product_sku`; do not introduce a second generator.
3. Variants remain because Purchasing and Inventory depend on variant identifiers.
4. Reference entities remain single-source records; do not copy their labels into transaction tables as editable master data.
5. Type, condition, tracking type, category, and model remain distinct dimensions until consumer analysis proves otherwise.
6. Warehouse remains one entity shared by Inventory and Purchasing.
7. Demo data does not justify preserving redundant schema. It also does not authorize an unreviewed data reset.

## Implemented on the active work branch

- Master Data Hub links all eight existing master areas.
- Product and Product Model brand creation delegate to one server-only helper.
- Product create/edit server validation and the client-side product categorization recommendation now consume one canonical `MAIN_PRODUCT_CATEGORIES` definition from `lib/master-data/categories.ts`; duplicate arrays were removed.
- Product create/edit forms now share `recommendProductCategory` from `lib/master-data/product-classification.ts`; duplicated rule engines were consolidated, including Apple/iPhone matching and active-category filtering.
- No duplicate Brand generator or second CRUD implementation was introduced.

## Next concrete Master Data work

- Trace all writes/reads and PostgREST relationship embeds for `brand_id`, `model_id`, `category_id`, `product_subcategory_id`, `product_id`, and variant attribute relations.
- Product create/edit already exposes `model_id`, filters models by selected Brand, validates that the model belongs to the selected Brand, and persists the relation. Do not rebuild this feature. Remaining issue is duplicated brand state on Product and Product Model; decide whether Product.brand_id is a deliberate denormalized snapshot or should be derived.
- Decide canonical ownership and derive fields where safe.
- Produce a migration proposal with constraints, rollback, and application compatibility checks before changing schema.

## Specification workflow implementation update

The existing product_attributes, product_attribute_values, product_attribute_assignments, and product_variant_attribute_values structures are reused. RAM and ROM were added as attribute dictionary entries; COLOR and WARRANTY were already present. The Product Variant create/edit/detail workflow now presents these four specifications together and persists them through one SECURITY INVOKER RPC transaction. A new RLS DELETE policy allows master.update users to remove only the variant-value mapping.

This does not yet satisfy the full single-submit Product + Variant requirement. The product create/edit actions still operate on the Product record; variant creation remains a nested operation. Do not claim full workflow consolidation until variant SKU ownership and transaction consumers are traced and the create flow is implemented without partial product/variant state.
