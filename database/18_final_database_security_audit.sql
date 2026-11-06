-- =====================================================
-- FILE 18: FINAL DATABASE SECURITY AUDIT
-- PROJECT: ERP Distribution
-- PURPOSE: Pemeriksaan akhir keamanan database
-- TYPE: READ ONLY - AMAN DIJALANKAN BERULANG
-- =====================================================


-- =====================================================
-- 1. STATUS ROW LEVEL SECURITY
-- =====================================================

SELECT
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;


-- =====================================================
-- 2. DAFTAR SELURUH RLS POLICY
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


-- =====================================================
-- 3. STATUS FUNGSI KEAMANAN
-- =====================================================

SELECT
    n.nspname AS schema_name,
    p.proname AS function_name,
    pg_get_function_identity_arguments(p.oid) AS arguments,
    p.prosecdef AS security_definer,
    p.proconfig AS function_settings
FROM pg_proc p
JOIN pg_namespace n
    ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'is_owner',
      'has_permission',
      'handle_new_user'
  )
ORDER BY p.proname;


-- =====================================================
-- 4. STATUS TRIGGER PEMBUATAN PROFIL
-- =====================================================

SELECT
    trigger_name,
    event_object_table,
    action_timing,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'auth'
  AND event_object_table = 'users'
ORDER BY trigger_name;


-- =====================================================
-- 5. STATUS GRANT FUNGSI KEAMANAN
-- =====================================================

SELECT
    routine_schema,
    routine_name,
    grantee,
    privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
      'is_owner',
      'has_permission'
  )
ORDER BY routine_name, grantee, privilege_type;