
"use server";

import { createClient } from "@/lib/supabase/server";

export type BankAccountInput = {
  supplierId: string;
  bankName: string;
  bankBranch?: string;
  accountName: string;
  accountNumber: string;
  currencyCode?: string;
  notes?: string;
};

export type BankActionResult = {
  success: boolean;
  message: string;
  data?: unknown;
};

function validateBankInput(input: BankAccountInput): string | null {
  if (!input.supplierId?.trim()) {
    return "Supplier ID wajib diisi.";
  }

  if (!input.bankName?.trim()) {
    return "Nama bank wajib diisi.";
  }

  if (!input.accountName?.trim()) {
    return "Nama pemilik rekening wajib diisi.";
  }

  if (!input.accountNumber?.trim()) {
    return "Nomor rekening wajib diisi.";
  }

  const currency = input.currencyCode ?? "IDR";

  if (!/^[A-Z]{3}$/.test(currency)) {
    return "Kode mata uang harus terdiri dari tiga huruf kapital.";
  }

  return null;
}

async function authorizeBankManagement() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      supabase,
      authorized: false,
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile?.is_active) {
    return {
      supabase,
      authorized: false,
    };
  }

  const { data: permitted, error: permissionError } =
    await supabase.rpc("has_permission", {
      required_permission: "suppliers.manage_bank",
    });

  return {
    supabase,
    authorized: !permissionError && permitted === true,
  };
}

export async function getSupplierBankAccountsAction(
  supplierId: string
): Promise<BankActionResult> {
  if (!supplierId?.trim()) {
    return {
      success: false,
      message: "Supplier ID wajib diisi.",
    };
  }

  const { supabase } = await authorizeBankManagement();

  const { data: userData, error: authError } =
    await supabase.auth.getUser();

  if (authError || !userData.user) {
    return {
      success: false,
      message: "Silakan login kembali.",
    };
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_active")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!profile?.is_active) {
    return {
      success: false,
      message: "Akun tidak aktif atau tidak memiliki akses.",
    };
  }

  const { data: permission, error: permissionError } =
    await supabase.rpc("has_permission", {
      required_permission: "suppliers.manage_bank",
    });

  if (permissionError || permission !== true) {
    return {
      success: false,
      message: "Anda tidak memiliki izin mengelola rekening bank.",
    };
  }

  const { data, error } = await supabase
    .from("supplier_bank_accounts")
    .select(
      "id, supplier_id, bank_name, bank_branch, account_name, account_number, currency_code, is_primary, is_active, notes, created_at, updated_at"
    )
    .eq("supplier_id", supplierId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return {
      success: false,
      message: "Gagal mengambil rekening bank supplier.",
    };
  }

  return {
    success: true,
    message: "Data rekening bank berhasil diambil.",
    data,
  };
}

export async function createSupplierBankAccountAction(
  input: BankAccountInput & { isPrimary?: boolean }
): Promise<BankActionResult> {
  const validationError = validateBankInput(input);

  if (validationError) {
    return { success: false, message: validationError };
  }

  const { supabase, authorized } = await authorizeBankManagement();

  if (!authorized) {
    return {
      success: false,
      message: "Anda tidak memiliki izin mengelola rekening bank.",
    };
  }

  const { data, error } = await supabase.rpc(
    "create_supplier_bank_account",
    {
      p_supplier_id: input.supplierId,
      p_bank_name: input.bankName.trim(),
      p_bank_branch: input.bankBranch?.trim() || null,
      p_account_name: input.accountName.trim(),
      p_account_number: input.accountNumber.trim(),
      p_currency_code: input.currencyCode ?? "IDR",
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

  return {
    success: true,
    message: "Rekening bank berhasil ditambahkan.",
    data,
  };
}

export async function updateSupplierBankAccountAction(
  bankAccountId: string,
  input: BankAccountInput & { isActive: boolean }
): Promise<BankActionResult> {
  if (!bankAccountId?.trim()) {
    return {
      success: false,
      message: "ID rekening bank wajib diisi.",
    };
  }

  const validationError = validateBankInput(input);

  if (validationError) {
    return { success: false, message: validationError };
  }

  const { supabase, authorized } = await authorizeBankManagement();

  if (!authorized) {
    return {
      success: false,
      message: "Anda tidak memiliki izin mengelola rekening bank.",
    };
  }

  const { data, error } = await supabase.rpc(
    "update_supplier_bank_account",
    {
      p_supplier_id: input.supplierId,
      p_bank_account_id: bankAccountId,
      p_bank_name: input.bankName.trim(),
      p_bank_branch: input.bankBranch?.trim() || null,
      p_account_name: input.accountName.trim(),
      p_account_number: input.accountNumber.trim(),
      p_currency_code: input.currencyCode ?? "IDR",
      p_is_active: input.isActive,
      p_notes: input.notes?.trim() || null,
    }
  );

  if (error) {
    return {
      success: false,
      message: error.message,
    };
  }

  return {
    success: true,
    message: "Rekening bank berhasil diperbarui.",
    data,
  };
}

export async function deleteSupplierBankAccountAction(
  supplierId: string,
  bankAccountId: string
): Promise<BankActionResult> {
  if (!supplierId?.trim() || !bankAccountId?.trim()) {
    return {
      success: false,
      message: "Supplier ID dan rekening bank wajib diisi.",
    };
  }

  const { supabase, authorized } = await authorizeBankManagement();

  if (!authorized) {
    return {
      success: false,
      message: "Anda tidak memiliki izin mengelola rekening bank.",
    };
  }

  const { data, error } = await supabase.rpc(
    "delete_supplier_bank_account",
    {
      p_supplier_id: supplierId,
      p_bank_account_id: bankAccountId,
    }
  );

  if (error) {
    return {
      success: false,
      message: error.message,
    };
  }

  return {
    success: true,
    message: "Rekening bank berhasil dihapus.",
    data,
  };
}

export async function setPrimarySupplierBankAccountAction(
  supplierId: string,
  bankAccountId: string
): Promise<BankActionResult> {
  if (!supplierId?.trim() || !bankAccountId?.trim()) {
    return {
      success: false,
      message: "Supplier ID dan rekening bank wajib diisi.",
    };
  }

  const { supabase, authorized } = await authorizeBankManagement();

  if (!authorized) {
    return {
      success: false,
      message: "Anda tidak memiliki izin mengelola rekening bank.",
    };
  }

  const { data, error } = await supabase.rpc(
    "set_supplier_primary_bank_account",
    {
      p_supplier_id: supplierId,
      p_bank_account_id: bankAccountId,
    }
  );

  if (error) {
    return {
      success: false,
      message: error.message,
    };
  }

  return {
    success: true,
    message: "Rekening utama berhasil diperbarui.",
    data,
  };
}
