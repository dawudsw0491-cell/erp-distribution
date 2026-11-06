-- =====================================================
-- FILE 12: RLS POLICY AUDIT
-- PROJECT: ERP Distribution
-- PURPOSE: Memeriksa seluruh policy RLS pada schema public
-- TYPE: READ ONLY - AMAN DIJALANKAN BERULANG
-- =====================================================

SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;