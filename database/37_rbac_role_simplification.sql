
-- ============================================================
-- PROJECT : ERP Distribution & Mobile Phone Trading
-- FILE    : 37_rbac_role_simplification.sql
-- PURPOSE : Simplifikasi role dan penguatan otorisasi Owner
-- VERSION : 3.0
--
-- ROLE AKTIF:
--   owner, manager, purchasing, finance
--
-- ROLE NONAKTIF:
--   auditor, sales, warehouse
--
-- PERMISSION MAPPING:
--   Tidak mengubah role_permissions.
--
-- SAFETY:
--   Transactional
--   Table locking
--   Validasi prasyarat dan hasil
--   Guard untuk assignment role nonaktif
--   Validasi konfigurasi fungsi dan RLS
-- ============================================================

BEGIN;

-- 1. LOCK TABEL

LOCK TABLE
    public.roles,
    public.user_roles,
    public.user_profiles,
    public.role_permissions
IN SHARE ROW EXCLUSIVE MODE;


-- 2. VALIDASI PRASYARAT

DO $$
DECLARE
    v_role_count integer;
    v_distinct_role_count integer;
    v_owner_count integer;
    v_deprecated_assignment_count integer;
    v_manager_count integer;
    v_purchasing_count integer;
    v_finance_count integer;
BEGIN
    SELECT
        COUNT(*),
        COUNT(DISTINCT role_code)
    INTO
        v_role_count,
        v_distinct_role_count
    FROM public.roles
    WHERE role_code IN (
        'owner',
        'manager',
        'purchasing',
        'finance',
        'auditor',
        'sales',
        'warehouse'
    );

    IF v_role_count <> 7 OR v_distinct_role_count <> 7 THEN
        RAISE EXCEPTION
            'Migration dibatalkan: tujuh role wajib harus tersedia dengan role_code unik. Total %, unik %.',
            v_role_count,
            v_distinct_role_count;
    END IF;

    SELECT COUNT(*)
    INTO v_owner_count
    FROM public.user_roles ur
    JOIN public.user_profiles up ON up.id = ur.user_id
    JOIN public.roles r ON r.id = ur.role_id
    WHERE r.role_code = 'owner'
      AND r.is_active = TRUE
      AND up.is_active = TRUE;

    IF v_owner_count <> 1 THEN
        RAISE EXCEPTION
            'Migration dibatalkan: harus ada tepat satu assignment Owner aktif. Ditemukan %.',
            v_owner_count;
    END IF;

    SELECT COUNT(*)
    INTO v_deprecated_assignment_count
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE r.role_code IN ('auditor', 'sales', 'warehouse');

    IF v_deprecated_assignment_count > 0 THEN
        RAISE EXCEPTION
            'Migration dibatalkan: masih ada % assignment ke role auditor/sales/warehouse. Audit dan relokasi assignment terlebih dahulu.',
            v_deprecated_assignment_count;
    END IF;

    SELECT COUNT(*) INTO v_manager_count
    FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
    WHERE r.role_code = 'manager';

    SELECT COUNT(*) INTO v_purchasing_count
    FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
    WHERE r.role_code = 'purchasing';

    SELECT COUNT(*) INTO v_finance_count
    FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
    WHERE r.role_code = 'finance';

    IF v_manager_count <> 20
       OR v_purchasing_count <> 11
       OR v_finance_count <> 10 THEN
        RAISE EXCEPTION
            'Migration dibatalkan: mapping permission tidak sesuai hasil audit. Manager %, Purchasing %, Finance %.',
            v_manager_count,
            v_purchasing_count,
            v_finance_count;
    END IF;
END;
$$;


-- 3. PERKUAT FUNGSI is_owner()

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
    SELECT
        COALESCE(
            (
                SELECT up.is_active
                FROM public.user_profiles up
                WHERE up.id = (SELECT auth.uid())
            ),
            FALSE
        )
        AND EXISTS (
            SELECT 1
            FROM public.user_roles ur
            JOIN public.roles r ON r.id = ur.role_id
            WHERE ur.user_id = (SELECT auth.uid())
              AND r.role_code = 'owner'
              AND r.is_active = TRUE
        );
