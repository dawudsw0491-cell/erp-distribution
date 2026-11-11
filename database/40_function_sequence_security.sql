
-- ============================================================
-- HEXACORE ERP
-- MIGRATION 40
-- FUNCTION AND SEQUENCE SECURITY HARDENING
-- ============================================================
--
-- ACCESS MODEL:
--   Internal application only.
--
-- SCOPE:
--   1. Restrict direct execution of internal trigger functions.
--   2. Restrict direct execution of unused SKU validation function.
--   3. Restrict anonymous access to supplier code generator.
--   4. Harden sequence privileges.
--
-- PRESERVED:
--   - Existing triggers.
--   - Authenticated business functions.
--   - Authenticated USAGE on required sequences.
--   - postgres and service_role privileges.
--   - Existing table data and business logic.
--
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1: INTERNAL TRIGGER FUNCTIONS
-- ============================================================

REVOKE EXECUTE
ON FUNCTION public.guard_supplier_status_change()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE
ON FUNCTION public.set_updated_at()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE
ON FUNCTION public.handle_new_user()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE
ON FUNCTION public.sync_sku_registry()
FROM PUBLIC, anon, authenticated;


-- ============================================================
-- STEP 2: UNUSED SKU VALIDATION FUNCTION
-- No active trigger dependency was found in the audit.
-- Function is retained but direct execution is restricted.
-- ============================================================

REVOKE EXECUTE
ON FUNCTION public.validate_global_sku()
FROM PUBLIC, anon, authenticated;


-- ============================================================
-- STEP 3: SUPPLIER CODE GENERATOR
-- Authenticated must retain EXECUTE.
-- Function uses SECURITY INVOKER.
-- ============================================================

REVOKE EXECUTE
ON FUNCTION public.generate_supplier_code()
FROM PUBLIC, anon;


-- ============================================================
-- STEP 4: CONNECTION TEST SEQUENCE
-- Remove direct SELECT/UPDATE.
-- Retain USAGE for authenticated INSERT operations.
-- ============================================================

REVOKE ALL PRIVILEGES
ON SEQUENCE public.connection_test_id_seq
FROM PUBLIC, anon;

REVOKE SELECT, UPDATE
ON SEQUENCE public.connection_test_id_seq
FROM authenticated;


-- ============================================================
-- STEP 5: SUPPLIER CODE SEQUENCE
-- Remove anonymous access.
-- Authenticated retains USAGE for nextval().
-- ============================================================

REVOKE ALL PRIVILEGES
ON SEQUENCE public.supplier_code_seq
FROM PUBLIC, anon;

REVOKE SELECT, UPDATE
ON SEQUENCE public.supplier_code_seq
FROM authenticated;


COMMIT;

-- ============================================================
-- END MIGRATION 40
-- ============================================================
