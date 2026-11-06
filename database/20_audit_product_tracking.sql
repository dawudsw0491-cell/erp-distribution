-- =====================================================
-- FILE 20: AUDIT PRODUCT TRACKING
-- PROJECT: ERP Distribution
-- PURPOSE: Memeriksa konfigurasi tracking produk
-- TYPE: READ-ONLY AUDIT
-- =====================================================

-- 1. Periksa nilai tracking_type yang sudah digunakan
SELECT
    tracking_type,
    COUNT(*) AS total_products
FROM public.products
GROUP BY tracking_type
ORDER BY tracking_type;


-- 2. Periksa constraint pada kolom tracking_type
SELECT
    tc.constraint_name,
    tc.constraint_type,
    cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc
    ON cc.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'products'
  AND tc.constraint_type = 'CHECK';


-- 3. Periksa default dan tipe data kolom tracking_type
SELECT
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'products'
  AND column_name = 'tracking_type';


-- =====================================================
-- END OF FILE 20
-- =====================================================