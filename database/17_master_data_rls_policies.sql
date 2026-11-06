
-- =====================================================
-- FILE 17: MASTER DATA RLS POLICIES
-- PROJECT: ERP Distribution
-- PURPOSE: Mengatur hak akses tabel master data
-- ACCESS: AUTHENTICATED USERS
-- FRAMEWORK: RBAC
-- =====================================================

-- CATATAN:
-- 1. RLS harus sudah aktif pada seluruh tabel.
-- 2. Owner memperoleh akses melalui is_owner().
-- 3. Pengguna lain mengikuti permission berdasarkan role.
-- 4. Policy dipisahkan berdasarkan operasi CRUD.
-- 5. DELETE dibatasi menggunakan master.delete.
-- 6. Data master yang sudah digunakan transaksi
--    sebaiknya dinonaktifkan, bukan dihapus.


DO $$
DECLARE
    v_table TEXT;
    v_tables TEXT[] := ARRAY[
        'product_categories',
        'brands',
        'products',
        'warehouses',
        'suppliers',
        'customers'
    ];
BEGIN

    FOREACH v_table IN ARRAY v_tables
    LOOP

        -- =============================================
        -- HAPUS POLICY LAMA
        -- =============================================

        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON public.%I',
            'Master data access ' || v_table,
            v_table
        );

        -- =============================================
        -- HAPUS POLICY BARU JIKA SUDAH ADA
        -- =============================================

        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON public.%I',
            'master_select_' || v_table,
            v_table
        );

        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON public.%I',
            'master_insert_' || v_table,
            v_table
        );

        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON public.%I',
            'master_update_' || v_table,
            v_table
        );

        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON public.%I',
            'master_delete_' || v_table,
            v_table
        );

        -- =============================================
        -- SELECT
        -- Permission: master.view
        -- =============================================

        EXECUTE format(
            'CREATE POLICY %I ON public.%I
             FOR SELECT
             TO authenticated
             USING (
                 public.has_permission(''master.view'')
                 OR public.is_owner()
             )',
            'master_select_' || v_table,
            v_table
        );

        -- =============================================
        -- INSERT
        -- Permission: master.create
        -- =============================================

        EXECUTE format(
            'CREATE POLICY %I ON public.%I
             FOR INSERT
             TO authenticated
             WITH CHECK (
                 public.has_permission(''master.create'')
                 OR public.is_owner()
             )',
            'master_insert_' || v_table,
            v_table
        );

        -- =============================================
        -- UPDATE
        -- Permission: master.update
        -- =============================================

        EXECUTE format(
            'CREATE POLICY %I ON public.%I
             FOR UPDATE
             TO authenticated
             USING (
                 public.has_permission(''master.update'')
                 OR public.is_owner()
             )
             WITH CHECK (
                 public.has_permission(''master.update'')
                 OR public.is_owner()
             )',
            'master_update_' || v_table,
            v_table
        );

        -- =============================================
        -- DELETE
        -- Permission: master.delete
        -- =============================================

        EXECUTE format(
            'CREATE POLICY %I ON public.%I
             FOR DELETE
             TO authenticated
             USING (
                 public.has_permission(''master.delete'')
                 OR public.is_owner()
             )',
            'master_delete_' || v_table,
            v_table
        );

    END LOOP;

END $$;
