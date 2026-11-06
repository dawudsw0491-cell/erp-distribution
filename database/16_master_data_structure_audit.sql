-- =====================================================
-- FILE 16: MASTER DATA STRUCTURE AUDIT
-- PROJECT: ERP Distribution
-- PURPOSE: Memeriksa struktur aktual tabel master data
-- TYPE: READ ONLY - AMAN DIJALANKAN BERULANG
-- =====================================================

SELECT
    table_name,
    ordinal_position,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
      'product_categories',
      'brands',
      'products',
      'warehouses',
      'suppliers',
      'customers'
  )
ORDER BY
    table_name,
    ordinal_position;