# Backlog — ERP Distribution

Priority definitions: P0 Critical, P1 High, P2 Medium, P3 Low.

| ID | Priority | Work item | Dependency | Status |
|---|---|---|---|---|
| MD-001 | P1 | Expose all existing Master Data routes from the Master Data Hub | Existing route pages | Done on work branch |
| MD-002 | P1 | Consolidate Brand creation into one canonical action/path | Brand schema, current Product and Product Model actions | Open |
| MD-003 | P1 | Confirm canonical product attribute assignment/value grain | Live DB schema and representative data | Blocked on schema evidence |
| MD-004 | P1 | Add or recover source-controlled DDL for Product Model and legacy attribute relation tables | Supabase schema history | Open |
| QA-001 | P1 | Establish build, lint, and automated test evidence | Installable environment | Open |
| DOC-001 | P2 | Replace starter README with project setup and operating guide | Environment variable inventory | Open |
| NAV-001 | P2 | Resolve sidebar links whose route directories are absent | Product scope decision | Open |
| MD-005 | P2 | Provide a dedicated canonical Brand management screen | MD-002 decision | Open |
| MD-006 | P2 | Document Product/Variant/Model ownership and lifecycle | MD-003 decision | Open |
| SEC-001 | P2 | Run role-based RLS and authorization tests | Test users and non-production Supabase | Open |
| INT-001 | P2 | Verify Purchasing → Goods Receipt → Inventory end-to-end | Non-production database | Open |

## Completion rule

A backlog item is Done only when the code/documentation change exists, relevant tests are run, results are recorded, and dependent routes/processes are checked. Source inspection alone is not test completion.
