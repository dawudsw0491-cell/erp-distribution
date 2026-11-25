
"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import { createBrandRecord } from "@/lib/master-data/brands";
import { MAIN_PRODUCT_CATEGORIES } from "@/lib/master-data/categories";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;



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

function normalizeProductName(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function getProductType(value: FormDataEntryValue | null) {
  return String(value ?? "").trim().toLowerCase();
}

function getTrackingType(value: FormDataEntryValue | null) {
  return String(value ?? "").trim().toLowerCase();
}

function getMinimumStock(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "0").trim();

  if (!normalized) return 0;

  return Number(normalized);
}

/* =========================================================
   CATEGORY MASTER
========================================================= */

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

  if (
    !MAIN_PRODUCT_CATEGORIES.includes(
      categoryName as (typeof MAIN_PRODUCT_CATEGORIES)[number]
    )
  ) {
    return {
      success: false,
      error:
        "Kategori utama harus menggunakan salah satu dari enam kategori resmi.",
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

/* =========================================================
   BRAND MASTER
========================================================= */

export async function createBrand(
  input: string
): Promise<CreateMasterResult> {
  return createBrandRecord(input, [
    "/products/new",
    "/products",
    "/product-models",
    "/product-models/new",
  ]);
}

/**
 * Create Product Model inline from the consolidated Product Management workspace.
 */
export async function createProductModelInline(input: {
  brandId: string;
  modelCode: string;
  modelName: string;
}): Promise<CreateMasterResult> {
  const auth = await getAuthorizationContext("master.create");

  if (!auth.user) {
    return { success: false, error: "Sesi login telah berakhir. Silakan login kembali." };
  }
  if (!auth.authorized) {
    return { success: false, error: "Anda tidak memiliki izin membuat Product Model." };
  }

  const brandId = input.brandId.trim();
  const modelCode = normalizeMasterName(input.modelCode);
  const modelName = normalizeMasterName(input.modelName);

  if (!UUID_REGEX.test(brandId)) {
    return { success: false, error: "Brand wajib dipilih terlebih dahulu." };
  }
  if (!modelCode || !modelName) {
    return { success: false, error: "Kode dan nama Product Model wajib diisi." };
  }
  if (modelCode.length > 50 || modelName.length > 150 || !/^[A-Z0-9_-]+$/.test(modelCode)) {
    return { success: false, error: "Format kode atau nama Product Model tidak valid." };
  }

  const { data: brand, error: brandError } = await auth.supabase
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .eq("is_active", true)
    .maybeSingle();

  if (brandError || !brand) {
    return { success: false, error: "Brand tidak ditemukan atau tidak aktif." };
  }

  const { data: existingCode, error: codeError } = await auth.supabase
    .from("product_models")
    .select("id")
    .eq("brand_id", brandId)
    .ilike("model_code", modelCode)
    .maybeSingle();

  if (codeError) {
    console.error("Product Model code lookup failed:", codeError);
    return { success: false, error: "Gagal memeriksa kode Product Model." };
  }
  if (existingCode) {
    return { success: false, error: "Kode Product Model sudah digunakan pada Brand ini." };
  }

  const { data: existingName, error: nameError } = await auth.supabase
    .from("product_models")
    .select("id")
    .eq("brand_id", brandId)
    .ilike("model_name", modelName)
    .maybeSingle();

  if (nameError) {
    console.error("Product Model name lookup failed:", nameError);
    return { success: false, error: "Gagal memeriksa nama Product Model." };
  }
  if (existingName) {
    return { success: false, error: "Nama Product Model sudah digunakan pada Brand ini." };
  }

  const { data, error } = await auth.supabase
    .from("product_models")
    .insert({
      brand_id: brandId,
      model_code: modelCode,
      model_name: modelName,
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Create Product Model inline failed:", error);
    return { success: false, error: "Product Model gagal disimpan." };
  }

  revalidatePath("/products");
  revalidatePath("/products/new");
  return { success: true, id: data.id, name: modelName };
}

/* =========================================================
   PRODUCT MASTER - CREATE
========================================================= */

export async function createProduct(formData: FormData) {
  const auth = await getAuthorizationContext("master.create");

  if (!auth.user) redirect("/login");
  if (!auth.authorized) redirect("/products?error=forbidden");

  const productName = normalizeProductName(
    formData.get("product_name")
  );

  const barcode =
    String(formData.get("barcode") ?? "").trim() || null;

  const productType = getProductType(
    formData.get("product_type") ?? "goods"
  );

  let trackingType = getTrackingType(
    formData.get("tracking_type") ?? "quantity"
  );

  const unit = String(formData.get("unit") ?? "Unit").trim();
  const description =
    String(formData.get("description") ?? "").trim() || null;

  let categoryId = getOptionalUuid(formData.get("category_id"));

  let productCondition = getProductCondition(
    formData.get("product_condition")
  );

  const brandId = getOptionalUuid(formData.get("brand_id"));
  const modelId = getOptionalUuid(formData.get("model_id"));

  let minimumStock = getMinimumStock(
    formData.get("minimum_stock")
  );

  if (!productName || !unit) {
    redirect("/products/new?error=required");
  }

  if (productName.length > 255 || unit.length > 50) {
    redirect("/products/new?error=invalid_length");
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

  if (
    categoryId === undefined ||
    brandId === undefined ||
    modelId === undefined
  ) {
    redirect("/products/new?error=invalid_reference");
  }

  if (productType === "service") {
    // Layanan tidak memiliki klasifikasi persediaan barang.
    categoryId = null;
    productCondition = null;
    trackingType = "quantity";
    minimumStock = 0;
  } else {
    if (productCondition === undefined) {
      redirect("/products/new?error=invalid_condition");
    }

    if (productCondition === null) {
      redirect("/products/new?error=condition_required");
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
      !MAIN_PRODUCT_CATEGORIES.includes(
        category.category_name as (typeof MAIN_PRODUCT_CATEGORIES)[number]
      )
    ) {
      redirect("/products/new?error=invalid_category");
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

  if (modelId) {
    const { data: model, error } = await auth.supabase
      .from("product_models")
      .select("id, brand_id")
      .eq("id", modelId)
      .eq("is_active", true)
      .maybeSingle();

    if (error || !model || model.brand_id !== brandId) {
      redirect("/products/new?error=invalid_model");
    }
  }

  let variants: Array<{
    variant_name: string; barcode: string | null; ram: string; rom: string; color: string; warranty: string;
  }>;
  try {
    const parsed: unknown = JSON.parse(String(formData.get("variants_json") ?? "[]"));
    if (!Array.isArray(parsed)) throw new Error("Invalid variants payload");
    variants = parsed.map((item: unknown) => {
      if (!item || typeof item !== "object") throw new Error("Invalid variant");
      const row = item as Record<string, unknown>;
      const network = String(row.network ?? "").trim().toUpperCase();
      const ram = String(row.ram ?? "").trim();
      const rom = String(row.rom ?? "").trim();
      const color = String(row.color ?? "").trim();
      const warranty = String(row.warranty ?? "").trim();
      // A variant is identified by its actual network + RAM + ROM + color
      // combination. Network alone is not unique (e.g. multiple 5G capacities).
      const variantName = [network, ram, rom, color]
        .filter(Boolean)
        .join(" / ")
        .toUpperCase();
      return {
        variant_name: variantName,
        barcode: String(row.barcode ?? "").trim() || null,
        ram, rom, color, warranty,
      };
    });
  } catch { redirect("/products/new?error=invalid_variants"); }
  if (productType === "goods" && (variants.length < 1 || variants.length > 100)) redirect("/products/new?error=variant_required");
  if (productType === "service" && variants.length > 0) redirect("/products/new?error=service_variants");
  const variantCombinations = new Set<string>();
  const variantBarcodes = new Set<string>();
  for (const variant of variants) {
    const normalizedNetwork = variant.variant_name.toUpperCase();
    if (!["4G", "5G", "WIFI ONLY"].includes(normalizedNetwork)) redirect("/products/new?error=invalid_variants");
    const combination = [normalizedNetwork, variant.ram, variant.rom, variant.color].map((value) => value.trim().toLocaleLowerCase("id-ID")).join("|");
    if (variantCombinations.has(combination)) redirect("/products/new?error=invalid_variants");
    variantCombinations.add(combination);
    if (variant.barcode && (variant.barcode.length > 100 || variantBarcodes.has(variant.barcode))) redirect("/products/new?error=invalid_variants");
    if (variant.barcode) variantBarcodes.add(variant.barcode);
    if ([variant.ram, variant.rom, variant.color, variant.warranty].some((value) => value.length > 100)) redirect("/products/new?error=invalid_variants");
  }
  const productPayload = { barcode, product_name: productName, category_id: categoryId, product_subcategory_id: null, product_condition: productCondition, brand_id: brandId, model_id: productType === "goods" ? modelId : null, product_type: productType, tracking_type: trackingType, unit, description, minimum_stock: minimumStock };
  const { data, error } = await auth.supabase.rpc("create_product_with_variants", { p_product: productPayload, p_variants: variants });
  if (error || !data?.product_id) {
    console.error("Create product with variants failed:", error);
    if (error?.code === "23505") {
      const constraint = String(error.message ?? "");
      if (constraint.includes("uq_product_variant_name")) {
        redirect("/products/new?error=duplicate_variant");
      }
      if (constraint.includes("barcode")) {
        redirect("/products/new?error=duplicate_barcode");
      }
      redirect("/products/new?error=duplicate");
    }
    if (error?.code === "23503") redirect("/products/new?error=invalid_reference");
    if (error?.message?.toLowerCase().includes("permission")) redirect("/products/new?error=forbidden");
    redirect("/products/new?error=save_failed");
  }
  revalidatePath("/products");
  revalidatePath("/products/" + data.product_id);
  revalidatePath("/products/" + data.product_id + "/variants");
  redirect("/products?created=1&new=" + data.product_id);
}

/* =========================================================
   PRODUCT MASTER - UPDATE
========================================================= */

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
    .select("id, model_id")
    .eq("id", productId)
    .maybeSingle();

  if (lookupError || !existingProduct) {
    redirect("/products?error=not_found");
  }

  const editPath = `/products/${productId}/edit`;

  const productName = normalizeProductName(
    formData.get("product_name")
  );

  const barcode =
    String(formData.get("barcode") ?? "").trim() || null;

  const productType = getProductType(formData.get("product_type"));

  let trackingType = getTrackingType(
    formData.get("tracking_type")
  );

  const unit = String(formData.get("unit") ?? "").trim();

  const description =
    String(formData.get("description") ?? "").trim() || null;

  let categoryId = getOptionalUuid(formData.get("category_id"));

  let productCondition = getProductCondition(
    formData.get("product_condition")
  );

  const brandId = getOptionalUuid(formData.get("brand_id"));
  const modelId = getOptionalUuid(formData.get("model_id"));

  let minimumStock = getMinimumStock(
    formData.get("minimum_stock")
  );

  if (!productName || !unit) {
    redirect(`${editPath}?error=required`);
  }

  if (productName.length > 255 || unit.length > 50) {
    redirect(`${editPath}?error=invalid_length`);
  }

  if (barcode !== null && barcode.length > 255) {
    redirect(`${editPath}?error=invalid_barcode`);
  }

  if (productType !== "goods" && productType !== "service") {
    redirect(`${editPath}?error=invalid_type`);
  }

  if (!["quantity", "imei", "serial"].includes(trackingType)) {
    redirect(`${editPath}?error=invalid_tracking`);
  }

  if (!Number.isFinite(minimumStock) || minimumStock < 0) {
    redirect(`${editPath}?error=invalid_stock`);
  }

  if (
    categoryId === undefined ||
    brandId === undefined ||
    modelId === undefined
  ) {
    redirect(`${editPath}?error=invalid_reference`);
  }

  if (productType === "service") {
    // Aturan layanan harus konsisten saat create maupun update.
    categoryId = null;
    productCondition = null;
    trackingType = "quantity";
    minimumStock = 0;
  } else {
    if (productCondition === undefined) {
      redirect(`${editPath}?error=invalid_condition`);
    }

    if (productCondition === null) {
      redirect(`${editPath}?error=condition_required`);
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
      !MAIN_PRODUCT_CATEGORIES.includes(
        category.category_name as (typeof MAIN_PRODUCT_CATEGORIES)[number]
      )
    ) {
      redirect(`${editPath}?error=invalid_category`);
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
      redirect(`${editPath}?error=invalid_brand`);
    }
  }

  if (modelId) {
    const { data: model, error } = await auth.supabase
      .from("product_models")
      .select("id, brand_id")
      .eq("id", modelId)
      .eq("is_active", true)
      .maybeSingle();

    if (error || !model || model.brand_id !== brandId) {
      redirect(`${editPath}?error=invalid_model`);
    }
  }

  const { error } = await auth.supabase
    .from("products")
    .update({
      // SKU sengaja tidak disertakan.
      // Identitas SKU tidak boleh berubah setelah produk dibuat.
      barcode,
      product_name: productName,
      category_id: categoryId,
      product_subcategory_id: null,
      product_condition: productCondition,
      brand_id: brandId,
      model_id: productType === "goods" ? modelId : null,
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
      redirect(`${editPath}?error=duplicate`);
    }

    if (error.code === "23503") {
      redirect(`${editPath}?error=invalid_reference`);
    }

    redirect(`${editPath}?error=save_failed`);
  }

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  revalidatePath(editPath);

  redirect(`/products/${productId}?updated=1`);
}

/* =========================================================
   PRODUCT MASTER - ACTIVATE / DEACTIVATE
========================================================= */

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
    `/products/${productId}?status=${
      newStatus ? "activated" : "deactivated"
    }`
  );
}

/* =========================================================
   PRODUCT VARIANT SPECIFICATIONS
========================================================= */

const VARIANT_SPECIFICATION_CODES = ["RAM", "ROM", "COLOR", "WARRANTY"] as const;

async function saveVariantSpecifications(
  supabase: Awaited<ReturnType<typeof getAuthorizationContext>>["supabase"],
  productId: string,
  variantId: string,
  formData: FormData
) {
  const specifications = Object.fromEntries(
    VARIANT_SPECIFICATION_CODES.map((code) => [
      code,
      String(formData.get(`spec_${code}`) ?? ""),
    ])
  );

  const { error } = await supabase.rpc("save_product_variant_specifications", {
    p_product_id: productId,
    p_variant_id: variantId,
    p_specifications: specifications,
  });

  if (error) throw error;
}

/* =========================================================
   LEGACY PRODUCT VARIANT FUNCTIONS
   Dipertahankan sementara selama proses migrasi.
========================================================= */

export async function createProductVariant(formData: FormData) {
  const auth = await getAuthorizationContext("master.create");
  if (!auth.user) redirect("/login");
  if (!auth.authorized) redirect("/products?error=forbidden");

  const productId = String(formData.get("product_id") ?? "").trim();
  if (!UUID_REGEX.test(productId)) redirect("/products?error=invalid_id");

  const variantName = String(formData.get("variant_name") ?? "").trim().replace(/\\s+/g, " ");
  const barcode = String(formData.get("barcode") ?? "").trim() || null;
  if (!variantName) redirect(`/products/${productId}/variants/new?error=required`);
  if (variantName.length > 200) redirect(`/products/${productId}/variants/new?error=invalid_name`);
  if (barcode !== null && barcode.length > 100) redirect(`/products/${productId}/variants/new?error=invalid_barcode`);

  const specifications = {
    RAM: String(formData.get("spec_RAM") ?? "").trim(),
    ROM: String(formData.get("spec_ROM") ?? "").trim(),
    COLOR: String(formData.get("spec_COLOR") ?? "").trim(),
    WARRANTY: String(formData.get("spec_WARRANTY") ?? "").trim(),
  };
  if (Object.values(specifications).some((value) => value.length > 100)) {
    redirect(`/products/${productId}/variants/new?error=invalid_specification`);
  }

  const { data, error } = await auth.supabase.rpc("create_product_variant_with_specs", {
    p_product_id: productId,
    p_variant_name: variantName,
    p_barcode: barcode,
    p_specifications: specifications,
  });

  if (error || !data?.id) {
    console.error("Create product variant failed:", error);
    if (error?.code === "23505") redirect(`/products/${productId}/variants/new?error=duplicate`);
    if (error?.message?.toLowerCase().includes("permission")) redirect(`/products/${productId}/variants/new?error=forbidden`);
    if (error?.message?.toLowerCase().includes("barcode")) redirect(`/products/${productId}/variants/new?error=duplicate`);
    redirect(`/products/${productId}/variants/new?error=save_failed`);
  }

  revalidatePath(`/products/${productId}`);
  revalidatePath(`/products/${productId}/variants`);
  redirect(`/products/${productId}/variants?created=1&id=${data.id}`);
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
    redirect(
      `/products/${productId}/variants/${variantId}?error=lookup_failed`
    );
  }

  if (!existingVariant) {
    redirect("/products?error=not_found");
  }

  const variantName = String(formData.get("variant_name") ?? "")
    .trim()
    .replace(/\s+/g, " ");

  const barcode = String(formData.get("barcode") ?? "").trim() || null;

  if (!variantName) {
    redirect(
      `/products/${productId}/variants/${variantId}/edit?error=required`
    );
  }

  if (variantName.length > 200) {
    redirect(
      `/products/${productId}/variants/${variantId}/edit?error=invalid_name`
    );
  }

  if (barcode !== null && barcode.length > 100) {
    redirect(
      `/products/${productId}/variants/${variantId}/edit?error=invalid_barcode`
    );
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
    redirect(
      `/products/${productId}/variants/${variantId}/edit?error=lookup_failed`
    );
  }

  if (duplicateName) {
    redirect(
      `/products/${productId}/variants/${variantId}/edit?error=duplicate_name`
    );
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
      redirect(
        `/products/${productId}/variants/${variantId}/edit?error=lookup_failed`
      );
    }

    if (duplicateBarcode) {
      redirect(
        `/products/${productId}/variants/${variantId}/edit?error=duplicate_barcode`
      );
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
      redirect(
        `/products/${productId}/variants/${variantId}/edit?error=lookup_failed`
      );
    }

    if (duplicateProductBarcode) {
      redirect(
        `/products/${productId}/variants/${variantId}/edit?error=duplicate_barcode`
      );
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
      redirect(
        `/products/${productId}/variants/${variantId}/edit?error=duplicate`
      );
    }

    redirect(
      `/products/${productId}/variants/${variantId}/edit?error=save_failed`
    );
  }

  try {
    await saveVariantSpecifications(
      auth.supabase,
      productId,
      variantId,
      formData
    );
  } catch (specificationError) {
    console.error("Update variant specifications failed:", specificationError);
    redirect(
      `/products/${productId}/variants/${variantId}/edit?error=specifications_save_failed`
    );
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
    redirect(
      `/products/${productId}/variants/${variantId}?error=lookup_failed`
    );
  }

  if (!variant) {
    redirect("/products?error=not_found");
  }

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
    redirect(
      `/products/${productId}/variants/${variantId}?error=status_update_failed`
    );
  }

  if (!updatedVariant) {
    redirect(
      `/products/${productId}/variants/${variantId}?error=status_conflict`
    );
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
