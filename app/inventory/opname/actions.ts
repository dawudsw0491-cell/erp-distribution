
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAuthorizationContext } from "@/lib/auth/authorization";

function getString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isValidQuantity(value: string): boolean {
  if (!/^\d{1,15}(?:\.\d{1,3})?$/.test(value)) {
    return false;
  }

  const quantity = Number(value);

  return Number.isFinite(quantity) && quantity >= 0;
}

async function authorizeOpname() {
  const context = await getAuthorizationContext("inventory.opname");

  if (!context.user) {
    redirect("/login");
  }

  if (!context.profile || !context.authorized) {
    redirect("/inventory/opname?error=permission_denied");
  }

  return context;
}

function refreshOpname(sessionId?: string) {
  revalidatePath("/inventory");
  revalidatePath("/inventory/opname");
  revalidatePath("/inventory/balances");
  revalidatePath("/inventory/movements");
  revalidatePath("/inventory/units");

  if (sessionId && isValidUUID(sessionId)) {
    revalidatePath(`/inventory/opname/${sessionId}`);
  }
}

export async function createStockOpnameAction(
  formData: FormData
): Promise<never> {
  const warehouseId = getString(formData, "warehouse_id");
  const notes = getString(formData, "notes");

  if (!isValidUUID(warehouseId)) {
    redirect("/inventory/opname?error=invalid_warehouse");
  }

  if (notes.length > 2000) {
    redirect("/inventory/opname?error=notes_too_long");
  }

  const { supabase } = await authorizeOpname();

  const { data, error } = await supabase.rpc(
    "create_stock_opname",
    {
      p_warehouse_id: warehouseId,
      p_notes: notes || null,
    }
  );

  if (error || !data) {
    console.error("Create Stock Opname failed:", error);
    redirect("/inventory/opname?error=create_failed");
  }

  refreshOpname(data);

  redirect(`/inventory/opname/${data}?created=1`);
}

export async function startStockOpnameAction(
  formData: FormData
): Promise<never> {
  const sessionId = getString(formData, "session_id");

  if (!isValidUUID(sessionId)) {
    redirect("/inventory/opname?error=invalid_id");
  }

  const { supabase } = await authorizeOpname();

  const { error } = await supabase.rpc(
    "start_stock_opname",
    {
      p_session_id: sessionId,
    }
  );

  if (error) {
    console.error("Start Stock Opname failed:", error);
    redirect(`/inventory/opname/${sessionId}?error=start_failed`);
  }

  refreshOpname(sessionId);

  redirect(`/inventory/opname/${sessionId}?started=1`);
}


export async function recordStockOpnameCountAction(
  formData: FormData
): Promise<{ success: boolean; message: string }> {
  const sessionId = getString(formData, "session_id");
  const itemId = getString(formData, "item_id");
  const countedQuantity = getString(formData, "counted_quantity");
  const notes = getString(formData, "notes");

  if (!isValidUUID(sessionId) || !isValidUUID(itemId)) {
    return { success: false, message: "ID sesi atau item tidak valid." };
  }

  if (!isValidQuantity(countedQuantity)) {
    return { success: false, message: "Quantity tidak valid." };
  }

  if (notes.length > 2000) {
    return { success: false, message: "Catatan maksimal 2.000 karakter." };
  }

  const { supabase } = await authorizeOpname();

  const { error } = await supabase.rpc(
    "record_stock_opname_count",
    {
      p_item_id: itemId,
      p_counted_quantity: Number(countedQuantity),
      p_notes: notes || null,
    }
  );

  if (error) {
    console.error("Record Stock Opname Count failed:", error);
    return {
      success: false,
      message: "Gagal menyimpan hasil penghitungan.",
    };
  }

  return {
    success: true,
    message: "Hasil penghitungan berhasil disimpan.",
  };
}



