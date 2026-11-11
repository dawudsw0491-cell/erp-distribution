
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export type WarehouseActionState = {
  error?: string;
  success?: string;
};

function getString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function createWarehouseAction(
  _prevState: WarehouseActionState,
  formData: FormData
): Promise<WarehouseActionState> {
  const auth = await getAuthorizationContext("master.create");

  if (!auth.user || !auth.authorized) {
    return { error: "Anda tidak memiliki izin membuat warehouse." };
  }

  const warehouseCode = getString(formData, "warehouse_code").toUpperCase();
  const warehouseName = getString(formData, "warehouse_name");

  if (!warehouseCode || !warehouseName) {
    return { error: "Kode dan nama warehouse wajib diisi." };
  }

  if (!/^[A-Z0-9._-]+$/.test(warehouseCode)) {
    return { error: "Format kode warehouse tidak valid." };
  }

  const { data: existingWarehouse, error: checkError } =
    await auth.supabase
      .from("warehouses")
      .select("id")
      .eq("warehouse_code", warehouseCode)
      .maybeSingle();

  if (checkError) {
    return { error: "Gagal memeriksa kode warehouse." };
  }

  if (existingWarehouse) {
    return { error: "Kode warehouse sudah digunakan." };
  }

  const { error } = await auth.supabase.from("warehouses").insert({
    warehouse_code: warehouseCode,
    warehouse_name: warehouseName,
    address: getString(formData, "address") || null,
    city: getString(formData, "city") || null,
    province: getString(formData, "province") || null,
    postal_code: getString(formData, "postal_code") || null,
    contact_person: getString(formData, "contact_person") || null,
    phone: getString(formData, "phone") || null,
    is_active: true,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Kode warehouse sudah digunakan." };
    }

    return {
      error: "Gagal menyimpan warehouse. Periksa kembali data dan hak akses.",
    };
  }

  revalidatePath("/warehouses");
  redirect("/warehouses?success=created");
}

export async function updateWarehouseStatusAction(
  warehouseId: string,
  isActive: boolean,
  _formData: FormData
): Promise<void> {
  const auth = await getAuthorizationContext("master.update");

  if (!auth.user || !auth.authorized) {
    throw new Error("Anda tidak memiliki izin mengubah warehouse.");
  }

  const { error } = await auth.supabase
    .from("warehouses")
    .update({ is_active: isActive })
    .eq("id", warehouseId);

  if (error) {
    throw new Error("Gagal mengubah status warehouse.");
  }

  revalidatePath("/warehouses");
}

export async function updateWarehouseAction(
  warehouseId: string,
  _prevState: WarehouseActionState,
  formData: FormData
): Promise<WarehouseActionState> {
  const auth = await getAuthorizationContext("master.update");

  if (!auth.user || !auth.authorized) {
    return { error: "Anda tidak memiliki izin mengubah warehouse." };
  }

  if (!warehouseId || !/^[0-9a-f-]{36}$/i.test(warehouseId)) {
    return { error: "ID warehouse tidak valid." };
  }

  const warehouseName = getString(formData, "warehouse_name");

  if (!warehouseName) {
    return { error: "Nama warehouse wajib diisi." };
  }

  const { data: existing, error: lookupError } = await auth.supabase
    .from("warehouses")
    .select("id")
    .eq("id", warehouseId)
    .maybeSingle();

  if (lookupError || !existing) {
    return { error: "Warehouse tidak ditemukan." };
  }

  const { error } = await auth.supabase
    .from("warehouses")
    .update({
      warehouse_name: warehouseName,
      address: getString(formData, "address") || null,
      city: getString(formData, "city") || null,
      province: getString(formData, "province") || null,
      postal_code: getString(formData, "postal_code") || null,
      contact_person: getString(formData, "contact_person") || null,
      phone: getString(formData, "phone") || null,
    })
    .eq("id", warehouseId);

  if (error) {
    return { error: "Gagal memperbarui data warehouse." };
  }

  revalidatePath("/warehouses");
  revalidatePath(`/warehouses/${warehouseId}/edit`);

  redirect("/warehouses?success=updated");
}
