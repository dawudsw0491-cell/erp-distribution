# Known Issues

| ID | Priority | Description | Evidence | Impact | Status |
|---|---|---|---|---|---|
| MD-002 | P1 | Brand creation originally had duplicated implementations in Product and Product Model actions | `app/products/actions.ts`, `app/product-models/actions.ts`, `lib/master-data/brands.ts` | Duplicate validation paths could drift | Fixed on work branch; both wrappers now delegate to one shared server-only action |
| MD-003 | P1 | Attribute value access has both canonical and legacy relation names | `app/product-attribute-values/actions.ts`, `app/product-models/actions.ts`, `database/23_create_product_attribute_values.sql` | Risk of inconsistent reads/deletion behavior | Open |
| MD-004 | P1 | DDL for Product Model and two attribute relation tables was not found in tracked SQL | `database/` | Database cannot be reconstructed from committed SQL alone | Open |
| MD-005 | P2 | No dedicated Brand route exists | No `app/brands/` directory | Brand management is embedded in other workflows | Open |
| NAV-001 | P2 | Sidebar includes routes not present in the inspected app route tree | `components/layout/erp-sidebar.tsx` | Navigation may lead to 404 | Open |
| QA-001 | P1 | No automated test script/test suite identified | `package.json` and tree | Regressions are not reproducibly evidenced | Open |
| DOC-001 | P2 | README remains starter template | `README.md` | Setup and operation are undocumented | Open |

## Important caution

The absence of a DDL file in this repository does not prove the corresponding table is absent from the live Supabase database. Verify the live schema and migration history before any database change.
