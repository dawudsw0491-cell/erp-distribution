"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/auth/authorization";

function field(form: FormData, key: string) { return String(form.get(key) ?? "").trim(); }
function uuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function createReturnDraftAction(form: FormData): Promise<never> {
  const type = field(form, "return_type");
  const sourceId = field(form, "source_document_id");
  const date = field(form, "return_date");
  const reason = field(form, "reason");
  const notes = field(form, "notes");
  let items: unknown;
  try { items = JSON.parse(field(form, "items")); } catch { redirect("/returns/new?error=invalid_items"); }
  if (!["customer", "supplier"].includes(type) || !uuid(sourceId) || !validDate(date) ||
      !reason || reason.length > 500 || notes.length > 2000 ||
      !Array.isArray(items) || items.length < 1 || items.length > 100) {
    redirect("/returns/new?error=invalid_data");
  }
  const permission = type === "customer" ? "sales.return" : "purchasing.create";
  const { supabase, user, profile, authorized } = await getAuthorizationContext(permission);
  if (!user) redirect("/login");
  if (!profile || !authorized) redirect("/returns?error=permission_denied");
  const { data, error } = await supabase.rpc("sales_return_create_draft", {
    p_return_type: type,
    p_source_document_id: sourceId,
    p_return_date: date,
    p_reason: reason,
    p_notes: notes || null,
    p_items: items,
  });
  if (error || !data) {
    console.error("Create return draft failed:", error);
    redirect("/returns/new?error=save_failed");
  }
  revalidatePath("/returns");
  redirect(`/returns/${data}?created=1`);
}

export async function approveReturnAction(form: FormData): Promise<never> {
  const id = field(form, "return_id");
  if (!uuid(id)) redirect("/returns?error=invalid_id");
  const { supabase, user, profile } = await getAuthorizationContext("sales.view");
  if (!user) redirect("/login");
  if (!profile) redirect("/returns?error=permission_denied");
  const { error } = await supabase.rpc("sales_return_approve", { p_return_id: id });
  if (error) {
    console.error("Approve return failed:", error);
    redirect(`/returns/${id}?error=approval_failed`);
  }
  revalidatePath("/returns");
  revalidatePath(`/returns/${id}`);
  redirect(`/returns/${id}?approved=1`);
}

export async function processReturnAction(form: FormData): Promise<never> {
  const id = field(form, "return_id");
  if (!uuid(id)) redirect("/returns?error=invalid_id");
  const { supabase, user, profile, authorized } = await getAuthorizationContext("finance.approve");
  if (!user) redirect("/login");
  if (!profile || !authorized) redirect(`/returns/${id}?error=permission_denied`);
  const { error } = await supabase.rpc("sales_return_post", { p_return_id: id });
  if (error) {
    console.error("Post return failed:", error);
    redirect(`/returns/${id}?error=posting_failed`);
  }
  revalidatePath("/returns");
  revalidatePath(`/returns/${id}`);
  revalidatePath("/inventory/balances");
  revalidatePath("/inventory/movements");
  redirect(`/returns/${id}?posted=1`);
}

export async function cancelReturnDraftAction(form: FormData): Promise<never> {
  const id = field(form, "return_id");
  if (!uuid(id)) redirect("/returns?error=invalid_id");
  const { supabase, user, profile } = await getAuthorizationContext("sales.view");
  if (!user) redirect("/login");
  if (!profile) redirect("/returns?error=permission_denied");
  const { error } = await supabase.rpc("sales_return_cancel_draft", { p_return_id: id });
  if (error) {
    console.error("Cancel return draft failed:", error);
    redirect(`/returns/${id}?error=cancel_failed`);
  }
  revalidatePath("/returns");
  revalidatePath(`/returns/${id}`);
  redirect("/returns?cancelled=1");
}
