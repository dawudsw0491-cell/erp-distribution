
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAuthorizationContext } from "@/lib/auth/authorization";

type PurchaseOrderItemInput = {
  product_variant_id: string;
  quantity: string | number;
  unit_cost: string | number;
  discount_amount?: string | number;
  tax_amount?: string | number;
  notes?: string;
};

function getString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function isValidAmount(
  value: unknown,
  maxDecimals: number
): boolean {
  if (typeof value !== "string" && typeof value !== "number") {
    return false;
  }

  const text = String(value);

  const pattern =
    maxDecimals === 0
      ? /^\d{1,16}$/
      : new RegExp(
          `^\\d{1,${18 - maxDecimals}}(?:\\.\\d{1,${maxDecimals}})?$`
        );

  if (!pattern.test(text)) {
    return false;
  }

  const number = Number(text);

  return Number.isFinite(number) && number >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export async function createPurchaseOrderAction(
  formData: FormData
): Promise<never> {
  const {
    supabase,
    user,
    profile,
    authorized,
  } = await getAuthorizationContext("purchasing.create");

  // 1. Authorization
  if (!user) {
    redirect("/login");
  }

  if (!profile || !authorized) {
    redirect("/purchases?error=permission_denied");
  }

  // 2. Read form data
  const supplierId = getString(formData, "supplier_id");
  const warehouseId = getString(formData, "warehouse_id");
  const orderDate = getString(formData, "order_date");
  const expectedDate = getString(formData, "expected_date");
  const notes = getString(formData, "notes");
  const shippingCost = getString(formData, "shipping_cost");
  const rawItems = getString(formData, "items");

  // 3. Validate supplier and warehouse
  if (!isValidUUID(supplierId) || !isValidUUID(warehouseId)) {
    redirect("/purchases/new?error=invalid_reference");
  }

  // 4. Validate dates
  if (!isValidDate(orderDate)) {
    redirect("/purchases/new?error=invalid_order_date");
  }

  if (expectedDate && !isValidDate(expectedDate)) {
    redirect("/purchases/new?error=invalid_expected_date");
  }

  if (expectedDate && expectedDate < orderDate) {
    redirect("/purchases/new?error=invalid_date_range");
  }

  // 5. Validate shipping cost
  if (!isValidAmount(shippingCost, 2)) {
    redirect("/purchases/new?error=invalid_shipping_cost");
  }

  if (notes.length > 2000) {
    redirect("/purchases/new?error=notes_too_long");
  }

  // 6. Parse purchase order items
  let parsedItems: unknown;

  try {
    parsedItems = JSON.parse(rawItems);
  } catch {
    redirect("/purchases/new?error=invalid_items");
  }

  if (
    !Array.isArray(parsedItems) ||
    parsedItems.length === 0 ||
    parsedItems.length > 100
  ) {
    redirect("/purchases/new?error=invalid_items");
  }

  // 7. Validate individual items
  const items: PurchaseOrderItemInput[] = [];

  for (const item of parsedItems) {
    if (!isRecord(item)) {
      redirect("/purchases/new?error=invalid_item_data");
    }

    const variantId = item.product_variant_id;
    const quantity = item.quantity;
    const unitCost = item.unit_cost;
    const discountAmount = item.discount_amount ?? "0";
    const taxAmount = item.tax_amount ?? "0";

    if (
      typeof variantId !== "string" ||
      !isValidUUID(variantId) ||
      !isValidAmount(quantity, 3) ||
      !isValidAmount(unitCost, 2) ||
      !isValidAmount(discountAmount, 2) ||
      !isValidAmount(taxAmount, 2)
    ) {
      redirect("/purchases/new?error=invalid_item_data");
    }

    if (Number(quantity) <= 0) {
      redirect("/purchases/new?error=invalid_quantity");
    }

    const itemNotes =
      typeof item.notes === "string"
        ? item.notes.trim()
        : "";

    if (itemNotes.length > 500) {
      redirect("/purchases/new?error=invalid_item_notes");
    }

    items.push({
      product_variant_id: variantId,
      quantity: String(quantity),
      unit_cost: String(unitCost),
      discount_amount: String(discountAmount),
      tax_amount: String(taxAmount),
      notes: itemNotes,
    });
  }

  // 8. Execute transactional database function
  const { data, error } = await supabase.rpc(
    "create_purchase_order",
    {
      p_supplier_id: supplierId,
      p_warehouse_id: warehouseId,
      p_order_date: orderDate,
      p_expected_date: expectedDate || null,
      p_notes: notes || null,
      p_items: items,
      p_shipping_cost: shippingCost,
    }
  );

  if (error || !data) {
    console.error("Create Purchase Order failed:", error);

    redirect("/purchases/new?error=save_failed");
  }

  // 9. Refresh and redirect
  revalidatePath("/purchases");

  redirect(`/purchases/${data}?created=1`);
}

export async function approvePurchaseOrderAction(
  formData: FormData
): Promise<never> {
  const purchaseOrderId = getString(
    formData,
    "purchase_order_id"
  );

  if (!isValidUUID(purchaseOrderId)) {
    redirect("/purchases?error=invalid_id");
  }

  const {
    supabase,
    user,
    profile,
    authorized,
  } = await getAuthorizationContext("purchasing.approve");

  if (!user) {
    redirect("/login");
  }

  if (!profile || !authorized) {
    redirect("/purchases?error=permission_denied");
  }

  const { data, error } = await supabase.rpc(
    "approve_purchase_order",
    {
      p_purchase_order_id: purchaseOrderId,
    }
  );

  if (error || !data) {
    console.error("Approve Purchase Order failed:", error);

    redirect(`/purchases/${purchaseOrderId}?error=approve_failed`);
  }

  revalidatePath("/purchases");
  revalidatePath(`/purchases/${purchaseOrderId}`);

  redirect(`/purchases/${purchaseOrderId}?approved=1`);
}

export async function rejectPurchaseOrderAction(
  formData: FormData
): Promise<never> {
  const purchaseOrderId = getString(
    formData,
    "purchase_order_id"
  );

  const rejectionReason = getString(
    formData,
    "rejection_reason"
  );

  if (!isValidUUID(purchaseOrderId)) {
    redirect("/purchases?error=invalid_id");
  }

  if (
    !rejectionReason ||
    rejectionReason.length > 1000
  ) {
    redirect(
      `/purchases/${purchaseOrderId}?error=invalid_rejection_reason`
    );
  }

  const {
    supabase,
    user,
    profile,
    authorized,
  } = await getAuthorizationContext("purchasing.approve");

  if (!user) {
    redirect("/login");
  }

  if (!profile || !authorized) {
    redirect("/purchases?error=permission_denied");
  }

  const { data, error } = await supabase.rpc(
    "reject_purchase_order",
    {
      p_purchase_order_id: purchaseOrderId,
      p_rejection_reason: rejectionReason,
    }
  );

  if (error || !data) {
    console.error("Reject Purchase Order failed:", error);

    redirect(`/purchases/${purchaseOrderId}?error=reject_failed`);
  }

  revalidatePath("/purchases");
  revalidatePath(`/purchases/${purchaseOrderId}`);

  redirect(`/purchases/${purchaseOrderId}?rejected=1`);
}
