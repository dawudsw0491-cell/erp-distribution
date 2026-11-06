
-- =====================================================
-- PROJECT : ERP Distribution & Mobile Phone Trading
-- FILE    : 10_user_profile_trigger.sql
-- PURPOSE : Otomatis membuat profil pengguna baru
-- SOURCE  : Definisi aktual dari Supabase
-- NOTE    : Dokumentasi saja. Jangan dijalankan ulang.
-- =====================================================

-- 1. Fungsi otomatis membuat user profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
    INSERT INTO public.user_profiles (
        id,
        full_name,
        phone,
        is_active
    )
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data ->> 'full_name',
        NEW.raw_user_meta_data ->> 'phone',
        TRUE
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$function$;


-- 2. Trigger pada Supabase Auth
-- Event  : AFTER INSERT
-- Table  : auth.users
-- Action : Menjalankan handle_new_user()

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();
