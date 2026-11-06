
"use server";

import { revalidatePath } from "next/cache";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export type ProductActionResult = {
  success: boolean;
  message: string;
  data?: unknown;
};

export type AvailableProduct = {
  id: string;
  sku: string;
  barcode: string | null;
  product_name: string;
  product_type: string;
  tracking_type: string;
  unit: string;
  is_active: boolean;
};

export type CreateSupplierProductInput = {
  supplierId: string;
  productId: string;
  supplierProductCode?: string | null;
  purchasePrice: number | null;
  minimumOrderQuantity: number;
  leadTimeDays: number;
  isPreferred: boolean;
  isActive: boolean;
  notes?: string | null;
};

export type UpdateSupplierProductInput = {
  relationId: string;
  supplierId: string;
  supplierProductCode?: string | null;
  purchasePrice: number | null;
  minimumOrderQuantity: number;
  leadTimeDays: number;
  isPreferred: boolean;
  isActive: boolean;
  notes?: string | null;
};

export type DeleteSupplierProductInput = {
  relationId: string;
  supplierId: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isValidMappingInput(input: {
  supplierProductCode?: string | null;
  purchasePrice: number | null;
  minimumOrderQuantity: number;
  leadTimeDays: number;
  isPreferred: boolean;
  isActive: boolean;
  notes?: string | null;
}): boolean {
  if (
    typeof input.minimumOrderQuantity !== "number" ||
    !Number.isFinite(input.minimumOrderQuantity) ||
    input.minimumOrderQuantity <= 0
  ) {
    return false;
  }

  if (
    typeof input.leadTimeDays !== "number" ||
    !Number.isInteger(input.leadTimeDays) ||
    input.leadTimeDays < 0
  ) {
    return false;
  }

  if (
    input.purchasePrice !== null &&
    (typeof input.purchasePrice !== "number" ||
      !Number.isFinite(input.purchasePrice) ||
      input.purchasePrice < 0)
  ) {
    return false;
  }

  if (
    typeof input.isPreferred !== "boolean" ||
    typeof input.isActive !== "boolean"
  ) {
    return false;
  }

  if (
    input.supplierProductCode != null &&
    (typeof input.supplierProductCode !== "string" ||
      input.supplierProductCode.length > 100)
  ) {
    return false;
  }

  if (
    input.notes != null &&
    (typeof input.notes !== "string" || input.notes.length > 2000)
  ) {
    return false;
  }

  if (input.isPreferred && !input.isActive) {
    return false;
  }

  return true;
}

async function hasMasterViewPermission(
  supabase: Awaited<
    ReturnType<typeof getAuthorizationContext>
  >["supabase"]
): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_permission", {
    required_permission: "master.view",
  });

  return !error && data === true;
}

