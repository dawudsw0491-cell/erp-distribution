
"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/auth/authorization";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAIN_CATEGORIES = [
  "SMARTPHONE",
  "TABLET",
  "AKSESORIS",
  "KOMPUTER DAN LAPTOP",
  "NETWORKING",
  "KOMPONEN ELEKTRONIK",
] as const;

type ProductCondition = "BARU" | "SECOND";

type CreateMasterResult =
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

function getOptionalUuid(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim();

  if (!normalized) return null;
  if (!UUID_REGEX.test(normalized)) return undefined;

  return normalized;
}

function normalizeMasterName(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function generateMasterCode(prefix: string, name: string) {
  const slug =
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 17) || "ITEM";

  const suffix = randomUUID()
    .replace(/-/g, "")
    .slice(0, 8)
    .toUpperCase();

  return `${prefix}-${slug}-${suffix}`;
}

function getProductCondition(
  value: FormDataEntryValue | null
): ProductCondition | null | undefined {
  const normalized = String(value ?? "").trim().toUpperCase();

  if (!normalized) return null;
  if (normalized === "BARU" || normalized === "SECOND") {
    return normalized;
  }

  return undefined;
}

export async function createCategory(
  input: string
): Promise<CreateMasterResult> {
  const auth = await getAuthorizationContext("master.create");

  if (!auth.user) {
    return {
      success: false,
      error: "Sesi login telah berakhir. Silakan login kembali.",
    };
  }

  if (!auth.authorized) {
    return {
      success: false,
      error: "Anda tidak memiliki izin membuat kategori.",
    };
  }

  const categoryName = normalizeMasterName(input);

  if (!MAIN_CATEGORIES.includes(categoryName as (typeof MAIN_CATEGORIES)[number])) {
    return {
      success: false,
      error: "Kategori utama harus menggunakan salah satu dari enam kategori resmi.",
    };
  }

  const { data: existing, error: lookupError } = await auth.supabase
    .from("product_categories")
    .select("id, category_name, is_active, parent_id")
    .ilike("category_name", categoryName)
    .is("parent_id", null)
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    console.error("Category lookup failed:", lookupError);

    return {
      success: false,
      error: "Gagal memeriksa kategori yang sudah tersedia.",
    };
  }

  if (existing) {
    if (!existing.is_active) {
      return {
        success: false,
        error: "Kategori sudah ada tetapi tidak aktif.",
      };
    }

    return {
      success: true,
      id: existing.id,
      name: existing.category_name,
      existing: true,
    };
  }

  const { data, error } = await auth.supabase
    .from("product_categories")
    .insert({
      category_code: generateMasterCode("CAT", categoryName),
      category_name: categoryName,
      parent_id: null,
      is_active: true,
    })
    .select("id, category_name")
    .single();

  if (error) {
    console.error("Create category failed:", error);

    return {
      success: false,
      error: "Gagal menyimpan kategori baru ke database.",
    };
  }

  revalidatePath("/products/new");
  revalidatePath("/product-categories");

  return {
    success: true,
    id: data.id,
    name: data.category_name,
  };
}

export async function createBrand(
  input: string
): Promise<CreateMasterResult> {
  const auth = await getAuthorizationContext("master.create");

  if (!auth.user) {
    return {
      success: false,
      error: "Sesi login telah berakhir. Silakan login kembali.",
    };
  }

  if (!auth.authorized) {
    return {
      success: false,
      error: "Anda tidak memiliki izin membuat brand.",
    };
  }

  const brandName = normalizeMasterName(input);

  if (!brandName) {
    return {
      success: false,
      error: "Nama brand wajib diisi.",
    };
  }

  if (brandName.length > 255) {
    return {
      success: false,
      error: "Nama brand maksimal 255 karakter.",
    };
  }

  const { data: existing, error: lookupError } = await auth.supabase
    .from("brands")
    .select("id, brand_name, is_active")
    .ilike("brand_name", brandName)
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    console.error("Brand lookup failed:", lookupError);

    return {
      success: false,
      error: "Gagal memeriksa brand yang sudah tersedia.",
    };
  }

  if (existing) {
    if (!existing.is_active) {
      return {
        success: false,
        error: "Brand sudah ada tetapi tidak aktif.",
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
      brand_code: generateMasterCode("BRD", brandName),
      brand_name: brandName,
      is_active: true,
    })
    .select("id, brand_name")
    .single();

  if (error) {
    console.error("Create brand failed:", error);

    return {
      success: false,
      error: "Gagal menyimpan brand baru ke database.",
    };
  }

  revalidatePath("/products/new");

  return {
    success: true,
    id: data.id,
    name: data.brand_name,
  };
}

