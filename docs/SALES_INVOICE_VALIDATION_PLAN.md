# Sales Invoice & Payment — Validation Plan

Status: SOURCE + DEVELOPMENT MIGRATION APPLIED; authenticated runtime validation pending.
Environment: Development only. Production untouched.

## Schema and access
- Confirm invoice header, invoice item, and payment tables exist with RLS enabled.
- Confirm authenticated has SELECT only; direct INSERT/UPDATE/DELETE remain denied.
- Confirm anon has no table access and no RPC EXECUTE.
- Confirm invoice/payment RPCs require authenticated identity, `sales.create`, and warehouse access.
- Confirm invoice reads require `sales.view` and warehouse scope.

## Invoice lifecycle
- Reject draft/cancelled DO; accept posted DO only.
- Create invoice for all or part of a posted DO.
- Verify immutable Product/Variant/SKU snapshots and source DO/SO references.
- Reject quantities above remaining unbilled DO quantity, duplicate payload lines above remaining aggregate, invalid UUIDs, fractional IMEI/Serial quantity, empty payload, and >100 lines.
- Verify multiple partial invoices cannot exceed source DO quantities, including concurrent requests.
- Verify void invoices release their billed quantity only after a controlled void/reversal workflow exists. No void RPC is currently exposed.

## Payment lifecycle
- Record partial and full payments.
- Reject zero/negative amounts, unsupported methods, overpayment, invalid date, and void invoice.
- Verify invoice paid amount/status are updated atomically with payment insert.
- Verify concurrent payment requests cannot overpay an invoice.
- Verify payment rows cannot be updated/deleted directly.

## UI / document
- Invoice register, posted DO selection, partial invoice quantity entry, invoice detail, payment history, and payment capture.
- Print layout is A4 landscape and can use Epson dot-matrix continuous / 3-ply stock; actual printer alignment and paper dimensions require physical print testing.
- Company logo is not present in repository public assets; current print header uses the HEXA CORE wordmark, not a fabricated logo.

## Exit criteria
- Vercel Preview build READY for the exact tested commit.
- TypeScript/build success; lint separately recorded.
- Authenticated browser workflow passes invoice creation, partial billing, payment, and print preview.
- Verify Data API exposure for newly created public tables under current Supabase API settings.
- Role/warehouse allow-deny and concurrency tests pass.
- No GL journal is posted by this phase; accounting source-event integration remains separate.