function revalidateSupplierPages(supplierId: string): void {
  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${supplierId}`);
}

/**
 * Mencari produk aktif berdasarkan SKU, nama produk, atau barcode.
 */
export async function searchAvailableProductsAction(
  keyword: string
): Promise<ProductActionResult> {
  const auth = await getAuthorizationContext("suppliers.create");

  if (!auth.user) {
    return {
      success: false,
      message: "Silakan login kembali.",
    };
  }

  if (!auth.authorized) {
    return {
      success: false,
      message: "Anda tidak memiliki izin mencari produk supplier.",
    };
  }

  if (!(await hasMasterViewPermission(auth.supabase))) {
    return {
      success: false,
      message: "Anda tidak memiliki izin melihat Master Produk.",
    };
  }

  if (typeof keyword !== "string") {
    return {
      success: false,
      message: "Kata pencarian tidak valid.",
    };
  }

  const searchKeyword = keyword.trim().slice(0, 80);

  if (searchKeyword.length < 2) {
    return {
      success: true,
      message: "Masukkan minimal 2 karakter untuk mencari produk.",
      data: [],
    };
  }

  // Menghindari karakter khusus yang dapat mengganggu filter PostgREST.
  const safeKeyword = searchKeyword
    .replace(/[,%()._*\\]/g, " ")
    .trim();

  if (safeKeyword.length < 2) {
    return {
      success: true,
      message: "Kata pencarian tidak valid.",
      data: [],
    };
  }

  const pattern = `%${safeKeyword}%`;

  const { data, error } = await auth.supabase
    .from("products")
    .select(
      "id, sku, barcode, product_name, product_type, tracking_type, unit, is_active"
    )
    .eq("is_active", true)
    .or(
      `sku.ilike.${pattern},product_name.ilike.${pattern},barcode.ilike.${pattern}`
    )
    .order("product_name", { ascending: true })
    .limit(50);

  if (error) {
    console.error("Gagal mencari produk supplier:", error);

    return {
      success: false,
      message: "Gagal mencari produk. Silakan coba kembali.",
    };
  }

  return {
    success: true,
    message: "Pencarian produk berhasil.",
    data: (data ?? []) as AvailableProduct[],
  };
}

/**
 * Mengambil daftar produk yang sudah terhubung dengan supplier.
 */
export async function getSupplierProductsAction(
  supplierId: string
): Promise<ProductActionResult> {
  if (!isValidUUID(supplierId)) {
    return {
      success: false,
      message: "Identitas supplier tidak valid.",
    };
  }

  const auth = await getAuthorizationContext("suppliers.view");

  if (!auth.user) {
    return {
      success: false,
      message: "Silakan login kembali.",
    };
  }

  if (!auth.authorized) {
    return {
      success: false,
      message: "Anda tidak memiliki izin melihat data supplier.",
    };
  }

  if (!(await hasMasterViewPermission(auth.supabase))) {
    return {
      success: false,
      message: "Anda tidak memiliki izin melihat Master Produk.",
    };
  }

  const { data, error } = await auth.supabase
    .from("product_suppliers")
    .select(`
      id,
      supplier_id,
      product_id,
      supplier_product_code,
      purchase_price,
      minimum_order_quantity,
      lead_time_days,
      is_preferred,
      is_active,
      notes,
      created_at,
      updated_at,
      products (
        id,
        sku,
        barcode,
        product_name,
        product_type,
        tracking_type,
        unit,
        is_active
      )
    `)
    .eq("supplier_id", supplierId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Gagal mengambil produk supplier:", error);

    return {
      success: false,
      message: "Gagal mengambil daftar produk supplier.",
    };
  }

  return {
    success: true,
    message: "Daftar produk supplier berhasil diambil.",
    data,
  };
}

/**
 * Membuat relasi produk dengan supplier melalui RPC.
 */
export async function createSupplierProductAction(
  input: CreateSupplierProductInput
): Promise<ProductActionResult> {
  if (
    !input ||
    !isValidUUID(input.supplierId) ||
    !isValidUUID(input.productId)
  ) {
    return {
      success: false,
      message: "Identitas supplier atau produk tidak valid.",
    };
  }

  if (!isValidMappingInput(input)) {
    return {
      success: false,
      message: "Data relasi produk supplier tidak valid.",
    };
  }

  const auth = await getAuthorizationContext("suppliers.create");

  if (!auth.user) {
    return {
      success: false,
      message: "Silakan login kembali.",
    };
  }

  if (!auth.authorized) {
    return {
      success: false,
      message: "Anda tidak memiliki izin menambahkan produk supplier.",
    };
  }

  if (!(await hasMasterViewPermission(auth.supabase))) {
    return {
      success: false,
      message: "Anda tidak memiliki izin melihat Master Produk.",
    };
  }

  const { data, error } = await auth.supabase.rpc(
    "create_product_supplier",
    {
      p_supplier_id: input.supplierId,
      p_product_id: input.productId,
      p_supplier_product_code: input.supplierProductCode?.trim() || null,
      p_purchase_price: input.purchasePrice,
      p_minimum_order_quantity: input.minimumOrderQuantity,
      p_lead_time_days: input.leadTimeDays,
      p_is_preferred: input.isPreferred,
      p_is_active: input.isActive,
      p_notes: input.notes?.trim() || null,
    }
  );

  if (error) {
    console.error("Gagal membuat relasi produk supplier:", error);

    return {
      success: false,
      message:
        "Gagal menghubungkan produk dengan supplier. Periksa data dan hak akses Anda.",
    };
  }

  revalidateSupplierPages(input.supplierId);

  return {
    success: true,
    message: "Produk berhasil dihubungkan dengan supplier.",
    data,
  };
}

/**
 * Memperbarui relasi produk dengan supplier melalui RPC.
 */
export async function updateSupplierProductAction(
  input: UpdateSupplierProductInput
): Promise<ProductActionResult> {
  if (
    !input ||
    !isValidUUID(input.relationId) ||
    !isValidUUID(input.supplierId)
  ) {
    return {
      success: false,
      message: "Identitas relasi atau supplier tidak valid.",
    };
  }

  if (!isValidMappingInput(input)) {
    return {
      success: false,
      message: "Data perubahan relasi produk supplier tidak valid.",
    };
  }

  const auth = await getAuthorizationContext("suppliers.update");

  if (!auth.user) {
    return {
      success: false,
      message: "Silakan login kembali.",
    };
  }

  if (!auth.authorized) {
    return {
      success: false,
      message: "Anda tidak memiliki izin mengubah produk supplier.",
    };
  }

  if (!(await hasMasterViewPermission(auth.supabase))) {
    return {
      success: false,
      message: "Anda tidak memiliki izin melihat Master Produk.",
    };
  }

  const { data, error } = await auth.supabase.rpc(
    "update_product_supplier",
    {
      p_relation_id: input.relationId,
      p_supplier_id: input.supplierId,
      p_supplier_product_code: input.supplierProductCode?.trim() || null,
      p_purchase_price: input.purchasePrice,
      p_minimum_order_quantity: input.minimumOrderQuantity,
      p_lead_time_days: input.leadTimeDays,
      p_is_preferred: input.isPreferred,
      p_is_active: input.isActive,
      p_notes: input.notes?.trim() || null,
    }
  );

  if (error) {
    console.error("Gagal memperbarui relasi produk supplier:", error);

    return {
      success: false,
      message:
        "Gagal memperbarui relasi produk supplier. Periksa data dan hak akses Anda.",
    };
  }

  revalidateSupplierPages(input.supplierId);

  return {
    success: true,
    message: "Relasi produk supplier berhasil diperbarui.",
    data,
  };
}

/**
 * Menghapus relasi produk dengan supplier melalui RPC.
 */
export async function deleteSupplierProductAction(
  input: DeleteSupplierProductInput
): Promise<ProductActionResult> {
  if (
    !input ||
    !isValidUUID(input.relationId) ||
    !isValidUUID(input.supplierId)
  ) {
    return {
      success: false,
      message: "Identitas relasi atau supplier tidak valid.",
    };
  }

  const auth = await getAuthorizationContext("suppliers.update");

  if (!auth.user) {
    return {
      success: false,
      message: "Silakan login kembali.",
    };
  }

  if (!auth.authorized) {
    return {
      success: false,
      message: "Anda tidak memiliki izin menghapus relasi produk supplier.",
    };
  }

  if (!(await hasMasterViewPermission(auth.supabase))) {
    return {
      success: false,
      message: "Anda tidak memiliki izin melihat Master Produk.",
    };
  }

  const { data, error } = await auth.supabase.rpc(
    "delete_product_supplier",
    {
      p_relation_id: input.relationId,
      p_supplier_id: input.supplierId,
    }
  );

  if (error) {
    console.error("Gagal menghapus relasi produk supplier:", error);

    return {
      success: false,
      message:
        "Gagal menghapus relasi produk supplier. Periksa data dan hak akses Anda.",
    };
  }

  revalidateSupplierPages(input.supplierId);

  return {
    success: true,
    message: "Relasi produk supplier berhasil dihapus.",
    data,
  };
}
