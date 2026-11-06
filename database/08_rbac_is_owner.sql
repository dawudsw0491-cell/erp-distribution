
-- =====================================================
-- PROJECT : ERP Distribution & Mobile Phone Trading
-- FILE    : 08_rbac_is_owner.sql
-- PURPOSE : Fungsi pemeriksaan role Owner
-- SOURCE  : Definisi aktual dari Supabase
-- NOTE    : Dokumentasi saja. Jangan dijalankan ulang.
-- =====================================================

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles r
            ON r.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND r.role_code = 'owner'
          AND r.is_active = TRUE
    );
$function$;
