-- =====================================================
-- FILE 14: RBAC RLS POLICIES
-- PROJECT: ERP Distribution
-- PURPOSE: Mengamankan tabel RBAC
-- ACCESS: AUTHENTICATED USERS
-- =====================================================

-- 1. ROLES
DROP POLICY IF EXISTS "Owner manages roles"
ON public.roles;

CREATE POLICY "Owner manages roles"
ON public.roles
FOR ALL
TO authenticated
USING (public.is_owner())
WITH CHECK (public.is_owner());


-- 2. PERMISSIONS
DROP POLICY IF EXISTS "Owner manages permissions"
ON public.permissions;

CREATE POLICY "Owner manages permissions"
ON public.permissions
FOR ALL
TO authenticated
USING (public.is_owner())
WITH CHECK (public.is_owner());


-- 3. ROLE PERMISSIONS
DROP POLICY IF EXISTS "Owner manages role permissions"
ON public.role_permissions;

CREATE POLICY "Owner manages role permissions"
ON public.role_permissions
FOR ALL
TO authenticated
USING (public.is_owner())
WITH CHECK (public.is_owner());


-- 4. USER ROLES
DROP POLICY IF EXISTS "Owner manages user roles"
ON public.user_roles;

CREATE POLICY "Owner manages user roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.is_owner())
WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS "Users view own roles"
ON public.user_roles;

CREATE POLICY "Users view own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()));


-- 5. USER PROFILES
DROP POLICY IF EXISTS "Owner manages user profiles"
ON public.user_profiles;

CREATE POLICY "Owner manages user profiles"
ON public.user_profiles
FOR ALL
TO authenticated
USING (public.is_owner())
WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS "Users view own profile"
ON public.user_profiles;

CREATE POLICY "Users view own profile"
ON public.user_profiles
FOR SELECT
TO authenticated
USING (id = (SELECT auth.uid()))