export async function createProduct(formData: FormData) {
  const auth = await getAuthorizationContext("master.create");

  if (!auth.user) redirect("/login");
  if (!auth.authorized) redirect("/products?error=forbidden");

  const sku = String(formData.get("sku") ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();

  const productName = String(formData.get("product_name") ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

  const barcode = String(formData.get("barcode") ?? "").trim() || null;
  const productType = String(formData.get("product_type") ?? "goods");
  const trackingType = String(formData.get("tracking_type") ?? "quantity");
  const unit = String(formData.get("unit") ?? "pcs").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  let categoryId = getOptionalUuid(formData.get("category_id"));
  let subcategoryId = getOptionalUuid(
    formData.get("product_subcategory_id")
  );
  let productCondition = getProductCondition(
    formData.get("product_condition")
  );

  const brandId = getOptionalUuid(formData.get("brand_id"));
  const minimumStock = Number(
    String(formData.get("minimum_stock") ?? "0").trim()
  );

  if (!sku || !productName || !unit) {
    redirect("/products/new?error=required");
  }

  if (sku.length > 255 || productName.length > 255 || unit.length > 50) {
    redirect("/products/new?error=invalid_length");
  }

  if (!/^[A-Z0-9._-]+$/.test(sku)) {
    redirect("/products/new?error=invalid_sku_format");
  }

  if (barcode !== null && barcode.length > 255) {
    redirect("/products/new?error=invalid_barcode");
  }

  if (!["goods", "service"].includes(productType)) {
    redirect("/products/new?error=invalid_type");
  }

  if (!["quantity", "imei", "serial"].includes(trackingType)) {
    redirect("/products/new?error=invalid_tracking");
  }

  if (!Number.isFinite(minimumStock) || minimumStock < 0) {
    redirect("/products/new?error=invalid_stock");
  }

  if (categoryId === undefined || subcategoryId === undefined || brandId === undefined) {
    redirect("/products/new?error=invalid_reference");
  }

  if (productType === "service") {
    categoryId = null;
    subcategoryId = null;
    productCondition = null;
  } else {
    if (productCondition === undefined) {
      redirect("/products/new?error=invalid_condition");
    }

    if (productCondition === null) {
      redirect("/products/new?error=condition_required");
    }

    if (subcategoryId && !categoryId) {
      redirect("/products/new?error=invalid_subcategory");
    }
  }

  if (categoryId) {
    const { data: category, error } = await auth.supabase
      .from("product_categories")
      .select("id, category_name, parent_id")
      .eq("id", categoryId)
      .eq("is_active", true)
      .is("parent_id", null)
      .maybeSingle();

    if (
      error ||
      !category ||
      !MAIN_CATEGORIES.includes(
        category.category_name as (typeof MAIN_CATEGORIES)[number]
      )
    ) {
      redirect("/products/new?error=invalid_category");
    }
  }

  if (subcategoryId) {
    const { data: subcategory, error } = await auth.supabase
      .from("product_categories")
      .select("id, parent_id")
      .eq("id", subcategoryId)
      .eq("is_active", true)
      .maybeSingle();

    if (error || !subcategory || subcategory.parent_id !== categoryId) {
      redirect("/products/new?error=invalid_subcategory");
    }
  }

  if (brandId) {
    const { data: brand, error } = await auth.supabase
      .from("brands")
      .select("id")
      .eq("id", brandId)
      .eq("is_active", true)
      .maybeSingle();

    if (error || !brand) {
      redirect("/products/new?error=invalid_brand");
    }
  }

  const { data, error } = await auth.supabase
    .from("products")
    .insert({
      sku,
      barcode,
      product_name: productName,
      category_id: categoryId,
      product_subcategory_id: subcategoryId,
      product_condition: productCondition,
      brand_id: brandId,
      product_type: productType,
      tracking_type: trackingType,
      unit,
      description,
      minimum_stock: minimumStock,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Create product failed:", error);

    if (error.code === "23505") redirect("/products/new?error=duplicate");
    if (error.code === "23503") redirect("/products/new?error=invalid_reference");

    redirect("/products/new?error=save_failed");
  }

  revalidatePath("/products");
  redirect(`/products?created=1&id=${data.id}`);
}

export async function updateProduct(formData: FormData) {
  const auth = await getAuthorizationContext("master.update");

  if (!auth.user) redirect("/login");
  if (!auth.authorized) redirect("/products?error=forbidden");

  const productId = String(formData.get("id") ?? "").trim();

  if (!UUID_REGEX.test(productId)) {
    redirect("/products?error=invalid_id");
  }

  const { data: existingProduct, error: lookupError } = await auth.supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .maybeSingle();

  if (lookupError || !existingProduct) {
    redirect("/products?error=not_found");
  }

  const productName = String(formData.get("product_name") ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

  const barcode = String(formData.get("barcode") ?? "").trim() || null;
  const productType = String(formData.get("product_type") ?? "");
  const trackingType = String(formData.get("tracking_type") ?? "");
  const unit = String(formData.get("unit") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  let categoryId = getOptionalUuid(formData.get("category_id"));
  let subcategoryId = getOptionalUuid(
    formData.get("product_subcategory_id")
  );
  let productCondition = getProductCondition(
    formData.get("product_condition")
  );

  const brandId = getOptionalUuid(formData.get("brand_id"));
  const minimumStock = Number(
    String(formData.get("minimum_stock") ?? "0").trim()
  );

  if (!productName || !unit) {
    redirect(`/products/${productId}/edit?error=required`);
  }

  if (productName.length > 255 || unit.length > 50) {
    redirect(`/products/${productId}/edit?error=invalid_length`);
  }

  if (barcode !== null && barcode.length > 255) {
    redirect(`/products/${productId}/edit?error=invalid_barcode`);
  }

  if (!["goods", "service"].includes(productType)) {
    redirect(`/products/${productId}/edit?error=invalid_type`);
  }

  if (!["quantity", "imei", "serial"].includes(trackingType)) {
    redirect(`/products/${productId}/edit?error=invalid_tracking`);
  }

  if (!Number.isFinite(minimumStock) || minimumStock < 0) {
    redirect(`/products/${productId}/edit?error=invalid_stock`);
  }

  if (categoryId === undefined || subcategoryId === undefined || brandId === undefined) {
    redirect(`/products/${productId}/edit?error=invalid_reference`);
  }

  if (productType === "service") {
    categoryId = null;
    subcategoryId = null;
    productCondition = null;
  } else {
    if (productCondition === undefined) {
      redirect(`/products/${productId}/edit?error=invalid_condition`);
    }

    if (subcategoryId && !categoryId) {
      redirect(`/products/${productId}/edit?error=invalid_subcategory`);
    }
  }

  if (categoryId) {
    const { data: category, error } = await auth.supabase
      .from("product_categories")
      .select("id, category_name, parent_id")
      .eq("id", categoryId)
      .eq("is_active", true)
      .is("parent_id", null)
      .maybeSingle();

    if (
      error ||
      !category ||
      !MAIN_CATEGORIES.includes(
        category.category_name as (typeof MAIN_CATEGORIES)[number]
      )
    ) {
      redirect(`/products/${productId}/edit?error=invalid_category`);
    }
  }

  if (subcategoryId) {
    const { data: subcategory, error } = await auth.supabase
      .from("product_categories")
      .select("id, parent_id")
      .eq("id", subcategoryId)
      .eq("is_active", true)
      .maybeSingle();

    if (error || !subcategory || subcategory.parent_id !== categoryId) {
      redirect(`/products/${productId}/edit?error=invalid_subcategory`);
    }
  }

  if (brandId) {
    const { data: brand, error } = await auth.supabase
      .from("brands")
      .select("id")
      .eq("id", brandId)
      .eq("is_active", true)
      .maybeSingle();

    if (error || !brand) {
      redirect(`/products/${productId}/edit?error=invalid_brand`);
    }
  }

  const { error } = await auth.supabase
    .from("products")
    .update({
      barcode,
      product_name: productName,
      category_id: categoryId,
      product_subcategory_id: subcategoryId,
      product_condition: productCondition,
      brand_id: brandId,
      product_type: productType,
      tracking_type: trackingType,
      unit,
      description,
      minimum_stock: minimumStock,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId);

  if (error) {
    console.error("Update product failed:", error);

    if (error.code === "23505") {
      redirect(`/products/${productId}/edit?error=duplicate`);
    }

    if (error.code === "23503") {
      redirect(`/products/${productId}/edit?error=invalid_reference`);
    }

    redirect(`/products/${productId}/edit?error=save_failed`);
  }

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  revalidatePath(`/products/${productId}/edit`);

  redirect(`/products/${productId}?updated=1`);
}

export async function toggleProductStatus(formData: FormData) {
  const auth = await getAuthorizationContext("master.update");

  if (!auth.user) redirect("/login");
  if (!auth.authorized) redirect("/products?error=forbidden");

  const productId = String(formData.get("id") ?? "").trim();

  if (!UUID_REGEX.test(productId)) {
    redirect("/products?error=invalid_id");
  }

  const { data: product, error: lookupError } = await auth.supabase
    .from("products")
    .select("id, is_active")
    .eq("id", productId)
    .maybeSingle();

  if (lookupError || !product) {
    redirect("/products?error=not_found");
  }

  const newStatus = !product.is_active;

  const { data: updatedProduct, error } = await auth.supabase
    .from("products")
    .update({
      is_active: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId)
    .eq("is_active", product.is_active)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Toggle product status failed:", error);
    redirect(`/products/${productId}?error=status_update_failed`);
  }

  if (!updatedProduct) {
    redirect(`/products/${productId}?error=status_conflict`);
  }

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  revalidatePath(`/products/${productId}/edit`);

  redirect(
    `/products/${productId}?status=${newStatus ? "activated" : "deactivated"}`
  );
}

/* LEGACY PRODUCT VARIANT FUNCTIONS — dipertahankan */

export async function createProductVariant(formData: FormData) {
  const auth = await getAuthorizationContext("master.create");

  if (!auth.user) redirect("/login");
  if (!auth.authorized) redirect("/products?error=forbidden");

  const productId = String(formData.get("product_id") ?? "").trim();

  if (!UUID_REGEX.test(productId)) redirect("/products?error=invalid_id");

  const variantSku = String(formData.get("variant_sku") ?? "")
    .trim()
    .toUpperCase();

  const skuPattern = variantSku.replace(/[\\%_]/g, "\\$&");

  const variantName = String(formData.get("variant_name") ?? "")
    .trim()
    .replace(/\s+/g, " ");

  const barcode = String(formData.get("barcode") ?? "").trim() || null;

  if (!variantSku || !variantName) {
    redirect(`/products/${productId}/variants/new?error=required`);
  }

  if (variantSku.length > 50) {
    redirect(`/products/${productId}/variants/new?error=invalid_sku`);
  }

  if (variantName.length > 200) {
    redirect(`/products/${productId}/variants/new?error=invalid_name`);
  }

  if (barcode !== null && barcode.length > 100) {
    redirect(`/products/${productId}/variants/new?error=invalid_barcode`);
  }

  if (!/^[A-Z0-9._-]+$/.test(variantSku)) {
    redirect(`/products/${productId}/variants/new?error=invalid_sku_format`);
  }

  const { data: product, error: productError } = await auth.supabase
    .from("products")
    .select("id, sku, is_active, product_type")
    .eq("id", productId)
    .maybeSingle();

  if (productError || !product) redirect("/products?error=not_found");

  if (!product.is_active) {
    redirect(`/products/${productId}/variants/new?error=inactive_product`);
  }

  if (product.product_type !== "goods") {
    redirect(`/products/${productId}/variants/new?error=invalid_product_type`);
  }

  if (product.sku.trim().toUpperCase() === variantSku) {
    redirect(`/products/${productId}/variants/new?error=duplicate_sku`);
  }

  const { data: existingVariant, error: variantLookupError } =
    await auth.supabase
      .from("product_variants")
      .select("id")
      .ilike("variant_sku", skuPattern)
      .limit(1)
      .maybeSingle();

  if (variantLookupError) {
    console.error("Variant SKU lookup failed:", variantLookupError);
    redirect(`/products/${productId}/variants/new?error=lookup_failed`);
  }

  if (existingVariant) {
    redirect(`/products/${productId}/variants/new?error=duplicate_sku`);
  }

  const { data: existingProductSku, error: productSkuError } =
    await auth.supabase
      .from("products")
      .select("id")
      .ilike("sku", skuPattern)
      .limit(1)
      .maybeSingle();

  if (productSkuError) {
    console.error("Product SKU lookup failed:", productSkuError);
    redirect(`/products/${productId}/variants/new?error=lookup_failed`);
  }

  if (existingProductSku) {
    redirect(`/products/${productId}/variants/new?error=duplicate_sku`);
  }

  const { data: variant, error } = await auth.supabase
    .from("product_variants")
    .insert({
      product_id: productId,
      variant_sku: variantSku,
      variant_name: variantName,
      barcode,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Create product variant failed:", error);

    if (error.code === "23505") {
      redirect(`/products/${productId}/variants/new?error=duplicate`);
    }

    if (error.code === "23503") {
      redirect(`/products/${productId}/variants/new?error=invalid_reference`);
    }

    redirect(`/products/${productId}/variants/new?error=save_failed`);
  }

  revalidatePath(`/products/${productId}`);
  revalidatePath(`/products/${productId}/variants`);

  redirect(`/products/${productId}/variants?created=1&id=${variant.id}`);
}

export async function updateProductVariant(formData: FormData) {
  const auth = await getAuthorizationContext("master.update");

  if (!auth.user) redirect("/login");
  if (!auth.authorized) redirect("/products?error=forbidden");

  const productId = String(formData.get("product_id") ?? "").trim();
  const variantId = String(formData.get("variant_id") ?? "").trim();

  if (!UUID_REGEX.test(productId) || !UUID_REGEX.test(variantId)) {
    redirect("/products?error=invalid_id");
  }

  const { data: existingVariant, error: lookupError } =
    await auth.supabase
      .from("product_variants")
      .select("id, product_id, variant_sku")
      .eq("id", variantId)
      .eq("product_id", productId)
      .maybeSingle();

  if (lookupError) {
    console.error("Variant lookup failed:", lookupError);
    redirect(`/products/${productId}/variants/${variantId}?error=lookup_failed`);
  }

  if (!existingVariant) redirect("/products?error=not_found");

  const variantName = String(formData.get("variant_name") ?? "")
    .trim()
    .replace(/\s+/g, " ");

  const barcode = String(formData.get("barcode") ?? "").trim() || null;

  if (!variantName) {
    redirect(`/products/${productId}/variants/${variantId}/edit?error=required`);
  }

  if (variantName.length > 200) {
    redirect(`/products/${productId}/variants/${variantId}/edit?error=invalid_name`);
  }

  if (barcode !== null && barcode.length > 100) {
    redirect(`/products/${productId}/variants/${variantId}/edit?error=invalid_barcode`);
  }

  const { data: duplicateName, error: nameLookupError } =
    await auth.supabase
      .from("product_variants")
      .select("id")
      .eq("product_id", productId)
      .ilike("variant_name", variantName)
      .neq("id", variantId)
      .limit(1)
      .maybeSingle();

  if (nameLookupError) {
    console.error("Variant name lookup failed:", nameLookupError);
    redirect(`/products/${productId}/variants/${variantId}/edit?error=lookup_failed`);
  }

  if (duplicateName) {
    redirect(`/products/${productId}/variants/${variantId}/edit?error=duplicate_name`);
  }

  if (barcode !== null) {
    const { data: duplicateBarcode, error: barcodeLookupError } =
      await auth.supabase
        .from("product_variants")
        .select("id")
        .eq("barcode", barcode)
        .neq("id", variantId)
        .limit(1)
        .maybeSingle();

    if (barcodeLookupError) {
      console.error("Variant barcode lookup failed:", barcodeLookupError);
      redirect(`/products/${productId}/variants/${variantId}/edit?error=lookup_failed`);
    }

    if (duplicateBarcode) {
      redirect(`/products/${productId}/variants/${variantId}/edit?error=duplicate_barcode`);
    }

    const { data: duplicateProductBarcode, error: productBarcodeError } =
      await auth.supabase
        .from("products")
        .select("id")
        .eq("barcode", barcode)
        .limit(1)
        .maybeSingle();

    if (productBarcodeError) {
      console.error("Product barcode lookup failed:", productBarcodeError);
      redirect(`/products/${productId}/variants/${variantId}/edit?error=lookup_failed`);
    }

    if (duplicateProductBarcode) {
      redirect(`/products/${productId}/variants/${variantId}/edit?error=duplicate_barcode`);
    }
  }

  const { error: updateError } = await auth.supabase
    .from("product_variants")
    .update({
      variant_name: variantName,
      barcode,
      updated_at: new Date().toISOString(),
    })
    .eq("id", variantId)
    .eq("product_id", productId);

  if (updateError) {
    console.error("Update product variant failed:", updateError);

    if (updateError.code === "23505") {
      redirect(`/products/${productId}/variants/${variantId}/edit?error=duplicate`);
    }

    redirect(`/products/${productId}/variants/${variantId}/edit?error=save_failed`);
  }

  revalidatePath(`/products/${productId}`);
  revalidatePath(`/products/${productId}/variants`);
  revalidatePath(`/products/${productId}/variants/${variantId}`);
  revalidatePath(`/products/${productId}/variants/${variantId}/edit`);

  redirect(`/products/${productId}/variants/${variantId}?updated=1`);
}

export async function toggleProductVariantStatus(formData: FormData) {
  const auth = await getAuthorizationContext("master.update");

  if (!auth.user) redirect("/login");
  if (!auth.authorized) redirect("/products?error=forbidden");

  const productId = String(formData.get("product_id") ?? "").trim();
  const variantId = String(formData.get("variant_id") ?? "").trim();

  if (!UUID_REGEX.test(productId) || !UUID_REGEX.test(variantId)) {
    redirect("/products?error=invalid_id");
  }

  const { data: variant, error: lookupError } = await auth.supabase
    .from("product_variants")
    .select("id, product_id, is_active")
    .eq("id", variantId)
    .eq("product_id", productId)
    .maybeSingle();

  if (lookupError) {
    console.error("Variant status lookup failed:", lookupError);
    redirect(`/products/${productId}/variants/${variantId}?error=lookup_failed`);
  }

  if (!variant) redirect("/products?error=not_found");

  const newStatus = !variant.is_active;

  const { data: updatedVariant, error: updateError } = await auth.supabase
    .from("product_variants")
    .update({
      is_active: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", variantId)
    .eq("product_id", productId)
    .eq("is_active", variant.is_active)
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error("Toggle variant status failed:", updateError);
    redirect(`/products/${productId}/variants/${variantId}?error=status_update_failed`);
  }

  if (!updatedVariant) {
    redirect(`/products/${productId}/variants/${variantId}?error=status_conflict`);
  }

  revalidatePath(`/products/${productId}`);
  revalidatePath(`/products/${productId}/variants`);
  revalidatePath(`/products/${productId}/variants/${variantId}`);
  revalidatePath(`/products/${productId}/variants/${variantId}/edit`);

  redirect(
    `/products/${productId}/variants/${variantId}?status=${
      newStatus ? "activated" : "deactivated"
    }`
  );
}
