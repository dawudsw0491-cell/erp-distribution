"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthenticatedContext } from "@/lib/auth/authorization";

function value(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}
function uuid(input: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input);
}
function validDate(input: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return false;
  const d = new Date(input + "T00:00:00.000Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === input;
}
function validItems(raw: string): Array<{product_variant_id:string;quantity:string;unit_price:string}> {
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || data.length < 1 || data.length > 100) throw new Error("invalid_items");
  return data.map((item) => {
    if (!item || typeof item !== "object") throw new Error("invalid_item");
    const row = item as Record<string, unknown>;
    if (typeof row.product_variant_id !== "string" || !uuid(row.product_variant_id)) throw new Error("invalid_variant");
    const quantity = String(row.quantity ?? "");
    const unit_price = String(row.unit_price ?? "");
    if (!/^\d{1,15}(?:\.\d{1,3})?$/.test(quantity) || Number(quantity) <= 0) throw new Error("invalid_quantity");
    if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(unit_price) || Number(unit_price) < 0) throw new Error("invalid_price");
    return { product_variant_id: row.product_variant_id, quantity, unit_price };
  });
}

export async function createSalesOrderAction(form: FormData): Promise<never> {
  const customerId=value(form,"customer_id"), warehouseId=value(form,"warehouse_id"), orderDate=value(form,"order_date");
  const notes=value(form,"notes");
  let items;
  try { items=validItems(value(form,"items")); } catch { redirect("/sales/new?error=invalid_items"); }
  if (!uuid(customerId) || !uuid(warehouseId) || !validDate(orderDate) || notes.length>2000) redirect("/sales/new?error=invalid_data");
  const {supabase,user,profile}=await getAuthenticatedContext();
  if (!user) redirect("/login");
  if (!profile) redirect("/sales?error=permission_denied");
  const {data,error}=await supabase.rpc("sales_create_order",{p_customer_id:customerId,p_warehouse_id:warehouseId,p_order_date:orderDate,p_notes:notes||null,p_items:items});
  if (error || !data) { console.error("Create Sales Order failed:",error); redirect("/sales/new?error=save_failed"); }
  revalidatePath("/sales");
  redirect(`/sales/${data}?created=1`);
}

export async function updateDraftSalesOrderAction(form: FormData): Promise<never> {
  const id=value(form,"sales_order_id"), customerId=value(form,"customer_id");
  const warehouseId=value(form,"warehouse_id"), orderDate=value(form,"order_date");
  const notes=value(form,"notes");
  if (!uuid(id)) redirect("/sales?error=invalid_id");
  let items;
  try { items=validItems(value(form,"items")); } catch { redirect(`/sales/${id}/edit?error=invalid_items`); }
  if (!uuid(customerId) || !uuid(warehouseId) || !validDate(orderDate) || notes.length>2000) {
    redirect(`/sales/${id}/edit?error=invalid_data`);
  }
  const {supabase,user,profile}=await getAuthenticatedContext();
  if (!user) redirect("/login");
  if (!profile) redirect(`/sales/${id}?error=permission_denied`);
  const {data,error}=await supabase.rpc("sales_update_draft_order",{
    p_sales_order_id:id,p_customer_id:customerId,p_warehouse_id:warehouseId,
    p_order_date:orderDate,p_notes:notes||null,p_items:items
  });
  if (error || !data) {
    console.error("Update draft Sales Order failed:",error);
    redirect(`/sales/${id}/edit?error=save_failed`);
  }
  revalidatePath("/sales");
  revalidatePath(`/sales/${id}`);
  redirect(`/sales/${id}?updated=1`);
}

export async function confirmSalesOrderAction(form: FormData): Promise<never> {
  const id=value(form,"sales_order_id");
  if (!uuid(id)) redirect("/sales?error=invalid_id");
  const {supabase,user,profile}=await getAuthenticatedContext();
  if (!user) redirect("/login");
  if (!profile) redirect(`/sales/${id}?error=permission_denied`);
  const {error}=await supabase.rpc("sales_confirm_order",{p_sales_order_id:id});
  if(error){console.error("Confirm SO failed:",error);redirect(`/sales/${id}?error=confirm_failed`);}
  revalidatePath("/sales"); revalidatePath(`/sales/${id}`);
  redirect(`/sales/${id}?confirmed=1`);
}

