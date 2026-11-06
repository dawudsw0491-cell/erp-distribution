
-- =====================================================
-- FILE 36: MASTER DATA PRIVILEGES
-- PROJECT: ERP Distribution
-- PURPOSE: Membatasi privilege SQL tabel master data
-- =====================================================

BEGIN;

-- =====================================================
-- 1. REVOKE ALL PRIVILEGES FROM ANON
-- =====================================================

REVOKE ALL PRIVILEGES ON TABLE
    public.product_categories,
    public.brands,
    public.products,
    public.warehouses,
    public.suppliers,
    public.customers
FROM anon;


-- =====================================================
-- 2. REVOKE ALL PRIVILEGES FROM AUTHENTICATED
-- =====================================================

REVOKE ALL PRIVILEGES ON TABLE
    public.product_categories,
    public.brands,
    public.products,
    public.warehouses,
    public.suppliers,
    public.customers
FROM authenticated;


-- =====================================================
-- 3. GRANT REQUIRED CRUD TO AUTHENTICATED
-- =====================================================

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE
    public.product_categories,
    public.brands,
    public.products,
    public.warehouses,
    public.suppliers,
    public.customers
TO authenticated;

COMMIT;
