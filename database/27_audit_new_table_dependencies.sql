-- =====================================================
-- FILE 27: AUDIT NEW TABLE DEPENDENCIES
-- PROJECT: ERP Distribution
-- PURPOSE: Audit relasi tabel sebelum migrasi
-- TYPE: READ-ONLY AUDIT
-- =====================================================

-- 1. Periksa keberadaan tabel induk
SELECT
    table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
      'products',
      'product_categories',
      'warehouses',
      'product_variants',
      'product_attributes',
      'product_attribute_values',
      'product_units',
      'product_unit_identifiers',
      'inventory_movements'
  )
ORDER BY table_name;


-- 2. Periksa foreign key yang sudah ada
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS referenced_table,
    ccu.column_name AS referenced_column,
    tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.constraint_schema = kcu.constraint_schema
JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
   AND ccu.constraint_schema = tc.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN (
      'products',
      'product_categories',
      'warehouses',
      'product_variants',
      'product_attributes',
      'product_attribute_values',
      'product_units',
      'product_unit_identifiers',
      'inventory_movements'
  )
ORDER BY tc.table_name, kcu.column_name;


-- 3. Periksa tracking_type yang diizinkan
SELECT
    constraint_name,
    check_clause
FROM information_schema.check_constraints
WHERE constraint_schema = 'public'
  AND constraint_name = 'products_tracking_type_check';


-- =====================================================
-- END OF FILE 27
-- =====================================================