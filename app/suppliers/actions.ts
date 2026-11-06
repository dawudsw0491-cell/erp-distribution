
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export type CreateSupplierState = {
  error: string;
};

export type RegionLevel =
  | "province"
  | "regency"
  | "district"
  | "village";

export type RegionOption = {
  id: string;
  name: string;
};

export type RegionSearchResult = {
  data: RegionOption[];
  error: string;
};

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getOptionalString(
  formData: FormData,
  key: string
): string | null {
  return getString(formData, key) || null;
}

/**
 * Pencarian wilayah Indonesia secara bertingkat.
 */
export async function searchSupplierRegionsAction(
  level: RegionLevel,
  keyword: string,
  parentId: string
): Promise<RegionSearchResult> {
  const auth = await getAuthorizationContext("suppliers.create");

  if (!auth.user || !auth.authorized) {
    return {
      data: [],
      error: "Anda tidak memiliki izin untuk mencari data wilayah.",
    };
  }

  const searchKeyword = keyword.trim().slice(0, 80);
  const searchPattern = `%${searchKeyword}%`;

  if (level !== "province" && !parentId.trim()) {
    return {
      data: [],
      error: "Pilih wilayah induk terlebih dahulu.",
    };
  }

  if (level === "province") {
    const { data, error } = await auth.supabase
      .from("indonesia_provinces")
      .select("code, name")
      .eq("is_active", true)
      .ilike("name", searchPattern)
      .order("name", { ascending: true })
      .limit(50);

    if (error) {
      return { data: [], error: "Gagal mencari data provinsi." };
    }

    return {
      data: (data ?? []).map((item) => ({
        id: item.code,
        name: item.name,
      })),
      error: "",
    };
  }

  if (level === "regency") {
    const { data, error } = await auth.supabase
      .from("indonesia_regencies")
      .select("code, name")
      .eq("province_code", parentId)
      .eq("is_active", true)
      .ilike("name", searchPattern)
      .order("name", { ascending: true })
      .limit(50);

    if (error) {
      return { data: [], error: "Gagal mencari data kabupaten/kota." };
    }

    return {
      data: (data ?? []).map((item) => ({
        id: item.code,
        name: item.name,
      })),
      error: "",
    };
  }

  if (level === "district") {
    const { data, error } = await auth.supabase
      .from("indonesia_districts")
      .select("id, name")
      .eq("regency_id", parentId)
      .eq("is_active", true)
      .ilike("name", searchPattern)
      .order("name", { ascending: true })
      .limit(50);

    if (error) {
      return { data: [], error: "Gagal mencari data kecamatan." };
    }

    return {
      data: (data ?? []).map((item) => ({
        id: item.id,
        name: item.name,
      })),
      error: "",
    };
  }

  if (level === "village") {
    const { data, error } = await auth.supabase
      .from("indonesia_villages")
      .select("id, name")
      .eq("district_id", parentId)
      .eq("is_active", true)
      .ilike("name", searchPattern)
      .order("name", { ascending: true })
      .limit(50);

    if (error) {
      return { data: [], error: "Gagal mencari data desa/kelurahan." };
    }

    return {
      data: (data ?? []).map((item) => ({
        id: item.id,
        name: item.name,
      })),
      error: "",
    };
  }

  return {
    data: [],
    error: "Tingkat wilayah tidak valid.",
  };
}

/**
 * Membuat supplier dan alamat utama secara atomik.
 */
export async function createSupplierAction(
  _previousState: CreateSupplierState,
  formData: FormData
): Promise<CreateSupplierState> {
  const auth = await getAuthorizationContext("suppliers.create");

  if (!auth.user) redirect("/login");

  if (!auth.authorized) {
    return {
      error: "Anda tidak memiliki izin untuk menambahkan supplier.",
    };
  }

  const supplierName = getString(formData, "supplier_name");
  const supplierType = getString(formData, "supplier_type");

  const provinceCode = getString(formData, "province_code");
  const regencyCode = getString(formData, "regency_code");
  const districtId = getString(formData, "district_id");
  const villageId = getString(formData, "village_id");

  const address = getString(formData, "address");
  const postalCode = getString(formData, "postal_code");

  const paymentTermDaysRaw = getString(formData, "payment_term_days");
  const creditLimitRaw = getString(formData, "credit_limit");

  const currencyCode = (
    getString(formData, "currency_code") || "IDR"
  ).toUpperCase();

  if (!supplierName || supplierName.length > 200) {
    return {
      error: "Nama supplier wajib diisi dan maksimal 200 karakter.",
    };
  }

  if (!["company", "individual"].includes(supplierType)) {
    return { error: "Jenis supplier tidak valid." };
  }

  if (!provinceCode || !regencyCode || !districtId || !villageId) {
    return { error: "Seluruh wilayah alamat wajib dipilih." };
  }

  if (!address) {
    return { error: "Alamat jalan dan detail alamat wajib diisi." };
  }

  const paymentTermDays = Number(paymentTermDaysRaw || "0");
  const creditLimit = Number(creditLimitRaw || "0");

  if (!Number.isInteger(paymentTermDays) || paymentTermDays < 0) {
    return {
      error: "Termin pembayaran harus berupa bilangan bulat minimal 0 hari.",
    };
  }

  if (!Number.isFinite(creditLimit) || creditLimit < 0) {
    return { error: "Limit kredit harus berupa angka minimal 0." };
  }

  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    return { error: "Kode mata uang harus terdiri dari 3 huruf." };
  }

  const payload = {
    supplier_name: supplierName,
    supplier_type: supplierType,
    legal_name: getOptionalString(formData, "legal_name"),
    contact_person: getOptionalString(formData, "contact_person"),
    phone: getOptionalString(formData, "phone"),
    email: getOptionalString(formData, "email"),
    tax_number: getOptionalString(formData, "tax_number"),
    business_license_number: getOptionalString(
      formData,
      "business_license_number"
    ),
    website: getOptionalString(formData, "website"),
    address,
    postal_code: postalCode || null,
    province_code: provinceCode,
    regency_code: regencyCode,
    district_id: districtId,
    village_id: villageId,
    payment_term_days: paymentTermDays,
    credit_limit: creditLimit,
    currency_code: currencyCode,
  };

  const { data, error } = await auth.supabase.rpc(
    "create_supplier_with_primary_address",
    { p_payload: payload }
  );

  if (error) {
    console.error("Gagal membuat supplier:", error);

    if (error.code === "23505") {
      return { error: "Terjadi duplikasi data supplier." };
    }

    if (error.code === "42501") {
      return { error: "Akses ditolak. Periksa hak akses pengguna." };
    }

    return { error: `Gagal menyimpan supplier: ${error.message}` };
  }

  const result = data as {
    id?: string;
    supplier_code?: string;
  } | null;

  if (!result?.id || !result?.supplier_code) {
    return { error: "Database tidak mengembalikan identitas supplier." };
  }

  revalidatePath("/suppliers");
  redirect("/suppliers?created=1");
}

