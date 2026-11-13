
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

type ActionResult =
  | {
      success: true;
      message: string;
      deletedProducts?: number;
      deletedVariants?: number;
    }
  | {
      success: false;
      error: string;
    };

type PreviewValue = {
  id: string;
  code: string;
  name: string;
  shared: boolean;
};

type PreviewAttribute = {
  id: string;
  code: string;
  name: string;
  shared: boolean;
  values: PreviewValue[];
};

type PreviewVariant = {
  id: string;
  productId: string;
  productName: string;
  name: string;
  attributes: string[];
};

type PreviewProduct = {
  id: string;
  name: string;
};

type PreviewBlocker = {
  name: string;
  count: number;
};

type ProductModelDeletionPreview = {
  success: true;
  model: {
    id: string;
    code: string;
    name: string;
  };
  products: PreviewProduct[];
  attributes: PreviewAttribute[];
  variants: PreviewVariant[];
  counts: {
    products: number;
    attributes: number;
    values: number;
    variants: number;
  };
  blockers: PreviewBlocker[];
  canDelete: boolean;
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

function getErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "Terjadi kesalahan saat memproses data.";
}

function getUniqueIds(ids: string[]) {
  return [...new Set(ids.filter(Boolean))];
}

/**
 * CREATE PRODUCT MODEL
 */
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

/**
 * UPDATE PRODUCT MODEL
 */
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

/**
 * CREATE BRAND FOR PRODUCT MODEL
 */
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

/**
 * GET PRODUCT MODEL DELETION PREVIEW
 *
 * Mengambil nama aktual:
 * - Master Product
 * - Product Attributes
 * - Attribute Values
 * - Product Variants
 * - Referensi transaksi dan persediaan
 *
 * Master Attributes dan Attribute Values tidak dihapus
 * otomatis karena merupakan master data global.
 */
export async function getProductModelDeletionPreview(
  modelIdInput: string
): Promise<
  ProductModelDeletionPreview | {
    success: false;
    error: string;
  }
