
"use server";

import { revalidatePath } from "next/cache";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export type SupplierContactInput = {
  supplierId: string;
  contactName: string;
  position?: string;
  phone?: string;
  email?: string;
  isPrimary?: boolean;
  notes?: string;
};

export type SupplierContact = {
  id: string;
  supplier_id: string;
  contact_name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type SupplierContactActionResult = {
  success: boolean;
  message: string;
  data?: SupplierContact[] | string | null;
};

function validateContactInput(
  input: SupplierContactInput
): string | null {
  if (!input.supplierId?.trim()) {
    return "Supplier ID wajib diisi.";
  }

  if (!input.contactName?.trim()) {
    return "Nama kontak wajib diisi.";
  }

  if (input.contactName.trim().length > 150) {
    return "Nama kontak maksimal 150 karakter.";
  }

  if (input.position && input.position.trim().length > 150) {
    return "Jabatan maksimal 150 karakter.";
  }

  if (input.phone && input.phone.trim().length > 50) {
    return "Nomor telepon maksimal 50 karakter.";
  }

  if (input.email && input.email.trim().length > 254) {
    return "Email maksimal 254 karakter.";
  }

  if (
    input.email?.trim() &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())
  ) {
    return "Format email tidak valid.";
  }

  return null;
}

function supplierPath(supplierId: string): string {
  return `/suppliers/${supplierId}`;
}

async function getContactAuthorization(
  permission: "suppliers.view" | "suppliers.create" | "suppliers.update"
) {
  return getAuthorizationContext(permission);
}

export async function getSupplierContactsAction(
  supplierId: string
): Promise<SupplierContactActionResult> {
  if (!supplierId?.trim()) {
    return {
      success: false,
      message: "Supplier ID wajib diisi.",
    };
  }

  const { supabase, authorized, user } =
    await getContactAuthorization("suppliers.view");

  if (!user) {
    return {
      success: false,
      message: "Silakan login kembali.",
    };
  }

  if (!authorized) {
    return {
      success: false,
      message: "Anda tidak memiliki izin melihat kontak supplier.",
    };
  }

  const { data, error } = await supabase
    .from("supplier_contacts")
    .select(
      "id, supplier_id, contact_name, position, phone, email, is_primary, notes, created_at, updated_at"
    )
    .eq("supplier_id", supplierId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return {
      success: false,
      message: "Gagal mengambil data kontak supplier.",
    };
  }

  return {
    success: true,
    message: "Data kontak supplier berhasil diambil.",
    data: data as SupplierContact[],
  };
}

export async function createSupplierContactAction(
  input: SupplierContactInput
): Promise<SupplierContactActionResult> {
  const validationError = validateContactInput(input);

  if (validationError) {
    return {
      success: false,
      message: validationError,
    };
  }

  const { supabase, authorized, user } =
    await getContactAuthorization("suppliers.create");

  if (!user) {
    return {
      success: false,
      message: "Silakan login kembali.",
    };
  }

  if (!authorized) {
    return {
      success: false,
      message: "Anda tidak memiliki izin menambahkan kontak supplier.",
    };
  }

  const { data, error } = await supabase.rpc(
    "create_supplier_contact",
    {
      p_supplier_id: input.supplierId,
      p_contact_name: input.contactName.trim(),
      p_position: input.position?.trim() || null,
      p_phone: input.phone?.trim() || null,
      p_email: input.email?.trim() || null,
      p_is_primary: input.isPrimary ?? false,
      p_notes: input.notes?.trim() || null,
    }
  );

  if (error) {
    return {
      success: false,
      message: error.message,
    };
  }

  revalidatePath("/suppliers");
  revalidatePath(supplierPath(input.supplierId));

  return {
    success: true,
    message: "Kontak supplier berhasil ditambahkan.",
    data: data as string,
  };
}

export async function updateSupplierContactAction(
  contactId: string,
  input: SupplierContactInput
): Promise<SupplierContactActionResult> {
  if (!contactId?.trim()) {
    return {
      success: false,
      message: "Contact ID wajib diisi.",
    };
  }

  const validationError = validateContactInput(input);

  if (validationError) {
    return {
      success: false,
      message: validationError,
    };
  }

  const { supabase, authorized, user } =
    await getContactAuthorization("suppliers.update");

  if (!user) {
    return {
      success: false,
      message: "Silakan login kembali.",
    };
  }

  if (!authorized) {
    return {
      success: false,
      message: "Anda tidak memiliki izin memperbarui kontak supplier.",
    };
  }

  const { data, error } = await supabase.rpc(
    "update_supplier_contact",
    {
      p_supplier_id: input.supplierId,
      p_contact_id: contactId,
      p_contact_name: input.contactName.trim(),
      p_position: input.position?.trim() || null,
      p_phone: input.phone?.trim() || null,
      p_email: input.email?.trim() || null,
      p_is_primary: input.isPrimary ?? false,
      p_notes: input.notes?.trim() || null,
    }
  );

  if (error) {
    return {
      success: false,
      message: error.message,
    };
  }

  revalidatePath("/suppliers");
  revalidatePath(supplierPath(input.supplierId));

  return {
    success: true,
    message: "Kontak supplier berhasil diperbarui.",
    data: data as string,
  };
}

export async function deleteSupplierContactAction(
  supplierId: string,
  contactId: string
): Promise<SupplierContactActionResult> {
  if (!supplierId?.trim() || !contactId?.trim()) {
    return {
      success: false,
      message: "Supplier ID dan Contact ID wajib diisi.",
    };
  }

  const { supabase, authorized, user } =
    await getContactAuthorization("suppliers.update");

  if (!user) {
    return {
      success: false,
      message: "Silakan login kembali.",
    };
  }

  if (!authorized) {
    return {
      success: false,
      message: "Anda tidak memiliki izin menghapus kontak supplier.",
    };
  }

  const { data, error } = await supabase.rpc(
    "delete_supplier_contact",
    {
      p_supplier_id: supplierId,
      p_contact_id: contactId,
    }
  );

  if (error) {
    return {
      success: false,
      message: error.message,
    };
  }

  revalidatePath("/suppliers");
  revalidatePath(supplierPath(supplierId));

  return {
    success: true,
    message: "Kontak supplier berhasil dihapus.",
    data: data as string,
  };
}

export async function setPrimarySupplierContactAction(
  supplierId: string,
  contactId: string
): Promise<SupplierContactActionResult> {
  if (!supplierId?.trim() || !contactId?.trim()) {
    return {
      success: false,
      message: "Supplier ID dan Contact ID wajib diisi.",
    };
  }

  const { supabase, authorized, user } =
    await getContactAuthorization("suppliers.update");

  if (!user) {
    return {
      success: false,
      message: "Silakan login kembali.",
    };
  }

  if (!authorized) {
    return {
      success: false,
      message: "Anda tidak memiliki izin mengubah kontak utama.",
    };
  }

  const { data, error } = await supabase.rpc(
    "set_supplier_primary_contact",
    {
      p_supplier_id: supplierId,
      p_contact_id: contactId,
    }
  );

  if (error) {
    return {
      success: false,
      message: error.message,
    };
  }

  revalidatePath("/suppliers");
  revalidatePath(supplierPath(supplierId));

  return {
    success: true,
    message: "Kontak utama berhasil diperbarui.",
    data: data as string,
  };
}
