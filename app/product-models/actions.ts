
"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/auth/authorization";

type CreateBrandResult =
  | {
      success: true;
      id: string;
      name: string;
      existing?: boolean;
    }
  | {
      success: false;
      error: string;
    };

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function generateMasterCode(prefix: string, name: string) {
  const slug =
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "ITEM";

  const suffix = randomUUID()
    .replace(/-/g, "")
    .slice(0, 8)
    .toUpperCase();

  return `${prefix}-${slug}-${suffix}`;
}

function isValidUUID(value: string) {
  return UUID_REGEX.test(value);
}

export async function createProductModel(formData: FormData) {
  const auth = await getAuthorizationContext("master.create");

  if (!auth.user) redirect("/login");

  if (!auth.authorized) {
    redirect("/product-models?error=forbidden");
  }

  const brandId = String(formData.get("brand_id") ?? "").trim();
  const modelCode = normalizeName(
    String(formData.get("model_code") ?? "")
  );
  const modelName = normalizeName(
    String(formData.get("model_name") ?? "")
  );
  const description = String(
    formData.get("description") ?? ""
  ).trim();

  if (!brandId || !modelCode || !modelName) {
    redirect("/product-models/new?error=required");
  }

  if (!isValidUUID(brandId)) {
    redirect("/product-models/new?error=invalid_brand");
  }

  if (
    modelCode.length > 50 ||
    modelName.length > 150 ||
    description.length > 5000
  ) {
    redirect("/product-models/new?error=invalid_length");
  }

  if (!/^[A-Z0-9_-]+$/.test(modelCode)) {
    redirect("/product-models/new?error=invalid_code");
  }

  const { data: brand, error: brandError } = await auth.supabase
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .eq("is_active", true)
    .maybeSingle();

  if (brandError || !brand) {
    redirect("/product-models/new?error=invalid_brand");
  }

  const { data: existingCode, error: codeLookupError } =
    await auth.supabase
      .from("product_models")
      .select("id")
      .eq("brand_id", brandId)
      .ilike("model_code", modelCode)
      .maybeSingle();

  if (codeLookupError) {
    console.error("Product Model code lookup failed:", codeLookupError);
    redirect("/product-models/new?error=lookup_failed");
  }

  if (existingCode) {
    redirect("/product-models/new?error=duplicate_code");
  }

  const { data: existingName, error: nameLookupError } =
    await auth.supabase
      .from("product_models")
      .select("id")
      .eq("brand_id", brandId)
      .ilike("model_name", modelName)
      .maybeSingle();

  if (nameLookupError) {
    console.error("Product Model name lookup failed:", nameLookupError);
    redirect("/product-models/new?error=lookup_failed");
  }

  if (existingName) {
    redirect("/product-models/new?error=duplicate_name");
  }

  const { data, error } = await auth.supabase
    .from("product_models")
    .insert({
      brand_id: brandId,
      model_code: modelCode,
      model_name: modelName,
      description: description || null,
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Create Product Model failed:", error);

    if (error?.code === "23505") {
      redirect("/product-models/new?error=duplicate");
    }

    if (error?.code === "23503") {
      redirect("/product-models/new?error=invalid_brand");
    }

    redirect("/product-models/new?error=save_failed");
  }

  revalidatePath("/product-models");
  revalidatePath("/products");

  redirect("/product-models?success=created");
}

export async function updateProductModel(formData: FormData) {
  const auth = await getAuthorizationContext("master.update");

  if (!auth.user) redirect("/login");

  if (!auth.authorized) {
    redirect("/product-models?error=forbidden");
  }

  const modelId = String(formData.get("id") ?? "").trim();
  const modelCode = normalizeName(
    String(formData.get("model_code") ?? "")
  );
  const modelName = normalizeName(
    String(formData.get("model_name") ?? "")
  );
  const description = String(
    formData.get("description") ?? ""
  ).trim();

  if (!isValidUUID(modelId)) {
    redirect("/product-models?error=invalid_id");
  }

  const editUrl = `/product-models/${modelId}/edit`;

  if (!modelCode || !modelName) {
    redirect(`${editUrl}?error=required`);
  }

  if (
    modelCode.length > 50 ||
    modelName.length > 150 ||
    description.length > 5000
  ) {
    redirect(`${editUrl}?error=invalid_length`);
  }

  if (!/^[A-Z0-9_-]+$/.test(modelCode)) {
    redirect(`${editUrl}?error=invalid_code`);
  }

  const { data: model, error: modelError } = await auth.supabase
    .from("product_models")
    .select("id, brand_id")
    .eq("id", modelId)
    .maybeSingle();

  if (modelError || !model) {
    redirect("/product-models?error=not_found");
  }

  const { data: existingCode, error: codeError } =
    await auth.supabase
      .from("product_models")
      .select("id")
      .eq("brand_id", model.brand_id)
      .ilike("model_code", modelCode)
      .neq("id", modelId)
      .maybeSingle();

  if (codeError) {
    console.error("Edit model code lookup failed:", codeError);
    redirect(`${editUrl}?error=lookup_failed`);
  }

  if (existingCode) {
    redirect(`${editUrl}?error=duplicate_code`);
  }

  const { data: existingName, error: nameError } =
    await auth.supabase
      .from("product_models")
      .select("id")
      .eq("brand_id", model.brand_id)
      .ilike("model_name", modelName)
      .neq("id", modelId)
      .maybeSingle();

  if (nameError) {
    console.error("Edit model name lookup failed:", nameError);
    redirect(`${editUrl}?error=lookup_failed`);
  }

  if (existingName) {
    redirect(`${editUrl}?error=duplicate_name`);
  }

  const { data: updatedModel, error: updateError } =
    await auth.supabase
      .from("product_models")
      .update({
        model_code: modelCode,
        model_name: modelName,
        description: description || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", modelId)
      .select("id")
      .maybeSingle();

  if (updateError) {
    console.error("Update Product Model failed:", updateError);

    if (updateError.code === "23505") {
      redirect(`${editUrl}?error=duplicate`);
    }

    redirect(`${editUrl}?error=save_failed`);
  }

  if (!updatedModel) {
    redirect(`${editUrl}?error=not_found`);
  }

  revalidatePath("/product-models");
  revalidatePath(`/product-models/${modelId}`);
  revalidatePath(`/product-models/${modelId}/edit`);
  revalidatePath("/products");

  redirect(`/product-models/${modelId}?success=updated`);
}

export async function createBrandForProductModel(
  nameInput: string
): Promise<CreateBrandResult> {
  const name = normalizeName(nameInput);

  if (!name) {
    return {
      success: false,
      error: "Nama Brand wajib diisi.",
    };
  }

  if (name.length > 255) {
    return {
      success: false,
      error: "Nama Brand maksimal 255 karakter.",
    };
  }

  const auth = await getAuthorizationContext("master.create");

  if (!auth.user) {
    return {
      success: false,
      error: "Sesi login berakhir. Silakan login kembali.",
    };
  }

  if (!auth.authorized) {
    return {
      success: false,
      error: "Anda tidak memiliki permission untuk menambah Brand.",
    };
  }

  const { data: existing, error: lookupError } = await auth.supabase
    .from("brands")
    .select("id, brand_name, is_active")
    .ilike("brand_name", name)
    .maybeSingle();

  if (lookupError) {
    console.error("Brand lookup failed:", lookupError);

    return {
      success: false,
      error: "Gagal memeriksa data Brand.",
    };
  }

  if (existing) {
    if (!existing.is_active) {
      return {
        success: false,
        error: "Brand sudah terdaftar tetapi tidak aktif.",
      };
    }

    return {
      success: true,
      id: existing.id,
      name: existing.brand_name,
      existing: true,
    };
  }

  const { data, error } = await auth.supabase
    .from("brands")
    .insert({
      brand_code: generateMasterCode("BRD", name),
      brand_name: name,
      is_active: true,
    })
    .select("id, brand_name")
    .single();

  if (error || !data) {
    console.error("Create Brand failed:", error);

    if (error?.code === "23505") {
      return {
        success: false,
        error: "Brand sudah terdaftar atau kode Brand sudah digunakan.",
      };
    }

    return {
      success: false,
      error: "Gagal menyimpan Brand.",
    };
  }

  revalidatePath("/brands");
  revalidatePath("/product-models");
  revalidatePath("/product-models/new");

  return {
    success: true,
    id: data.id,
    name: data.brand_name,
  };
}

export async function toggleProductModelStatus(formData: FormData) {
  const auth = await getAuthorizationContext("master.update");

  if (!auth.user) redirect("/login");

  if (!auth.authorized) {
    redirect("/product-models?error=forbidden");
  }

  const modelId = String(formData.get("id") ?? "").trim();

  if (!isValidUUID(modelId)) {
    redirect("/product-models?error=invalid_id");
  }

  const { data: model, error: lookupError } = await auth.supabase
    .from("product_models")
    .select("id, is_active")
    .eq("id", modelId)
    .maybeSingle();

  if (lookupError || !model) {
    redirect("/product-models?error=not_found");
  }

  const newStatus = !model.is_active;

  const { data: updatedModel, error: updateError } =
    await auth.supabase
      .from("product_models")
      .update({
        is_active: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", modelId)
      .eq("is_active", model.is_active)
      .select("id")
      .maybeSingle();

  if (updateError) {
    console.error("Toggle Product Model status failed:", updateError);
    redirect("/product-models?error=status_update_failed");
  }

  if (!updatedModel) {
    redirect("/product-models?error=status_conflict");
  }

  revalidatePath("/product-models");
  revalidatePath(`/product-models/${modelId}`);
  revalidatePath("/products");

  redirect(
    `/product-models?status=${
      newStatus ? "activated" : "deactivated"
    }`
  );
}
