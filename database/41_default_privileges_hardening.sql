BEGIN;

-- =====================================================
-- MIGRATION 41
-- DEFAULT PRIVILEGES HARDENING
-- Scope: public schema, objects created by postgres
-- =====================================================

-- 1. SEQUENCES
-- Remove default access from PUBLIC, anon, authenticated.
ALTER DEFAULT PRIVILEGES
FOR ROLE postgres
IN SCHEMA public
REVOKE ALL ON SEQUENCES
FROM PUBLIC, anon, authenticated;

-- Authenticated requires USAGE for generated identifiers.
ALTER DEFAULT PRIVILEGES
FOR ROLE postgres
IN SCHEMA public
GRANT USAGE ON SEQUENCES
TO authenticated;


-- 2. FUNCTIONS
-- Remove automatic EXECUTE from client-facing roles.
ALTER DEFAULT PRIVILEGES
FOR ROLE postgres
IN SCHEMA public
REVOKE EXECUTE ON FUNCTIONS
FROM PUBLIC, anon, authenticated;


-- 3. VERIFY SEQUENCE DEFAULT ACL
DO $$
DECLARE
    v_acl aclitem[];
BEGIN
    SELECT d.defaclacl
    INTO v_acl
    FROM pg_catalog.pg_default_acl d
    WHERE d.defaclrole = 'postgres'::regrole
      AND d.defaclnamespace = 'public'::regnamespace
      AND d.defaclobjtype = 'S';

    IF v_acl IS NULL THEN
        RAISE EXCEPTION 'Sequence default ACL not found';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM aclexplode(v_acl) a
        WHERE a.grantee IN (
            0,
            'anon'::regrole::oid
        )
    ) THEN
        RAISE EXCEPTION
            'Unexpected PUBLIC or anon sequence privileges';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM aclexplode(v_acl) a
        WHERE a.grantee = 'authenticated'::regrole::oid
          AND a.privilege_type <> 'USAGE'
    ) THEN
        RAISE EXCEPTION
            'Authenticated has excessive sequence privileges';
    END IF;
END;
$$;


-- 4. VERIFY FUNCTION DEFAULT ACL
DO $$
DECLARE
    v_acl aclitem[];
BEGIN
    SELECT d.defaclacl
    INTO v_acl
    FROM pg_catalog.pg_default_acl d
    WHERE d.defaclrole = 'postgres'::regrole
      AND d.defaclnamespace = 'public'::regnamespace
      AND d.defaclobjtype = 'f';

    IF v_acl IS NULL THEN
        RAISE EXCEPTION 'Function default ACL not found';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM aclexplode(v_acl) a
        WHERE a.grantee IN (
            0,
            'anon'::regrole::oid,
            'authenticated'::regrole::oid
        )
          AND a.privilege_type = 'EXECUTE'
    ) THEN
        RAISE EXCEPTION
            'Unexpected client function EXECUTE privilege';
    END IF;
END;
$$;

COMMIT;