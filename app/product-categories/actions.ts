"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAuthorizationContext } from "@/lib/auth/authorization";

const MAIN_CATEGORIES = [
  "SMARTPHONE",
  "TABLET",
  "AKSESORIS",
  "KOMPUTER DAN LAPTOP",
  "NETWORKING",
  "KOMPONEN ELEKTRONIK",
] as const;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CategoryType = "main" | "subcategory";

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function generateCategoryCode(name: string) {
  const slug =
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 17) || "CATEGORY";

  return `CAT-${slug}-${randomUUID()
    .replace(/-/g, "")
    .slice(0, 8)
    .toUpperCase()}`;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function getFormCategoryType(value: string): CategoryType | null {
  if (value === "main" || value === "subcategory") {
    return value;
  }

  return null;
}

function isMainCategoryName(name: string) {
  return MAIN_CATEGORIES.includes(
    name as (typeof MAIN_CATEGORIES)[number]
  );
}

async function validateParent(
  supabase: Awaited<
    ReturnType<typeof getAuthorizationContext>
  >["supabase"],
  parentId: string | null,
  currentId?: string
) {
  if (!parentId) return false;

  if (!UUID_REGEX.test(parentId)) return false;
  if (parentId === currentId) return false;

  const { data: parent, error: parentError } = await supabase
    .from("product_categories")
    .select("id, is_active, parent_id, category_name")
    .eq("id", parentId)
    .maybeSingle();

  if (
    parentError ||
    !parent ||
    !parent.is_active ||
    parent.parent_id !== null ||
    !isMainCategoryName(parent.category_name)
  ) {
    return false;
  }

  return true;
}

async function checkDuplicateName(
  supabase: Awaited<
    ReturnType<typeof getAuthorizationContext>
  >["supabase"],
  name: string,
  excludeId?: string
) {
  let query = supabase
    .from("product_categories")
    .select("id")
    .ilike("category_name", escapeLike(name))
    .limit(1);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("Category duplicate lookup failed:", error);

    return {
      duplicate: false,
      failed: true,
    };
  }

  return {
    duplicate: Boolean(data),
    failed: false,
  };
}

function redirectToFormError(
  type: "create" | "edit",
  id: string | null,
  error: string
): never {
  if (type === "edit" && id) {
    redirect(`/product-categories/${id}/edit?error=${error}`);
  }

  redirect(`/product-categories/new?error=${error}`);
}

async function validateCategoryInput(
  supabase: Awaited<
    ReturnType<typeof getAuthorizationContext>
  >["supabase"],
  formData: FormData,
  mode: "create" | "edit",
  id: string | null
) {
  const categoryType = getFormCategoryType(
    String(formData.get("category_type") ?? "")
  );

  const name = normalizeName(
    String(formData.get("category_name") ?? "")
  );

  const description =
    String(formData.get("description") ?? "").trim() || null;

  const parentValue = String(
    formData.get("parent_id") ?? ""
  ).trim();

  const parentId = parentValue || null;

  if (!categoryType) {
    redirectToFormError(mode, id, "invalid_category_type");
  }

  if (!name) {
    redirectToFormError(mode, id, "required");
  }

  if (name.length > 255 || (description && description.length > 5000)) {
    redirectToFormError(mode, id, "invalid_length");
  }

  if (categoryType === "main") {
    if (!isMainCategoryName(name)) {
      redirectToFormError(mode, id, "invalid_main_category");
    }

    if (parentId) {
      redirectToFormError(mode, id, "invalid_parent");
    }
  }

  if (categoryType === "subcategory") {
    if (!parentId) {
      redirectToFormError(mode, id, "parent_required");
    }

    if (!(await validateParent(supabase, parentId, id ?? undefined))) {
      redirectToFormError(mode, id, "invalid_parent");
    }
  }

  const duplicate = await checkDuplicateName(
    supabase,
    name,
    id ?? undefined
  );

  if (duplicate.failed) {
    redirectToFormError(mode, id, "lookup_failed");
  }

  if (duplicate.duplicate) {
    redirectToFormError(mode, id, "duplicate");
  }

  return {
    name,
    description,
    parentId,
  };
}

