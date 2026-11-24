
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

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
/**
 * Pencarian wilayah Indonesia melalui satu RPC database.
 * Autentikasi dan pemeriksaan izin dilakukan di dalam RPC yang sama
 * dengan query wilayah, sehingga tidak ada lookup profil/izin terpisah.
 */
export async function searchSupplierRegionsAction(
  level: RegionLevel,
  keyword: string,
  parentId: string
): Promise<RegionSearchResult> {
  const searchKeyword = keyword.trim().slice(0, 80);
  if (searchKeyword.length < 2) {
    return {
      data: [],
      error: searchKeyword.length === 0 ? "" : "Ketik minimal 2 huruf untuk mencari wilayah.",
    };
  }

  if (!["province", "regency", "district", "village"].includes(level)) {
    return { data: [], error: "Tingkat wilayah tidak valid." };
  }

  if (level !== "province" && !parentId.trim()) {
    return { data: [], error: "Pilih wilayah induk terlebih dahulu." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_indonesia_regions", {
    p_level: level,
    p_keyword: searchKeyword,
    p_parent_id: parentId,
    p_required_permission: "suppliers.create",
  });

  if (error) {
    console.error("Region search RPC failed:", error);
    const message = error.code === "42501"
      ? "Anda tidak memiliki izin untuk mencari data wilayah."
      : "Gagal mencari data wilayah. Silakan coba kembali.";
    return { data: [], error: message };
  }

  return {
    data: (data ?? []).map((item: { id: string; name: string }) => ({
      id: item.id,
      name: item.name,
    })),
    error: "",
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


/**
 * Mengambil kode pos dari master wilayah lokal berdasarkan ID desa/kelurahan.
 */
export async function searchSupplierPostalCodeAction(villageId: string): Promise<{ postalCode: string; error: string }> {
  const auth = await getAuthorizationContext("suppliers.create");
  if (!auth.user || !auth.authorized) {
    return { postalCode: "", error: "Anda tidak memiliki izin mengakses rekomendasi kode pos." };
  }

  const normalizedVillageId = villageId.trim();
  if (!/^\\d{10}$/.test(normalizedVillageId)) {
    return { postalCode: "", error: "Kode wilayah desa/kelurahan tidak valid." };
  }

  const { data, error } = await auth.supabase
    .from("indonesia_villages")
    .select("postal_code")
    .eq("id", normalizedVillageId)
    .maybeSingle();

  if (error) {
    console.error("Local postal code lookup failed:", error);
    return { postalCode: "", error: "Gagal mengambil kode pos dari database lokal." };
  }

  const postalCode = typeof data?.postal_code === "string" ? data.postal_code : "";
  if (!/^\\d{5}$/.test(postalCode)) {
    return { postalCode: "", error: "Kode pos belum tersedia untuk desa/kelurahan ini." };
  }

  return { postalCode, error: "" };
}
