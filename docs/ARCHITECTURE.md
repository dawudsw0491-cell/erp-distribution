# Architecture — ERP Distribution

## Application architecture

- Next.js 16 App Router provides page routing and server-rendered screens.
- React 19 provides interactive forms and client components.
- TypeScript provides application types.
- Tailwind CSS 4 provides styling.
- Server Actions encapsulate authenticated business mutations.
- Supabase SSR and Supabase JS connect browser/server contexts to Supabase.
- PostgreSQL functions (RPC) encapsulate selected transactional inventory operations.

## Code boundaries

- `app/**/page.tsx`: route/page composition.
- `app/**/actions.ts`: server-side operations and validation.
- `components/layout`: shared navigation and layout.
- `components/scanner`: barcode/IMEI/serial scanning.
- `lib/auth/authorization.ts`: authorization context.
- `lib/supabase/client.ts`, `server.ts`, `admin.ts`: Supabase client boundaries.
- `database/*.sql`: schema, constraints, functions, policies, and seed data.

## Data integration

Supabase/PostgreSQL is the persistence layer. Inventory and purchasing pages call server actions, which use Supabase queries and RPC functions. Inventory posting, transfer, reversal, valuation, and stock opname must remain governed by the existing database transaction functions.

## Security boundaries

- Authentication: Supabase Auth.
- Request gate: `proxy.ts`.
- Application authorization: `getAuthorizationContext`.
- Database authorization: RBAC helpers and RLS policies in SQL scripts.
- Admin Supabase client: server-only module in `lib/supabase/admin.ts`.

Never expose the Supabase secret key to client components. Any use of the admin client must remain server-only and receive explicit authorization checks.

## Architectural constraints

- Do not create a second database or a parallel master table for existing entities.
- Do not replace Product Variant references used by Inventory.
- Do not bypass RPC posting controls with direct balance updates.
- Keep authentication, RBAC, RLS, and approval flows intact.
- Validate live schema before changing any database relation.