export async function createProductCategory(formData: FormData) {
  const auth = await getAuthorizationContext("master.create");

  if (!auth.user) redirect("/login");

  if (!auth.authorized) {
    redirect("/product-categories?error=forbidden");
  }

  const { name, description, parentId } =
    await validateCategoryInput(
      auth.supabase,
      formData,
      "create",
      null
    );

  const { data, error } = await auth.supabase
    .from("product_categories")
    .insert({
      category_code: generateCategoryCode(name),
      category_name: name,
      description,
      parent_id: parentId,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Create product category failed:", error);

    redirect(
      `/product-categories/new?error=${
        error.code === "23505" ? "duplicate_code" : "save_failed"
      }`
    );
  }

  revalidatePath("/product-categories");
  revalidatePath("/products");
  revalidatePath("/products/new");

  redirect(`/product-categories/${data.id}?created=1`);
}

export async function updateProductCategory(formData: FormData) {
  const auth = await getAuthorizationContext("master.update");

  if (!auth.user) redirect("/login");

  if (!auth.authorized) {
    redirect("/product-categories?error=forbidden");
  }

  const id = String(formData.get("id") ?? "").trim();

  if (!UUID_REGEX.test(id)) {
    redirect("/product-categories?error=invalid_id");
  }

  const { data: existing, error: lookupError } = await auth.supabase
    .from("product_categories")
    .select("id, parent_id")
    .eq("id", id)
    .maybeSingle();

  if (lookupError || !existing) {
    redirect("/product-categories?error=not_found");
  }

  const { name, description, parentId } =
    await validateCategoryInput(
      auth.supabase,
      formData,
      "edit",
      id
    );

  if (existing.parent_id === null && parentId) {
    const { data: children, error: childrenError } =
      await auth.supabase
        .from("product_categories")
        .select("id")
        .eq("parent_id", id)
        .limit(1);

    if (childrenError) {
      console.error(
        "Category child lookup failed:",
        childrenError
      );

      redirect(
        `/product-categories/${id}/edit?error=lookup_failed`
      );
    }

    if (children && children.length > 0) {
      redirect(
        `/product-categories/${id}/edit?error=has_children`
      );
    }
  }

  const { error } = await auth.supabase
    .from("product_categories")
    .update({
      category_name: name,
      description,
      parent_id: parentId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("Update product category failed:", error);

    redirect(
      `/product-categories/${id}/edit?error=save_failed`
    );
  }

  revalidatePath("/product-categories");
  revalidatePath(`/product-categories/${id}`);
  revalidatePath(`/product-categories/${id}/edit`);
  revalidatePath("/products");
  revalidatePath("/products/new");

  redirect(`/product-categories/${id}?updated=1`);
}

export async function toggleProductCategoryStatus(
  formData: FormData
) {
  const auth = await getAuthorizationContext("master.update");

  if (!auth.user) redirect("/login");

  if (!auth.authorized) {
    redirect("/product-categories?error=forbidden");
  }

  const id = String(formData.get("id") ?? "").trim();

  if (!UUID_REGEX.test(id)) {
    redirect("/product-categories?error=invalid_id");
  }

  const { data: category, error: lookupError } = await auth.supabase
    .from("product_categories")
    .select("id, is_active, parent_id")
    .eq("id", id)
    .maybeSingle();

  if (lookupError || !category) {
    redirect("/product-categories?error=not_found");
  }

  const newStatus = !category.is_active;

  if (!newStatus && category.parent_id === null) {
    const { data: activeChildren, error: childrenError } =
      await auth.supabase
        .from("product_categories")
        .select("id")
        .eq("parent_id", id)
        .eq("is_active", true)
        .limit(1);

    if (childrenError) {
      console.error(
        "Active category child lookup failed:",
        childrenError
      );

      redirect(
        `/product-categories/${id}?error=status_update_failed`
      );
    }

    if (activeChildren && activeChildren.length > 0) {
      redirect(
        `/product-categories/${id}?error=has_active_children`
      );
    }
  }

  const { data: updated, error } = await auth.supabase
    .from("product_categories")
    .update({
      is_active: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("is_active", category.is_active)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Toggle category status failed:", error);

    redirect(
      `/product-categories/${id}?error=status_update_failed`
    );
  }

  if (!updated) {
    redirect(
      `/product-categories/${id}?error=status_conflict`
    );
  }

  revalidatePath("/product-categories");
  revalidatePath(`/product-categories/${id}`);
  revalidatePath("/products");
  revalidatePath("/products/new");

  redirect(
    `/product-categories/${id}?status=${
      newStatus ? "activated" : "deactivated"
    }`
  );
}