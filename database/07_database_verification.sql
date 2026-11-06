
-- =====================================================
-- PROJECT : ERP Distribution & Mobile Phone Trading
-- FILE    : 07_database_verification.sql
-- PURPOSE : Pemeriksaan struktur dan data database
-- NOTE    : Query SELECT aman dijalankan berulang kali.
-- =====================================================

-- 1. Periksa jumlah tabel master data
SELECT
    table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
      'product_categories',
      'brands',
      'products',
      'warehouses',
      'suppliers',
      'customers'
  )
ORDER BY table_name;


-- 2. Periksa jumlah role
SELECT
    COUNT(*) AS total_roles
FROM public.roles;


-- 3. Periksa jumlah permission
SELECT
    COUNT(*) AS total_permissions
FROM public.permissions;


-- 4. Periksa jumlah pemetaan role dan permission
SELECT
    COUNT(*) AS total_role_permission_mappings
FROM public.role_permissions;


-- 5. Periksa jumlah permission per role
SELECT
    r.role_code,
    r.role_name,
    COUNT(rp.permission_id) AS total_permissions
FROM public.roles r
LEFT JOIN public.role_permissions rp
    ON rp.role_id = r.id
GROUP BY r.id, r.role_code, r.role_name
ORDER BY r.role_code;


-- 6. Periksa status Row Level Security
SELECT
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;


-- 7. Periksa kebijakan Row Level Security
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;


-- 8. Periksa akun pengguna dan profilnya
SELECT
    u.id,
    u.email,
    up.full_name,
    up.is_active,
    up.created_at
FROM auth.users u
LEFT JOIN public.user_profiles up
    ON up.id = u.id
ORDER BY up.created_at;


-- 9. Periksa role yang sudah diberikan kepada pengguna
SELECT
    u.email,
    r.role_code,
    r.role_name,
    ur.assigned_at
FROM public.user_roles ur
JOIN auth.users u
    ON u.id = ur.user_id
JOIN public.roles r
    ON r.id = ur.role_id
ORDER BY u.email, r.role_code;


-- 10. Periksa fungsi otorisasi
SELECT
    routine_name,
    routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
      'is_owner',
      'has_permission',
      'handle_new_user'
  )
ORDER BY routine_name;


-- 11. Periksa trigger pembuatan profil pengguna
SELECT
    trigger_name,
    event_object_table,
    action_timing,
    event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'auth'
  AND trigger_name = 'on_auth_user_created';