> {
  const modelId = String(modelIdInput ?? "").trim();

  if (!isValidUUID(modelId)) {
    return {
      success: false,
      error: "ID Product Model tidak valid.",
    };
  }

  const auth = await getAuthorizationContext("master.delete");

  if (!auth.user) {
    return {
      success: false,
      error: "Sesi login berakhir. Silakan login kembali.",
    };
  }

  if (!auth.authorized) {
    return {
      success: false,
      error: "Anda tidak memiliki permission untuk menghapus Product Model.",
    };
  }

  const { data: model, error: modelError } = await auth.supabase
    .from("product_models")
    .select("id, model_code, model_name")
    .eq("id", modelId)
    .maybeSingle();

  if (modelError || !model) {
    console.error("Product Model preview lookup failed:", modelError);

    return {
      success: false,
      error: "Product Model tidak ditemukan atau gagal dibaca.",
    };
  }

  const { data: rawProducts, error: productsError } =
    await auth.supabase
      .from("products")
      .select("id, product_name")
      .eq("model_id", modelId);

  if (productsError) {
    console.error("Product preview lookup failed:", productsError);

    return {
      success: false,
      error: "Gagal mengambil daftar Master Product.",
    };
  }

  const products = (rawProducts ?? []) as {
    id: string;
    product_name: string;
  }[];

  const productIds = products.map((item) => item.id);

  if (productIds.length === 0) {
    return {
      success: true,
      model: {
        id: model.id,
        code: model.model_code,
        name: model.model_name,
      },
      products: [],
      attributes: [],
      variants: [],
      counts: {
        products: 0,
        attributes: 0,
        values: 0,
        variants: 0,
      },
      blockers: [],
      canDelete: true,
    };
  }

  const [assignmentsResult, variantsResult] = await Promise.all([
    auth.supabase
      .from("product_attribute_assignments")
      .select("product_id, attribute_id")
      .in("product_id", productIds),

    auth.supabase
      .from("product_variants")
      .select("id, product_id, variant_name")
      .in("product_id", productIds),
  ]);

  if (assignmentsResult.error || variantsResult.error) {
    console.error(
      "Product Model child lookup failed:",
      assignmentsResult.error ?? variantsResult.error
    );

    return {
      success: false,
      error: "Gagal mengambil data atribut atau varian produk.",
    };
  }

  const assignments = (assignmentsResult.data ?? []) as {
    product_id: string;
    attribute_id: string;
  }[];

  const variants = (variantsResult.data ?? []) as {
    id: string;
    product_id: string;
    variant_name: string | null;
  }[];

  const attributeIds = getUniqueIds(
    assignments.map((item) => item.attribute_id)
  );

  const variantIds = variants.map((item) => item.id);

  const [attributesResult, variantValuesResult] = await Promise.all([
    attributeIds.length
      ? auth.supabase
          .from("product_attributes")
          .select("id, attribute_code, attribute_name")
          .in("id", attributeIds)
      : Promise.resolve({ data: [], error: null }),

    variantIds.length
      ? auth.supabase
          .from("product_variant_attribute_values")
          .select("product_variant_id, attribute_id, attribute_value_id")
          .in("product_variant_id", variantIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (attributesResult.error || variantValuesResult.error) {
    console.error(
      "Product Model attribute lookup failed:",
      attributesResult.error ?? variantValuesResult.error
    );

    return {
      success: false,
      error: "Gagal mengambil rincian Product Attributes.",
    };
  }

  const attributes = (attributesResult.data ?? []) as {
    id: string;
    attribute_code: string;
    attribute_name: string;
  }[];

  const variantValues = (variantValuesResult.data ?? []) as {
    product_variant_id: string;
    attribute_id: string;
    attribute_value_id: string;
  }[];

  const [allAssignmentsResult, valuesResult] = await Promise.all([
    attributeIds.length
      ? auth.supabase
          .from("product_attribute_assignments")
          .select("product_id, attribute_id")
          .in("attribute_id", attributeIds)
      : Promise.resolve({ data: [], error: null }),

    attributeIds.length
      ? auth.supabase
          .from("product_attribute_values")
          .select("id, attribute_id, value_code, value_name")
          .in("attribute_id", attributeIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (allAssignmentsResult.error || valuesResult.error) {
    console.error(
      "Product Model attribute value lookup failed:",
      allAssignmentsResult.error ?? valuesResult.error
    );

    return {
      success: false,
      error: "Gagal mengambil nilai atribut.",
    };
  }

  const allAssignments = (allAssignmentsResult.data ?? []) as {
    product_id: string;
    attribute_id: string;
  }[];

  const values = (valuesResult.data ?? []) as {
    id: string;
    attribute_id: string;
    value_code: string;
    value_name: string;
  }[];

  const attributeValueIds = values.map((item) => item.id);
  const sharedValueIds = new Set<string>();

  if (attributeValueIds.length && variantIds.length) {
    const { data: allValueUsage, error: valueUsageError } =
      await auth.supabase
        .from("product_variant_attribute_values")
        .select("attribute_value_id, product_variant_id")
        .in("attribute_value_id", attributeValueIds);

    if (valueUsageError) {
      console.error("Attribute value usage lookup failed:", valueUsageError);

      return {
        success: false,
        error: "Gagal memeriksa penggunaan Attribute Values.",
      };
    }

    const usages = (allValueUsage ?? []) as {
      attribute_value_id: string;
      product_variant_id: string;
    }[];

    for (const usage of usages) {
      if (!variantIds.includes(usage.product_variant_id)) {
        sharedValueIds.add(usage.attribute_value_id);
      }
    }
  }

  const attributePreview: PreviewAttribute[] = attributes.map(
    (attribute) => {
      const attributeAssignments = allAssignments.filter(
        (item) => item.attribute_id === attribute.id
      );

      const isAttributeShared = attributeAssignments.some(
        (item) => !productIds.includes(item.product_id)
      );

      const attributeValues = values
        .filter((value) => value.attribute_id === attribute.id)
        .map((value) => ({
          id: value.id,
          code: value.value_code,
          name: value.value_name,
          shared: sharedValueIds.has(value.id),
        }));

      return {
        id: attribute.id,
        code: attribute.attribute_code,
        name: attribute.attribute_name,
        shared: isAttributeShared,
        values: attributeValues,
      };
    }
  );

  const productNameMap = new Map(
    products.map((item) => [item.id, item.product_name])
  );

  const valueNameMap = new Map(
    values.map((item) => [item.id, item.value_name])
  );

  const attributeNameMap = new Map(
    attributes.map((item) => [item.id, item.attribute_name])
  );

  const variantsPreview: PreviewVariant[] = variants.map((variant) => {
    const variantAttributes = variantValues
      .filter((item) => item.product_variant_id === variant.id)
      .map((item) => {
        const attributeName =
          attributeNameMap.get(item.attribute_id) ?? "Attribute";

        const valueName =
          valueNameMap.get(item.attribute_value_id) ?? "Value";

        return `${attributeName}: ${valueName}`;
      });

    return {
      id: variant.id,
      productId: variant.product_id,
      productName: productNameMap.get(variant.product_id) ?? "Product",
      name:
        variant.variant_name?.trim() ||
        variantAttributes.join(" / ") ||
        "Tanpa nama varian",
      attributes: variantAttributes,
    };
  });

  const blockers: PreviewBlocker[] = [];

  if (variantIds.length > 0) {
    const blockerChecks = [
      {
        table: "inventory_balances" as const,
        label: "Inventory Balances",
      },
      {
        table: "inventory_movements" as const,
        label: "Inventory Movements",
      },
      {
        table: "inventory_valuation_logs" as const,
        label: "Inventory Valuation Logs",
      },
      {
        table: "product_units" as const,
        label: "Product Units",
      },
      {
        table: "purchase_order_items" as const,
        label: "Purchase Order Items",
      },
      {
        table: "stock_opname_items" as const,
        label: "Stock Opname Items",
      },
    ];

    const blockerResults = await Promise.all(
      blockerChecks.map(async (item) => {
        const result = await auth.supabase
          .from(item.table)
          .select("id", { count: "exact", head: true })
          .in("product_variant_id", variantIds);

        return {
          name: item.label,
          count: result.count ?? 0,
          error: result.error,
        };
      })
    );

    for (const result of blockerResults) {
      if (result.error) {
        console.error(
          `Deletion blocker lookup failed (${result.name}):`,
          result.error
        );

        return {
          success: false,
          error: `Gagal memeriksa dependensi ${result.name}.`,
        };
      }

      if (result.count > 0) {
        blockers.push({
          name: result.name,
          count: result.count,
        });
      }
    }
  }

  const totalValues = getUniqueIds(
    attributePreview.flatMap((attribute) =>
      attribute.values.map((value) => value.id)
    )
  ).length;

  return {
    success: true,
    model: {
      id: model.id,
      code: model.model_code,
      name: model.model_name,
    },
    products: products.map((item) => ({
      id: item.id,
      name: item.product_name,
    })),
    attributes: attributePreview,
    variants: variantsPreview,
    counts: {
      products: products.length,
      attributes: attributePreview.length,
      values: totalValues,
      variants: variants.length,
    },
    blockers,
    canDelete: blockers.length === 0,
  };
}

/**
 * DELETE PRODUCT MODEL
 *
 * Penghapusan dilakukan melalui PostgreSQL RPC
 * dalam satu transaksi database.
 *
 * Setelah RPC, sistem memeriksa kembali keberadaan
 * Product Model untuk memastikan penghapusan benar-benar terjadi.
 */
export async function deleteProductModel(
  modelIdInput: string,
  deleteMasterProducts: boolean
): Promise<ActionResult> {
  const modelId = String(modelIdInput ?? "").trim();

  if (!isValidUUID(modelId)) {
    return {
      success: false,
      error: "ID Product Model tidak valid.",
    };
  }

  if (typeof deleteMasterProducts !== "boolean") {
    return {
      success: false,
      error: "Persetujuan penghapusan Master Product tidak valid.",
    };
  }

  const auth = await getAuthorizationContext("master.delete");

  if (!auth.user) {
    return {
      success: false,
      error: "Sesi login berakhir. Silakan login kembali.",
    };
  }

  if (!auth.authorized) {
    return {
      success: false,
      error: "Anda tidak memiliki permission untuk menghapus Product Model.",
    };
  }

  try {
    // 1. Periksa kondisi dan dependensi sebelum penghapusan.
    const preview = await getProductModelDeletionPreview(modelId);

    if (!preview.success) {
      return {
        success: false,
        error: preview.error,
      };
    }

    // 2. Wajib ada persetujuan jika Master Product akan dihapus.
    if (preview.products.length > 0 && !deleteMasterProducts) {
      return {
        success: false,
        error:
          "Persetujuan penghapusan Master Product belum diberikan.",
      };
    }

    // 3. Jangan hapus jika masih ada referensi transaksi atau persediaan.
    if (!preview.canDelete) {
      const blockerText = preview.blockers
        .map((item) => `${item.name}: ${item.count}`)
        .join(", ");

      return {
        success: false,
        error: `Penghapusan diblokir karena masih terdapat referensi: ${blockerText}.`,
      };
    }

    // 4. Jalankan fungsi PostgreSQL.
    const { data, error } = await auth.supabase.rpc(
      "delete_product_model",
      {
        p_model_id: modelId,
        p_delete_master_products: deleteMasterProducts,
      }
    );

    if (error) {
      console.error("Delete Product Model RPC failed:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });

      return {
        success: false,
        error: [
          error.message,
          error.details,
          error.hint,
          error.code ? `Kode: ${error.code}` : null,
        ]
          .filter(Boolean)
          .join(" | "),
      };
    }

    // 5. Validasi respons RPC.
    const result = data as {
      success?: boolean;
      message?: string;
      deleted_products?: number;
      deleted_variants?: number;
      error?: string;
    } | null;

    if (!result || result.success !== true) {
      console.error("Delete Product Model RPC invalid response:", result);

      return {
        success: false,
        error:
          result?.error ||
          result?.message ||
          "Database tidak mengembalikan status penghapusan berhasil.",
      };
    }

    // 6. Verifikasi langsung apakah Product Model masih ada.
    const { data: remainingModel, error: verifyError } =
      await auth.supabase
        .from("product_models")
        .select("id, model_code, model_name")
        .eq("id", modelId)
        .maybeSingle();

    if (verifyError) {
      console.error("Verify Product Model deletion failed:", verifyError);

      return {
        success: false,
        error: `RPC selesai, tetapi verifikasi penghapusan gagal: ${verifyError.message}`,
      };
    }

    // 7. Jika masih ditemukan, jangan mengembalikan status sukses.
    if (remainingModel) {
      console.error(
        "Product Model still exists after successful RPC:",
        remainingModel
      );

      return {
        success: false,
        error:
          "RPC mengembalikan status berhasil, tetapi Product Model masih ditemukan di database. Periksa kebijakan RLS dan fungsi SQL delete_product_model.",
      };
    }

    // 8. Perbarui cache halaman setelah penghapusan terverifikasi.
    revalidatePath("/product-models");
    revalidatePath("/products");
    revalidatePath("/product-attributes");
    revalidatePath("/product-variants");

    // 9. Kembalikan status sukses.
    return {
      success: true,
      message: "Product Model berhasil dihapus dan telah diverifikasi.",
      deletedProducts: result.deleted_products ?? 0,
      deletedVariants: result.deleted_variants ?? 0,
    };
  } catch (error) {
    console.error("Delete Product Model unexpected error:", error);

    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
}

/**
 * TOGGLE PRODUCT MODEL STATUS
 */
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