$function$;

REVOKE ALL
ON FUNCTION public.is_owner()
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.is_owner()
TO authenticated, postgres, service_role;


-- 4. NONAKTIFKAN ROLE

UPDATE public.roles
SET is_active = FALSE
WHERE role_code IN ('auditor', 'sales', 'warehouse')
  AND is_active IS DISTINCT FROM FALSE;


-- 5. PRODUCT_SUPPLIERS

DROP POLICY IF EXISTS product_suppliers_select ON public.product_suppliers;
CREATE POLICY product_suppliers_select
ON public.product_suppliers
FOR SELECT TO authenticated
USING (
    public.has_permission('suppliers.view')
    OR public.is_owner()
);

DROP POLICY IF EXISTS product_suppliers_insert ON public.product_suppliers;
CREATE POLICY product_suppliers_insert
ON public.product_suppliers
FOR INSERT TO authenticated
WITH CHECK (
    public.has_permission('suppliers.create')
    OR public.is_owner()
);

DROP POLICY IF EXISTS product_suppliers_update ON public.product_suppliers;
CREATE POLICY product_suppliers_update
ON public.product_suppliers
FOR UPDATE TO authenticated
USING (
    public.has_permission('suppliers.update')
    OR public.is_owner()
)
WITH CHECK (
    public.has_permission('suppliers.update')
    OR public.is_owner()
);

DROP POLICY IF EXISTS product_suppliers_delete ON public.product_suppliers;
CREATE POLICY product_suppliers_delete
ON public.product_suppliers
FOR DELETE TO authenticated
USING (
    public.has_permission('suppliers.update')
    OR public.is_owner()
);


-- 6. SUPPLIER_ADDRESSES

DROP POLICY IF EXISTS supplier_addresses_select ON public.supplier_addresses;
CREATE POLICY supplier_addresses_select
ON public.supplier_addresses
FOR SELECT TO authenticated
USING (
    public.has_permission('suppliers.view')
    OR public.is_owner()
);

DROP POLICY IF EXISTS supplier_addresses_insert ON public.supplier_addresses;
CREATE POLICY supplier_addresses_insert
ON public.supplier_addresses
FOR INSERT TO authenticated
WITH CHECK (
    public.has_permission('suppliers.create')
    OR public.is_owner()
);

DROP POLICY IF EXISTS supplier_addresses_update ON public.supplier_addresses;
CREATE POLICY supplier_addresses_update
ON public.supplier_addresses
FOR UPDATE TO authenticated
USING (
    public.has_permission('suppliers.update')
    OR public.is_owner()
)
WITH CHECK (
    public.has_permission('suppliers.update')
    OR public.is_owner()
);

DROP POLICY IF EXISTS supplier_addresses_delete ON public.supplier_addresses;
CREATE POLICY supplier_addresses_delete
ON public.supplier_addresses
FOR DELETE TO authenticated
USING (
    public.has_permission('suppliers.update')
    OR public.is_owner()
);


-- 7. SUPPLIER_BANK_ACCOUNTS

DROP POLICY IF EXISTS supplier_bank_accounts_select ON public.supplier_bank_accounts;
CREATE POLICY supplier_bank_accounts_select
ON public.supplier_bank_accounts
FOR SELECT TO authenticated
USING (
    public.has_permission('suppliers.manage_bank')
    OR public.is_owner()
);

DROP POLICY IF EXISTS supplier_bank_accounts_insert ON public.supplier_bank_accounts;
CREATE POLICY supplier_bank_accounts_insert
ON public.supplier_bank_accounts
FOR INSERT TO authenticated
WITH CHECK (
    public.has_permission('suppliers.manage_bank')
    OR public.is_owner()
);

