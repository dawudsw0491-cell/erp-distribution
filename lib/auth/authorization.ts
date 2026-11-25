import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type AuthorizationContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: {
    id: string;
    email?: string;
  } | null;
  profile: {
    full_name: string | null;
    is_active: boolean;
  } | null;
  authorized: boolean;
};

// Reuse the Supabase client and authenticated user for the current
// server-render request. React cache is request-scoped; it does not
// persist user data between independent requests.
const getRequestSupabase = cache(async () => createClient());

const getRequestUser = cache(async () => {
  const supabase = await getRequestSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return { user, error };
});

const getRequestProfile = cache(async (userId: string) => {
  const supabase = await getRequestSupabase();

  return supabase
    .from("user_profiles")
    .select("full_name, is_active")
    .eq("id", userId)
    .maybeSingle();
});

export async function getAuthorizationContext(
  requiredPermission: string
): Promise<AuthorizationContext> {
  const [supabase, authResult] = await Promise.all([
    getRequestSupabase(),
    getRequestUser(),
  ]);

  const { user, error: authError } = authResult;

  if (authError || !user) {
    return {
      supabase,
      user: null,
      profile: null,
      authorized: false,
    };
  }

  // Profile lookup and permission RPC are independent after the
  // authenticated user is known. Run them concurrently to remove one
  // sequential network round-trip from every protected page.
  const [profileResult, permissionResult] = await Promise.all([
    getRequestProfile(user.id),
    supabase.rpc("has_permission", {
      required_permission: requiredPermission,
    }),
  ]);

  const profile = profileResult.data;
  const profileIsValid =
    !profileResult.error && Boolean(profile?.is_active);

  const permissionIsValid =
    !permissionResult.error && permissionResult.data === true;

  return {
    supabase,
    user: {
      id: user.id,
      email: user.email,
    },
    profile: profileIsValid && profile
      ? {
          full_name: profile.full_name,
          is_active: profile.is_active,
        }
      : null,
    authorized: profileIsValid && permissionIsValid,
  };
}


/**
 * Authenticates the current request and verifies that the user profile is active.
 * Use only when the called database RPC performs its own permission check.
 * The RPC remains the authorization boundary; this avoids a duplicate
 * has_permission round-trip before the atomic database operation.
 */
export type AuthenticatedContext = Pick<AuthorizationContext, "supabase" | "user" | "profile">;

export async function getAuthenticatedContext(): Promise<AuthenticatedContext> {
  const [supabase, authResult] = await Promise.all([getRequestSupabase(), getRequestUser()]);
  const { user, error: authError } = authResult;
  if (authError || !user) return { supabase, user: null, profile: null };

  const profileResult = await getRequestProfile(user.id);
  const profile = profileResult.data;
  const profileIsValid = !profileResult.error && Boolean(profile?.is_active);

  return {
    supabase,
    user: { id: user.id, email: user.email },
    profile: profileIsValid && profile
      ? { full_name: profile.full_name, is_active: profile.is_active }
      : null,
  };
}
