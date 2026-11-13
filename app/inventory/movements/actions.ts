
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/auth/authorization";

function getString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function getOptionalString(
  formData: FormData,
  key: string
): string | null {
  const value = getString(formData, key);
  return value || null;
}

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function redirectWithError(message: string): never {
  redirect(
    `/inventory/movements?error=${encodeURIComponent(message)}`
  );
}

export async function createInventoryMovementAction(
  formData: FormData
): Promise<never> {
  const { supabase } = await getAuthorizationContext(
    "inventory.update"
  );

  const productVariantId = getString(
    formData,
    "product_variant_id"
  );

  const warehouseId = getString(
    formData,
    "warehouse_id"
  );

  const movementType = getString(
    formData,
    "movement_type"
  );

  const quantityRaw = getString(
    formData,
    "quantity_delta"
  );

  const inventoryStatus = getString(
    formData,
    "inventory_status"
  ) || "available";

  const productUnitId = getOptionalString(
    formData,
    "product_unit_id"
  );

  const statusFrom = getOptionalString(
    formData,
    "status_from"
  );

  const statusTo = getOptionalString(
    formData,
    "status_to"
  );

  const notes = getOptionalString(
    formData,
    "notes"
  );

  if (
    !isValidUUID(productVariantId) ||
    !isValidUUID(warehouseId)
  ) {
    redirectWithError("Produk atau warehouse tidak valid.");
  }

  const quantity = Number(quantityRaw);

  if (!Number.isFinite(quantity)) {
    redirectWithError("Jumlah mutasi tidak valid.");
  }

  if (
    productUnitId &&
    !isValidUUID(productUnitId)
  ) {
    redirectWithError("Product unit tidak valid.");
  }

  if (
    movementType === "status_change" &&
    !productUnitId
  ) {
    redirectWithError("Product unit wajib diisi untuk status change.");
  }

  const { error } = await supabase.rpc(
    "create_inventory_movement",
    {
      p_product_variant_id: productVariantId,
      p_warehouse_id: warehouseId,
      p_movement_type: movementType,
      p_quantity_delta: quantity,
      p_inventory_status: inventoryStatus,
      p_product_unit_id: productUnitId,
      p_status_from: statusFrom,
      p_status_to: statusTo,
      p_notes: notes,
    }
  );

  if (error) {
    redirectWithError(error.message);
  }

  revalidatePath("/inventory/movements");
  revalidatePath("/inventory/balances");
  revalidatePath("/inventory/units");

  redirect(
    "/inventory/movements?success=draft_created"
  );
}

export async function postInventoryMovementAction(
  formData: FormData
): Promise<never> {
  const { supabase } = await getAuthorizationContext(
    "inventory.update"
  );

  const movementId = getString(
    formData,
    "movement_id"
  );

  if (!isValidUUID(movementId)) {
    redirectWithError("Movement ID tidak valid.");
  }

  const unitCostRaw = getOptionalString(
    formData,
    "unit_cost"
  );

  const unitCost = unitCostRaw === null
    ? null
    : Number(unitCostRaw);

  if (
    unitCost !== null &&
    (!Number.isFinite(unitCost) || unitCost < 0)
  ) {
    redirectWithError("Unit cost tidak valid.");
  }

  const { error } = await supabase.rpc(
    "post_inventory_movement",
    {
      p_movement_id: movementId,
      p_unit_cost: unitCost,
    }
  );

  if (error) {
    redirectWithError(error.message);
  }

  revalidatePath("/inventory/movements");
  revalidatePath("/inventory/balances");
  revalidatePath("/inventory/units");

  redirect(
    "/inventory/movements?success=posted"
  );
}