DROP POLICY IF EXISTS supplier_bank_accounts_update ON public.supplier_bank_accounts;
CREATE POLICY supplier_bank_accounts_update
ON public.supplier_bank_accounts
FOR UPDATE TO authenticated
USING (
    public.has_permission('suppliers.manage_bank')
    OR public.is_owner()
)
WITH CHECK (
    public.has_permission('suppliers.manage_bank')
    OR public.is_owner()
);

DROP POLICY IF EXISTS supplier_bank_accounts_delete ON public.supplier_bank_accounts;
CREATE POLICY supplier_bank_accounts_delete
ON public.supplier_bank_accounts
FOR DELETE TO authenticated
USING (
    public.has_permission('suppliers.manage_bank')
    OR public.is_owner()
);


-- 8. SUPPLIER_CONTACTS

DROP POLICY IF EXISTS supplier_contacts_select ON public.supplier_contacts;
CREATE POLICY supplier_contacts_select
ON public.supplier_contacts
FOR SELECT TO authenticated
USING (
    public.has_permission('suppliers.view')
    OR public.is_owner()
);

DROP POLICY IF EXISTS supplier_contacts_insert ON public.supplier_contacts;
CREATE POLICY supplier_contacts_insert
ON public.supplier_contacts
FOR INSERT TO authenticated
WITH CHECK (
    public.has_permission('suppliers.create')
    OR public.is_owner()
);

DROP POLICY IF EXISTS supplier_contacts_update ON public.supplier_contacts;
CREATE POLICY supplier_contacts_update
ON public.supplier_contacts
FOR UPDATE TO authenticated
USING (
    public.has_permission('suppliers.update')
    OR public.is_owner()
)
WITH CHECK (
    public.has_permission('suppliers.update')
    OR public.is_owner()
);

DROP POLICY IF EXISTS supplier_contacts_delete ON public.supplier_contacts;
CREATE POLICY supplier_contacts_delete
ON public.supplier_contacts
FOR DELETE TO authenticated
USING (
    public.has_permission('suppliers.update')
    OR public.is_owner()
);


-- 9. SUPPLIERS

DROP POLICY IF EXISTS suppliers_select ON public.suppliers;
CREATE POLICY suppliers_select
ON public.suppliers
FOR SELECT TO authenticated
USING (
    public.has_permission('suppliers.view')
    OR public.is_owner()
);

DROP POLICY IF EXISTS suppliers_insert ON public.suppliers;
CREATE POLICY suppliers_insert
ON public.suppliers
FOR INSERT TO authenticated
WITH CHECK (
    public.has_permission('suppliers.create')
    OR public.is_owner()
);

DROP POLICY IF EXISTS suppliers_update ON public.suppliers;
CREATE POLICY suppliers_update
ON public.suppliers
FOR UPDATE TO authenticated
USING (
    public.has_permission('suppliers.update')
    OR public.is_owner()
)
WITH CHECK (
    public.has_permission('suppliers.update')
    OR public.is_owner()
);

DROP POLICY IF EXISTS suppliers_delete ON public.suppliers;
CREATE POLICY suppliers_delete
ON public.suppliers
FOR DELETE TO authenticated
USING (
    public.has_permission('suppliers.delete')
    OR public.is_owner()
);


-- 10. VALIDASI HASIL

DO $$
DECLARE
    v_active_count integer;
    v_inactive_count integer;
    v_owner_active boolean;
    v_policy_count integer;
    v_policy_owner_count integer;
    v_owner_function_valid boolean;
    v_manager_count integer;
    v_purchasing_count integer;
    v_finance_count integer;
