"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthenticatedContext } from "@/lib/auth/authorization";

function field(form: FormData, key: string) { return String(form.get(key) ?? "").trim(); }
function uuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function date(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === value;
}

export async function createInvoiceAction(form: FormData): Promise<never> {
  const deliveryOrderId = field(form,"delivery_order_id");
  const invoiceDate = field(form,"invoice_date");
  const dueDate = field(form,"due_date");
  const notes = field(form,"notes");
  let items: unknown;
  try { items = JSON.parse(field(form,"items")); } catch { redirect("/sales/invoices?error=invalid_items"); }
  if (!uuid(deliveryOrderId) || !date(invoiceDate) || (dueDate && !date(dueDate)) || (dueDate && dueDate < invoiceDate) || notes.length > 2000 || !Array.isArray(items) || items.length < 1 || items.length > 100) {
    redirect("/sales/invoices?error=invalid_data");
  }
  const {supabase,user,profile}=await getAuthenticatedContext();
  if(!user) redirect("/login");
  if(!profile) redirect("/sales/invoices?error=permission_denied");
  const {data,error}=await supabase.rpc("sales_create_invoice",{
    p_delivery_order_id:deliveryOrderId,p_invoice_date:invoiceDate,p_due_date:dueDate||null,p_notes:notes||null,p_items:items
  });
  if(error||!data){console.error("Create invoice failed",error);redirect("/sales/invoices?error=save_failed");}
  revalidatePath("/sales/invoices");
  redirect(`/sales/invoices/${data}?created=1`);
}

export async function recordInvoicePaymentAction(form: FormData): Promise<never> {
  const invoiceId=field(form,"invoice_id"), paymentDate=field(form,"payment_date");
  const amount=field(form,"amount"), method=field(form,"payment_method");
  const reference=field(form,"reference_number"), notes=field(form,"notes");
  if(!uuid(invoiceId)||!date(paymentDate)||!/^\d{1,16}(?:\.\d{1,2})?$/.test(amount)||Number(amount)<=0||reference.length>120||notes.length>2000) {
    redirect(`/sales/invoices/${invoiceId}?error=invalid_payment`);
  }
  const {supabase,user,profile}=await getAuthenticatedContext();
  if(!user) redirect("/login");
  if(!profile) redirect(`/sales/invoices/${invoiceId}?error=permission_denied`);
  const {error}=await supabase.rpc("sales_record_invoice_payment",{
    p_invoice_id:invoiceId,p_payment_date:paymentDate,p_amount:amount,p_payment_method:method,
    p_reference_number:reference||null,p_notes:notes||null
  });
  if(error){console.error("Record invoice payment failed",error);redirect(`/sales/invoices/${invoiceId}?error=payment_failed`);}
  revalidatePath("/sales/invoices");
  revalidatePath(`/sales/invoices/${invoiceId}`);
  redirect(`/sales/invoices/${invoiceId}?paid=1`);
}
