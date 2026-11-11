
-- ============================================================
-- HEXACORE ERP
-- MIGRATION 39: SECURITY HARDENING - TABLE PRIVILEGES
-- ============================================================
-- Purpose:
--   1. Remove all direct table privileges from anon.
--   2. Remove non-essential table privileges from authenticated.
--   3. Preserve authenticated DML required by the application.
--   4. Apply corresponding default privileges for future tables
--      created by postgres.
--
-- Scope:
--   Schema public only.
--
-- Does NOT:
--   - Change RLS or RLS policies.
--   - Change table structures or data.
--   - Change function privileges.
--   - Change sequence privileges.
--   - Change service_role or postgres privileges.
--
-- IMPORTANT:
--   Execute only after preflight ownership verification.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- STEP 1: Remove all table privileges from anon
-- ------------------------------------------------------------

REVOKE ALL PRIVILEGES
ON ALL TABLES IN SCHEMA public
FROM anon;


-- ------------------------------------------------------------
-- STEP 2: Remove non-essential privileges from authenticated
-- Preserve SELECT, INSERT, UPDATE, DELETE.
-- ------------------------------------------------------------

REVOKE
    MAINTAIN,
    REFERENCES,
    TRIGGER,
    TRUNCATE
ON ALL TABLES IN SCHEMA public
FROM authenticated;


-- ------------------------------------------------------------
-- STEP 3: Protect future tables created by postgres
-- ------------------------------------------------------------

ALTER DEFAULT PRIVILEGES
FOR ROLE postgres
IN SCHEMA public
REVOKE ALL PRIVILEGES ON TABLES FROM anon;

ALTER DEFAULT PRIVILEGES
FOR ROLE postgres
IN SCHEMA public
REVOKE
    MAINTAIN,
    REFERENCES,
    TRIGGER,
    TRUNCATE
ON TABLES FROM authenticated;


COMMIT;

-- ============================================================
-- END MIGRATION 39
-- ============================================================
