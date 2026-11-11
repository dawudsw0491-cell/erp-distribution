
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export type CustomerType = "individual" | "company";

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

function getCustomerData(formData: FormData) {
  const customerName = getString(formData, "customer_name");
  const customerType = getString(formData, "customer_type");
  const email = getOptionalString(formData, "email");
  const paymentTermDays = Number(
    getString(formData, "payment_term_days") || "0"
  );
  const creditLimit = Number(
    getString(formData, "credit_limit") || "0"
  );

  if (!customerName) {
    return { error: "Nama pelanggan wajib diisi.", data: null };
  }

  if (
    customerType !== "individual" &&
    customerType !== "company"
  ) {
    return { error: "Tipe pelanggan tidak valid.", data: null };
  }

  if (
    email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return { error: "Format email tidak valid.", data: null };
  }

  if (
    !Number.isInteger(paymentTermDays) ||
    paymentTermDays < 0
  ) {
    return {
      error: "Termin pembayaran harus berupa bilangan bulat positif atau nol.",
      data: null,
    };
  }

  if (!Number.isFinite(creditLimit) || creditLimit < 0) {
    return {
      error: "Limit kredit harus berupa angka positif atau nol.",
      data: null,
    };
  }

  return {
    error: "",
    data: {
      customer_name: customerName,
      customer_type: customerType,
      phone: getOptionalString(formData, "phone"),
      email,
      tax_number: getOptionalString(formData, "tax_number"),
      address: getOptionalString(formData, "address"),
      city: getOptionalString(formData, "city"),
      province: getOptionalString(formData, "province"),
      payment_term_days: paymentTermDays,
      credit_limit: creditLimit,
    },
  };
}

/**
 * Membuat pelanggan baru.
 * customer_code dibuat otomatis oleh trigger database.
 */
export async function createCustomerAction(
  formData: FormData
): Promise<void> {
  const auth = await getAuthorizationContext("master.create");

  if (!auth.user) {
    redirect("/login");
  }

  if (!auth.authorized) {
    redirect("/customers/new?error=forbidden");
  }

  const result = getCustomerData(formData);

  if (!result.data) {
    redirect(
      `/customers/new?error=${encodeURIComponent(result.error)}`
    );
  }

  const { data, error } = await auth.supabase
    .from("customers")
    .insert(result.data)
    .select("id")
    .single();

  if (error || !data) {
    redirect(
      `/customers/new?error=${encodeURIComponent(
        "Gagal menyimpan data pelanggan. Silakan periksa kembali data Anda."
      )}`
    );
  }

  revalidatePath("/customers");
  revalidatePath("/master-data");

  redirect(`/customers/${data.id}?success=created`);
}

/**
 * Memperbarui data pelanggan.
 */
export async function updateCustomerAction(
  formData: FormData
): Promise<void> {
  const auth = await getAuthorizationContext("master.update");

  if (!auth.user) {
    redirect("/login");
  }

  const id = getString(formData, "id");

  if (!id) {
    redirect("/customers?error=invalid_id");
  }

  if (!auth.authorized) {
    redirect(`/customers/${id}/edit?error=forbidden`);
  }

  const result = getCustomerData(formData);

  if (!result.data) {
    redirect(
      `/customers/${id}/edit?error=${encodeURIComponent(result.error)}`
    );
  }

  const { data, error } = await auth.supabase
    .from("customers")
    .update(result.data)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirect(
      `/customers/${id}/edit?error=${encodeURIComponent(
        "Gagal memperbarui data pelanggan."
      )}`
    );
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  revalidatePath(`/customers/${id}/edit`);

  redirect(`/customers/${id}?success=updated`);
}

/**
 * Mengaktifkan atau menonaktifkan pelanggan.
 */
export async function updateCustomerStatusAction(
  formData: FormData
): Promise<void> {
  const auth = await getAuthorizationContext("master.update");

  if (!auth.user) {
    redirect("/login");
  }

  const id = getString(formData, "id");
  const status = getString(formData, "is_active");

  if (!id || (status !== "true" && status !== "false")) {
    redirect("/customers?error=invalid_data");
  }

  if (!auth.authorized) {
    redirect(`/customers/${id}?error=forbidden`);
  }

  const { data, error } = await auth.supabase
    .from("customers")
    .update({ is_active: status === "true" })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirect(
      `/customers/${id}?error=${encodeURIComponent(
        "Gagal mengubah status pelanggan."
      )}`
    );
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  revalidatePath(`/customers/${id}/edit`);

  redirect("/customers?success=status_updated");
}

/**
 * Pencarian wilayah Indonesia secara bertingkat.
 */
export async function searchCustomerRegionsAction(
  level: RegionLevel,
  keyword: string,
  parentId: string
): Promise<RegionSearchResult> {
  const auth = await getAuthorizationContext("master.create");

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
      data: (data ?? []).map(
        (item: { code: string; name: string }) => ({
          id: item.code,
          name: item.name,
        })
      ),
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
      return {
        data: [],
        error: "Gagal mencari data kabupaten/kota.",
      };
    }

    return {
      data: (data ?? []).map(
        (item: { code: string; name: string }) => ({
          id: item.code,
          name: item.name,
        })
      ),
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
      return {
        data: [],
        error: "Gagal mencari data kecamatan.",
      };
    }

    return {
      data: (data ?? []).map(
        (item: { id: string; name: string }) => ({
          id: item.id,
          name: item.name,
        })
      ),
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
      return {
        data: [],
        error: "Gagal mencari data desa/kelurahan.",
      };
    }

    return {
      data: (data ?? []).map(
        (item: { id: string; name: string }) => ({
          id: item.id,
          name: item.name,
        })
      ),
      error: "",
    };
  }

  return {
    data: [],
    error: "Tingkat wilayah tidak valid.",
  };
}