export async function recordStockOpnameUnitCountAction(
  formData: FormData
): Promise<{ success: boolean; message: string }> {
  const sessionId = getString(formData, "session_id");
  const itemId = getString(formData, "item_id");
  const productUnitId = getString(formData, "product_unit_id");
  const isPresentValue = getString(formData, "is_present");
  const observedStatus = getString(formData, "observed_status");
  const notes = getString(formData, "notes");

  if (
    !isValidUUID(sessionId) ||
    !isValidUUID(itemId) ||
    !isValidUUID(productUnitId)
  ) {
    return { success: false, message: "ID sesi, item, atau unit tidak valid." };
  }

  if (isPresentValue !== "true" && isPresentValue !== "false") {
    return { success: false, message: "Hasil pemeriksaan tidak valid." };
  }

  if (notes.length > 2000) {
    return { success: false, message: "Catatan maksimal 2.000 karakter." };
  }

  const isPresent = isPresentValue === "true";

  const { supabase } = await authorizeOpname();

  const { error } = await supabase.rpc(
    "record_stock_opname_unit_count",
    {
      p_item_id: itemId,
      p_product_unit_id: productUnitId,
      p_is_present: isPresent,
      p_observed_status: isPresent ? observedStatus || null : null,
      p_notes: notes || null,
    }
  );

  if (error) {
    console.error("Record Stock Opname Unit Count failed:", error);
    return {
      success: false,
      message: "Gagal menyimpan pemeriksaan unit.",
    };
  }

  return {
    success: true,
    message: "Pemeriksaan unit berhasil disimpan.",
  };
}


export async function submitStockOpnameReviewAction(
  formData: FormData
): Promise<never> {
  const sessionId = getString(formData, "session_id");

  if (!isValidUUID(sessionId)) {
    redirect("/inventory/opname?error=invalid_id");
  }

  const { supabase } = await authorizeOpname();

  const { error } = await supabase.rpc(
    "submit_stock_opname_review",
    {
      p_session_id: sessionId,
    }
  );

  if (error) {
    console.error("Submit Stock Opname Review failed:", error);
    redirect(`/inventory/opname/${sessionId}?error=submit_failed`);
  }

  refreshOpname(sessionId);

  redirect(`/inventory/opname/${sessionId}?submitted=1`);
}

export async function approveStockOpnameAction(
  formData: FormData
): Promise<never> {
  const sessionId = getString(formData, "session_id");

  if (!isValidUUID(sessionId)) {
    redirect("/inventory/opname?error=invalid_id");
  }

  const { supabase } = await authorizeOpname();

  const { error } = await supabase.rpc(
    "approve_stock_opname",
    {
      p_session_id: sessionId,
    }
  );

  if (error) {
    console.error("Approve Stock Opname failed:", error);
    redirect(`/inventory/opname/${sessionId}?error=approve_failed`);
  }

  refreshOpname(sessionId);

  redirect(`/inventory/opname/${sessionId}?approved=1`);
}

export async function postStockOpnameAction(
  formData: FormData
): Promise<never> {
  const sessionId = getString(formData, "session_id");

  if (!isValidUUID(sessionId)) {
    redirect("/inventory/opname?error=invalid_id");
  }

  const { supabase } = await authorizeOpname();

  const { error } = await supabase.rpc(
    "post_stock_opname",
    {
      p_session_id: sessionId,
    }
  );

  if (error) {
    console.error("Post Stock Opname failed:", error);
    redirect(`/inventory/opname/${sessionId}?error=post_failed`);
  }

  refreshOpname(sessionId);

  redirect(`/inventory/opname/${sessionId}?posted=1`);
}

export async function cancelStockOpnameAction(
  formData: FormData
): Promise<never> {
  const sessionId = getString(formData, "session_id");
  const reason = getString(formData, "reason");

  if (!isValidUUID(sessionId)) {
    redirect("/inventory/opname?error=invalid_id");
  }

  if (!reason || reason.length > 2000) {
    redirect(`/inventory/opname/${sessionId}?error=invalid_reason`);
  }

  const { supabase } = await authorizeOpname();

  const { error } = await supabase.rpc(
    "cancel_stock_opname",
    {
      p_session_id: sessionId,
      p_reason: reason,
    }
  );

  if (error) {
    console.error("Cancel Stock Opname failed:", error);
    redirect(`/inventory/opname/${sessionId}?error=cancel_failed`);
  }

  refreshOpname(sessionId);

  redirect(`/inventory/opname/${sessionId}?cancelled=1`);
}
