
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

export async function getAuthorizationContext(
  requiredPermission: string
): Promise<AuthorizationContext> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      supabase,
      user: null,
      profile: null,
      authorized: false,
    };
  }

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from("user_profiles")
    .select("full_name, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.is_active) {
    return {
      supabase,
      user: {
        id: user.id,
        email: user.email,
      },
      profile: null,
      authorized: false,
    };
  }

  const {
    data: hasPermission,
    error: permissionError,
  } = await supabase.rpc("has_permission", {
    required_permission: requiredPermission,
  });

  if (permissionError || hasPermission !== true) {
    return {
      supabase,
      user: {
        id: user.id,
        email: user.email,
      },
      profile: {
        full_name: profile.full_name,
        is_active: profile.is_active,
      },
      authorized: false,
    };
  }

  return {
    supabase,
    user: {
      id: user.id,
      email: user.email,
    },
    profile: {
      full_name: profile.full_name,
      is_active: profile.is_active,
    },
    authorized: true,
  };
}