export async function cancelSalesOrderAction(form: FormData): Promise<never> {
  const id=value(form,"sales_order_id");
  if (!uuid(id)) redirect("/sales?error=invalid_id");
  const {supabase,user,profile}=await getAuthenticatedContext();
  if (!user) redirect("/login");
  if (!profile) redirect(`/sales/${id}?error=permission_denied`);
  const {error}=await supabase.rpc("sales_cancel_order",{p_sales_order_id:id});
  if(error){console.error("Cancel SO failed:",error);redirect(`/sales/${id}?error=cancel_failed`);}
  revalidatePath("/sales"); revalidatePath(`/sales/${id}`);
  redirect(`/sales/${id}?cancelled=1`);
}

export async function createDeliveryOrderAction(form: FormData): Promise<never> {
  const id=value(form,"sales_order_id"), raw=value(form,"items"), date=value(form,"delivery_date"), notes=value(form,"notes");
  if (!uuid(id) || !validDate(date) || notes.length>2000) redirect(`/sales/${id}?error=invalid_do`);
  let items: unknown;
  try { items=JSON.parse(raw); } catch { redirect(`/sales/${id}?error=invalid_do_items`); }
  if (!Array.isArray(items) || items.length<1 || items.length>100) redirect(`/sales/${id}?error=invalid_do_items`);
  for (const item of items) {
    if (!item || typeof item !== "object") redirect(`/sales/${id}?error=invalid_do_items`);
    const row=item as Record<string,unknown>;
    if (typeof row.sales_order_item_id!=="string" || !uuid(row.sales_order_item_id)) redirect(`/sales/${id}?error=invalid_do_items`);
    const qty=String(row.quantity??"");
    if (!/^\d{1,15}(?:\.\d{1,3})?$/.test(qty) || Number(qty)<=0) redirect(`/sales/${id}?error=invalid_do_items`);
    if (row.product_unit_id && (typeof row.product_unit_id!=="string" || !uuid(row.product_unit_id))) redirect(`/sales/${id}?error=invalid_do_items`);
  }
  const {supabase,user,profile}=await getAuthenticatedContext();
  if (!user) redirect("/login");
  if (!profile) redirect(`/sales/${id}?error=permission_denied`);
  const {data,error}=await supabase.rpc("sales_create_delivery_order",{p_sales_order_id:id,p_delivery_date:date,p_notes:notes||null,p_items:items});
  if(error || !data){console.error("Create DO failed:",error);redirect(`/sales/${id}?error=create_do_failed`);}
  revalidatePath("/sales"); revalidatePath(`/sales/${id}`);
  redirect(`/sales/${id}?delivery_order=${data}`);
}

export async function cancelDeliveryOrderAction(form: FormData): Promise<never> {
  const id=value(form,"delivery_order_id"), soId=value(form,"sales_order_id");
  const reason=value(form,"cancellation_reason");
  if(!uuid(id)||!uuid(soId)) redirect("/sales?error=invalid_id");
  if(reason.length<5||reason.length>500) redirect(`/sales/${soId}?error=invalid_do_cancel_reason`);
  const {supabase,user,profile}=await getAuthenticatedContext();
  if(!user) redirect("/login");
  if(!profile) redirect(`/sales/${soId}?error=permission_denied`);
  const {error}=await supabase.rpc("sales_cancel_delivery_order",{
    p_delivery_order_id:id,p_reason:reason
  });
  if(error){console.error("Cancel DO failed:",error);redirect(`/sales/${soId}?error=cancel_do_failed`);}
  revalidatePath("/sales"); revalidatePath(`/sales/${soId}`);
  redirect(`/sales/${soId}?do_cancelled=1`);
}

export async function completeDeliveryOrderAction(form: FormData): Promise<never> {
  const id=value(form,"delivery_order_id"), soId=value(form,"sales_order_id");
  if(!uuid(id)||!uuid(soId)) redirect("/sales?error=invalid_id");
  const {supabase,user,profile}=await getAuthenticatedContext();
  if(!user) redirect("/login");
  if(!profile) redirect(`/sales/${soId}?error=permission_denied`);
  const {error}=await supabase.rpc("sales_post_delivery_order",{p_delivery_order_id:id});
  if(error){console.error("Post DO failed:",error);redirect(`/sales/${soId}?error=post_do_failed`);}
  revalidatePath("/sales"); revalidatePath(`/sales/${soId}`);
  redirect(`/sales/${soId}?posted=1`);
}
