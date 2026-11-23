# Final Integrated Validation Plan — HEXA CORE ERP Distribution

Status: DEFERRED UNTIL ALL PLANNED MODULES ARE IMPLEMENTED
Environment: isolated Development baseline first; connected Development only after replay and approval; Production excluded until explicit release authorization.

## Execution policy

The user has directed that broad functional testing be performed once all planned modules are implementation-ready, so the test effort can cover complete end-to-end business flows rather than isolated module fragments.

During implementation:
- Do not run ad-hoc module test suites, browser E2E, synthetic transaction cycles, or repeated build/lint checks after every feature.
- Do not create or retain test business records in connected Development.
- Do not describe an untested module as verified, complete, or production-ready.
- Continue source implementation, migration authoring, schema/permission contract inspection, and documentation.
- Keep each feature's acceptance criteria and known risks documented in its existing backlog item.
- A required clean migration replay and integrated test environment are prerequisites for the final test phase, not permission to mutate Production.
- Static inspection or read-only schema inspection may be used to avoid authoring incompatible code; label it as inspection, not testing.

## Final validation sequence

1. Freeze feature scope and implementation branch; record exact commit and all pending migrations.
2. Reconcile Git migration files with the Development migration ledger. Build a clean disposable database baseline from source-controlled migrations. Do not infer a clean baseline from the existing Development project.
3. Apply the complete migration chain to the isolated baseline in order. Verify schema, indexes, foreign keys, constraints, RLS, grants, function owners, SECURITY DEFINER search_path and PUBLIC/anon/authenticated execute rights.
4. Run one integrated business-flow suite:
   - Master Data Product → Variant → SKU → optional IMEI/Serial identity.
   - Purchasing PO → approval → Goods Receipt → inventory valuation.
   - Inventory transfer, stock adjustment and Stock Opname.
   - Sales Order → partial Delivery Order → inventory posting → partial Invoice → partial/full payment.
   - Customer Return → quarantine → inspection/status change → approved inventory posting.
   - Supplier Return → approved inventory posting and source-cost traceability.
   - Accounting journals → GL → AR/AP → payment/credit/refund/reversal.
   - Operational/financial reports and Dashboard reconciliation.
5. Run negative, role/warehouse isolation, over-quantity, duplicate, concurrency, rollback, idempotency, period-close, rounding/tax, and audit-trail scenarios across module boundaries.
6. Run authenticated browser E2E for every primary route, transaction lifecycle, print workflow, navigation, loading/error state, and responsive layout.
7. Run lint, TypeScript, production build, migration replay, and any CI suite on the exact same commit.
8. Deploy that exact commit to Vercel Preview and confirm READY. Record build logs and browser evidence.
9. Reconcile dashboard and reports against source ledgers and inventory valuation.
10. Prepare release checklist. Production deployment requires a separate explicit user instruction.

## Exit criteria

No module is called DONE solely because its source code or schema exists. Each backlog item must have implementation evidence. Overall ERP validation is complete only when the integrated flow, security boundaries, rollback/concurrency, browser E2E, financial reconciliation, and exact-commit Preview deployment all pass.

No test fixtures are inserted into the connected Development project under this plan.
