
-- =====================================================
-- PROJECT : ERP Distribution & Mobile Phone Trading
-- FILE    : 11_assign_first_owner.sql
-- PURPOSE : Penetapan role Owner untuk akun pertama
-- ACCOUNT : dawudsw0491@gmail.com
-- =====================================================

-- 1. Menetapkan role Owner
INSERT INTO public.user_roles (
    user_id,
    role_id,
    assigned_by
)
SELECT
    u.id,
    r.id,
    u.id
FROM auth.users u
CROSS JOIN public.roles r
WHERE u.email = 'dawudsw0491@gmail.com'
  AND r.role_code = 'owner'
ON CONFLICT (user_id, role_id) DO NOTHING;


-- 2. Verifikasi role Owner
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
WHERE u.email = 'dawudsw0491@gmail.com';
