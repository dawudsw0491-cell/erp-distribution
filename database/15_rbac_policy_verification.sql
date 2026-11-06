-- =====================================================
-- FILE 15: RBAC POLICY VERIFICATION
-- PROJECT: ERP Distribution
-- PURPOSE: Memeriksa RLS Policy pada tabel RBAC
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
  AND tablename IN (
      'roles',
      'permissions',
      'role_permissions',
      'user_roles',
      'user_profiles'
  )
ORDER BY
    tablename,
    policyname;