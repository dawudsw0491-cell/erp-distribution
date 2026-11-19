# Repository Audit — Baseline

**Date:** 2026-11-19  
**Repository:** `dawudsw0491-cell/erp-distribution`  
**Branch:** `master`  
**Commit:** `8eadef2a0cb7e03fa2eb3fdb194dee4987af2bfa`  
**Git tree entries:** 258

## 1. Repository access and integrity

- Repository is public and readable through GitHub.
- Default branch is `master`.
- HEAD at audit time: `8eadef2`.
- Branch is not protected.
- Repository connection reports push permission; implementation work is isolated on `work/master-data-baseline-20261119`.
- Commit `8eadef2` is unsigned (`verified: false)); this is a signature-verification fact, not proof of malicious content.
- Vercel commit status check: success.
- No GitHub Actions workflow directory was present in the inspected tree.

## 2. Technology and dependencies

- Next.js 16.4.3, App Router.
- React / React DOM 19.3.0.
- TypeScript 5.
- Tailwind CSS 4.
- Supabase SSR 0.12.7 and Supabase JS 2.118.0.
- PostgreSQL SQL scripts and Supabase RPC functions.
- html5-qrcode 2.3.8.
- lucide-react 1.72.0.
- ESLint 9.

Scripts in package.json: dev, build, start, lint. No test script is defined.

## 3. Top-level architecture

- `app/`: route pages, server actions, and forms.
- `components/layout/`: shared shell and navigation.
- `components/scanner/`: universal barcode/IMEI/serial scanner.
- `lib/auth/`: authorization context.
- `lib/supabase/`: browser, server, and admin clients.
- `database/`: numbered SQL scripts, seed scripts, and regional CSV data.
- `types/`: application type definitions.
- `public/`: static assets.

## 4. Application modules observed

- Dashboard.
- Master Data: products, categories, customers, suppliers, warehouses, product models, product attributes, product attribute values.
- Product variants: nested under product detail.
- Purchasing: purchase orders and goods receipts.
- Inventory: dashboard, balances, movements, transfers, stock opname, serialized units.
- Authentication: login and change password.
- User administration.
- Test connection page.

The sidebar also contains Sales, Returns, Accounting & Reports, and Settings links, but matching route directories were not present in the inspected `app/` tree. Treat these as unverified/placeholding navigation, not implemented modules.

## 5. Database source inventory

The repository contains SQL files numbered 01, 02, 03–12, and 14–49, plus seed scripts. File 13 was not present in the inspected tree.

Database scripts cover connection checks, master data, RBAC, RLS, product tracking, product attributes, inventory movements, inventory valuation, transfers, stock opname, and security hardening.

## 6. Findings register

| ID | Priority | Finding | Evidence | Status |
|---|---|---|---|---|
| MD-001 | P1 | Master Data Hub lists five areas while sidebar exposes eight Master Data routes | `app/master-data/page.tsx`, `components/layout/erp-sidebar.tsx` | Fixed on work branch |
| MD-002 | P1 | Brand creation logic exists in Product and Product Model actions | `app/products/actions.ts`, `app/product-models/actions.ts` | Open |
| MD-003 | P1 | Attribute-value access uses both `product_attribute_values` and `product_variant_attribute_values` patterns | `app/product-attribute-values/actions.ts`, `app/product-models/actions.ts`, `database/23_create_product_attribute_values.sql` | Open; requires schema verification |
| MD-004 | P1 | DDL for `product_models`, `product_attribute_assignments`, and `product_variant_attribute_values` was not located in the committed numbered SQL scripts | `database/` tree and application references | Open; may exist in external DB history |
| MD-005 | P2 | Brand has no dedicated route/page; creation is embedded in other workflows | No `app/brands/`; Brand actions in Product and Product Model | Open |
| DOC-001 | P2 | README is default Next.js starter documentation | `README.md` | Open |
| NAV-001 | P2 | Sidebar links to Sales, Returns, Accounting, and Settings without matching route directories in inspected tree | `components/layout/erp-sidebar.tsx`, `app/` tree | Open |
| QA-001 | P1 | No automated test command or test suite was identified from package manifest/tree | `package.json`, repository tree | Open |

## 7. Security and quality observations

- Authentication is handled through Supabase Auth and a Next.js proxy.
- Authorization is centralized through `getAuthorizationContext` in `lib/auth/authorization.ts`.
- Database scripts define RBAC and RLS policy work.
- Several sensitive inventory operations are delegated to PostgreSQL RPC functions.
- Static source inspection does not prove runtime authorization, RLS, transaction isolation, or production configuration.
- The commit's Vercel check is successful, but it does not substitute for a full test report.

## 8. Verification limitations

Not executed in this audit:
- `npm ci`
- `npm run build`
- `npm run lint`
- Unit, integration, or end-to-end tests
- Live Supabase schema introspection
- RLS tests under different user roles
- Production transaction tests

No claim of production readiness is made.