/**
 * Memperbarui supplier dan alamat utamanya secara atomik.
 */
export async function updateSupplierAction(
  _previousState: CreateSupplierState,
  formData: FormData
): Promise<CreateSupplierState> {
  const auth = await getAuthorizationContext("suppliers.update");

  if (!auth.user) redirect("/login");

  if (!auth.authorized) {
    return {
      error: "Anda tidak memiliki izin untuk mengubah supplier.",
    };
  }

  const supplierId = getString(formData, "supplier_id");

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(supplierId)) {
    return { error: "Identitas supplier tidak valid." };
  }

  const supplierName = getString(formData, "supplier_name");
  const supplierType = getString(formData, "supplier_type");

  const provinceCode = getString(formData, "province_code");
  const regencyCode = getString(formData, "regency_code");
  const districtId = getString(formData, "district_id");
  const villageId = getString(formData, "village_id");

  const address = getString(formData, "address");
  const postalCode = getString(formData, "postal_code");

  const paymentTermDays = Number(
    getString(formData, "payment_term_days") || "0"
  );

  const creditLimit = Number(
    getString(formData, "credit_limit") || "0"
  );

  const currencyCode = (
    getString(formData, "currency_code") || "IDR"
  ).toUpperCase();

  if (!supplierName || supplierName.length > 200) {
    return {
      error: "Nama supplier wajib diisi dan maksimal 200 karakter.",
    };
  }

  if (!["company", "individual"].includes(supplierType)) {
    return { error: "Jenis supplier tidak valid." };
  }

  if (!provinceCode || !regencyCode || !districtId || !villageId) {
    return { error: "Seluruh wilayah alamat wajib dipilih." };
  }

  if (!address) {
    return { error: "Alamat jalan dan detail alamat wajib diisi." };
  }

  if (!Number.isInteger(paymentTermDays) || paymentTermDays < 0) {
    return {
      error: "Termin pembayaran harus berupa bilangan bulat minimal 0 hari.",
    };
  }

  if (!Number.isFinite(creditLimit) || creditLimit < 0) {
    return { error: "Limit kredit harus berupa angka minimal 0." };
  }

  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    return { error: "Kode mata uang harus terdiri dari 3 huruf." };
  }

  const payload = {
    supplier_name: supplierName,
    supplier_type: supplierType,
    legal_name: getOptionalString(formData, "legal_name"),
    contact_person: getOptionalString(formData, "contact_person"),
    phone: getOptionalString(formData, "phone"),
    email: getOptionalString(formData, "email"),
    tax_number: getOptionalString(formData, "tax_number"),
    business_license_number: getOptionalString(
      formData,
      "business_license_number"
    ),
    website: getOptionalString(formData, "website"),
    address,
    postal_code: postalCode || null,
    province_code: provinceCode,
    regency_code: regencyCode,
    district_id: districtId,
    village_id: villageId,
    payment_term_days: paymentTermDays,
    credit_limit: creditLimit,
    currency_code: currencyCode,
  };

  const { data, error } = await auth.supabase.rpc(
    "update_supplier_with_primary_address",
    {
      p_supplier_id: supplierId,
      p_payload: payload,
    }
  );

  if (error) {
    console.error("Gagal memperbarui supplier:", error);

    if (error.code === "42501") {
      return { error: "Akses ditolak. Periksa hak akses pengguna." };
    }

    if (error.code === "P0002") {
      return { error: "Supplier tidak ditemukan." };
    }

    return { error: `Gagal memperbarui supplier: ${error.message}` };
  }

  const result = data as {
    id?: string;
    supplier_code?: string;
  } | null;

  if (!result?.id) {
    return { error: "Database tidak mengembalikan identitas supplier." };
  }

  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${supplierId}`);

  redirect(`/suppliers/${supplierId}?updated=1`);
}
