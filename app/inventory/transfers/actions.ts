
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAuthorizationContext } from "@/lib/auth/authorization";

function getString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isValidQuantity(value: string): boolean {
  if (!/^\d{1,15}(?:\.\d{1,3})?$/.test(value)) {
    return false;
  }

  const quantity = Number(value);

  return Number.isFinite(quantity) && quantity > 0;
}

const VALID_STATUSES = [
  "available",
  "reserved",
  "quarantine",
  "damaged",
  "repair",
] as const;

export async function createInventoryTransferAction(
  formData: FormData
): Promise<never> {
  const productVariantId = getString(
    formData,
    "product_variant_id"
  );

  const sourceWarehouseId = getString(
    formData,
    "source_warehouse_id"
  );

  const destinationWarehouseId = getString(
    formData,
    "destination_warehouse_id"
  );

  const quantity = getString(formData, "quantity");

  const inventoryStatus = getString(
    formData,
    "inventory_status"
  );

  const productUnitId = getString(
    formData,
    "product_unit_id"
  );

  const notes = getString(formData, "notes");

  if (
    !isValidUUID(productVariantId) ||
    !isValidUUID(sourceWarehouseId) ||
    !isValidUUID(destinationWarehouseId)
  ) {
    redirect("/inventory/transfers?error=invalid_reference");
  }

  if (sourceWarehouseId === destinationWarehouseId) {
    redirect("/inventory/transfers?error=same_warehouse");
  }

  if (!isValidQuantity(quantity)) {
    redirect("/inventory/transfers?error=invalid_quantity");
  }

  if (
    !VALID_STATUSES.includes(
      inventoryStatus as (typeof VALID_STATUSES)[number]
    )
  ) {
    redirect("/inventory/transfers?error=invalid_status");
  }

  if (productUnitId && !isValidUUID(productUnitId)) {
    redirect("/inventory/transfers?error=invalid_unit");
  }

  if (notes.length > 2000) {
    redirect("/inventory/transfers?error=notes_too_long");
  }

  const {
    supabase,
    user,
    profile,
    authorized,
  } = await getAuthorizationContext("inventory.transfer");

  if (!user) {
    redirect("/login");
  }

  if (!profile || !authorized) {
    redirect("/inventory/transfers?error=permission_denied");
  }

  const { data, error } = await supabase.rpc(
    "create_inventory_transfer",
    {
      p_product_variant_id: productVariantId,
      p_source_warehouse_id: sourceWarehouseId,
      p_destination_warehouse_id: destinationWarehouseId,
      p_quantity: Number(quantity),
      p_inventory_status: inventoryStatus,
      p_product_unit_id: productUnitId || null,
      p_notes: notes || null,
    }
  );

  if (error || !data) {
    console.error("Create Inventory Transfer failed:", error);

    redirect("/inventory/transfers?error=create_failed");
  }

  revalidatePath("/inventory");
  revalidatePath("/inventory/transfers");
  revalidatePath("/inventory/balances");
  revalidatePath("/inventory/movements");
  revalidatePath("/inventory/units");

  redirect("/inventory/transfers?created=1");
}

export async function postInventoryTransferAction(
  formData: FormData
): Promise<never> {
  const movementGroupId = getString(
    formData,
    "movement_group_id"
  );

  if (!isValidUUID(movementGroupId)) {
    redirect("/inventory/transfers?error=invalid_id");
  }

  const {
    supabase,
    user,
    profile,
    authorized,
  } = await getAuthorizationContext("inventory.transfer");

  if (!user) {
    redirect("/login");
  }

  if (!profile || !authorized) {
    redirect("/inventory/transfers?error=permission_denied");
  }

  const { data, error } = await supabase.rpc(
    "post_inventory_transfer",
    {
      p_movement_group_id: movementGroupId,
    }
  );

  if (error || !data) {
    console.error("Post Inventory Transfer failed:", error);

    redirect("/inventory/transfers?error=post_failed");
  }

  revalidatePath("/inventory");
  revalidatePath("/inventory/transfers");
  revalidatePath("/inventory/balances");
  revalidatePath("/inventory/movements");
  revalidatePath("/inventory/units");

  redirect("/inventory/transfers?posted=1");
}