BEGIN
    SELECT COUNT(*)
    INTO v_active_count
    FROM public.roles
    WHERE role_code IN ('owner', 'manager', 'purchasing', 'finance')
      AND is_active = TRUE;

    SELECT COUNT(*)
    INTO v_inactive_count
    FROM public.roles
    WHERE role_code IN ('auditor', 'sales', 'warehouse')
      AND is_active = FALSE;

    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.user_profiles up ON up.id = ur.user_id
        JOIN public.roles r ON r.id = ur.role_id
        WHERE r.role_code = 'owner'
          AND r.is_active = TRUE
          AND up.is_active = TRUE
    )
    INTO v_owner_active;

    SELECT COUNT(*)
    INTO v_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
          'product_suppliers',
          'supplier_addresses',
          'supplier_bank_accounts',
          'supplier_contacts',
          'suppliers'
      )
      AND policyname IN (
          'product_suppliers_select',
          'product_suppliers_insert',
          'product_suppliers_update',
          'product_suppliers_delete',
          'supplier_addresses_select',
          'supplier_addresses_insert',
          'supplier_addresses_update',
          'supplier_addresses_delete',
          'supplier_bank_accounts_select',
          'supplier_bank_accounts_insert',
          'supplier_bank_accounts_update',
          'supplier_bank_accounts_delete',
          'supplier_contacts_select',
          'supplier_contacts_insert',
          'supplier_contacts_update',
          'supplier_contacts_delete',
          'suppliers_select',
          'suppliers_insert',
          'suppliers_update',
          'suppliers_delete'
      );

    SELECT COUNT(*)
    INTO v_policy_owner_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
          'product_suppliers',
          'supplier_addresses',
          'supplier_bank_accounts',
          'supplier_contacts',
          'suppliers'
      )
      AND policyname IN (
          'product_suppliers_select',
          'product_suppliers_insert',
          'product_suppliers_update',
          'product_suppliers_delete',
          'supplier_addresses_select',
          'supplier_addresses_insert',
          'supplier_addresses_update',
          'supplier_addresses_delete',
          'supplier_bank_accounts_select',
          'supplier_bank_accounts_insert',
          'supplier_bank_accounts_update',
          'supplier_bank_accounts_delete',
          'supplier_contacts_select',
          'supplier_contacts_insert',
          'supplier_contacts_update',
          'supplier_contacts_delete',
          'suppliers_select',
          'suppliers_insert',
          'suppliers_update',
          'suppliers_delete'
      )
      AND (
          COALESCE(qual, '') || ' ' || COALESCE(with_check, '')
      ) ILIKE '%is_owner%';

    SELECT
        p.prosecdef
        AND p.proowner = 'postgres'::regrole
        AND p.proconfig @> ARRAY['search_path=""']
        AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
        AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
    INTO v_owner_function_valid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'is_owner'
      AND pg_get_function_identity_arguments(p.oid) = '';

    SELECT COUNT(*) INTO v_manager_count
    FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
    WHERE r.role_code = 'manager';

    SELECT COUNT(*) INTO v_purchasing_count
    FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
    WHERE r.role_code = 'purchasing';

    SELECT COUNT(*) INTO v_finance_count
    FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
    WHERE r.role_code = 'finance';

    IF v_active_count <> 4 OR v_inactive_count <> 3 THEN
        RAISE EXCEPTION
            'Validasi role gagal. Aktif %, nonaktif %.',
            v_active_count,
            v_inactive_count;
    END IF;

    IF NOT v_owner_active THEN
        RAISE EXCEPTION
            'Validasi gagal: Owner aktif tidak ditemukan.';
    END IF;

    IF v_policy_count <> 20 OR v_policy_owner_count <> 20 THEN
        RAISE EXCEPTION
            'Validasi RLS gagal. Total policy %, policy dengan is_owner() %.',
            v_policy_count,
            v_policy_owner_count;
    END IF;

    IF NOT COALESCE(v_owner_function_valid, FALSE) THEN
        RAISE EXCEPTION
            'Validasi gagal: konfigurasi keamanan fungsi is_owner() tidak sesuai.';
    END IF;

    IF v_manager_count <> 20
       OR v_purchasing_count <> 11
       OR v_finance_count <> 10 THEN
        RAISE EXCEPTION
            'Validasi mapping permission gagal. Manager %, Purchasing %, Finance %.',
            v_manager_count,
            v_purchasing_count,
            v_finance_count;
    END IF;
END;
$$;

COMMIT;

-- ============================================================
-- END OF MIGRATION
-- ============================================================
