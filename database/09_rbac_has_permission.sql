
-- =====================================================
-- PROJECT : ERP Distribution & Mobile Phone Trading
-- FILE    : 09_rbac_has_permission.sql
-- PURPOSE : Fungsi pemeriksaan hak akses pengguna
-- SOURCE  : Definisi aktual dari Supabase
-- NOTE    : Dokumentasi saja. Jangan dijalankan ulang.
-- =====================================================

CREATE OR REPLACE FUNCTION public.has_permission(
    required_permission TEXT
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
    SELECT
        public.is_owner()
        OR EXISTS (
            SELECT 1
            FROM public.user_roles ur
            JOIN public.roles r
                ON r.id = ur.role_id
            JOIN public.role_permissions rp
                ON rp.role_id = r.id
            JOIN public.permissions p
                ON p.id = rp.permission_id
            WHERE ur.user_id = (SELECT auth.uid())
              AND r.is_active = TRUE
              AND p.permission_code = required_permission
        );
$function$;
