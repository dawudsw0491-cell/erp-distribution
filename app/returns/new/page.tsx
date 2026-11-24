import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import ReturnComposer from "../return-composer";

export const metadata = { title: "Buat Retur | HEXA CORE ERP" };
type Params = { type?: string; source_document_id?: string; error?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type ReturnSourceDocument = { id: string; documentNumber: string; documentDate: string; partyName: string };
type ReturnSourceLine = { id: string; product_name: string; tracking_type: "quantity" | "imei" | "serial"; variant_sku: string; variant_name: string; source_quantity: number; inventory_status: string; units: { id: string; unit_code: string }[]; suggested_unit_id: string | null; has_source_unit?: boolean };

export default async function NewReturnPage({searchParams}:{searchParams:Promise<Params>}) {
  await connection();
  const {supabase,user,profile}=await getAuthorizationContext("sales.view");
  if(!user) redirect("/login");
  if(!profile) return <div className="p-8">Akun tidak aktif.</div>;
  const params=await searchParams;
  const type=params.type==="supplier"?"supplier":"customer";
  const [{data:canCustomer},{data:canSupplier}]=await Promise.all([
    supabase.rpc("has_permission",{required_permission:"sales.return"}),
    supabase.rpc("has_permission",{required_permission:"purchasing.create"})
  ]);
  if(type==="customer"&&canCustomer!==true&&canSupplier===true) redirect("/returns/new?type=supplier");
  if(type==="customer"&&canCustomer!==true) return <div className="p-8">Akses customer return ditolak.</div>;
  if(type==="supplier"&&canSupplier!==true) return <div className="p-8">Akses supplier return ditolak.</div>;

  const [{data:deliveryOrders,error:doError},{data:goodsReceipts,error:grError}]=await Promise.all([
    type==="customer"
      ? supabase.from("delivery_orders").select("id,delivery_order_number,delivery_date,customers(customer_name)").eq("status","posted").order("delivery_date",{ascending:false}).limit(100)
      : Promise.resolve({data:[],error:null}),
    type==="supplier"
      ? supabase.from("goods_receipts").select("id,receipt_number,receipt_date,warehouse_id,suppliers(supplier_name)").eq("status","posted").order("receipt_date",{ascending:false}).limit(100)
      : Promise.resolve({data:[],error:null})
  ]);
  const sourceError=type==="customer"?doError:grError;
  const sourceDocs: ReturnSourceDocument[] = type === "customer"
    ? (deliveryOrders ?? []).map((doc) => ({
        id: doc.id,
        documentNumber: doc.delivery_order_number,
        documentDate: doc.delivery_date,
        partyName: (Array.isArray(doc.customers) ? doc.customers[0] : doc.customers)?.customer_name ?? "—",
      }))
    : (goodsReceipts ?? []).map((doc) => ({
        id: doc.id,
        documentNumber: doc.receipt_number,
        documentDate: doc.receipt_date,
        partyName: (Array.isArray(doc.suppliers) ? doc.suppliers[0] : doc.suppliers)?.supplier_name ?? "—",
      }));
  const sourceId=params.source_document_id??"";
  const selected=uuid.test(sourceId)?sourceDocs.find((row)=>row.id===sourceId):null;
  let sourceLines: ReturnSourceLine[] = [];
  let lineError="";
  if(selected&&type==="customer"){
    const {data,error}=await supabase.from("delivery_order_items").select("id,quantity,product_unit_id,products(product_name,tracking_type),product_variants(variant_sku,variant_name)").eq("delivery_order_id",selected.id).order("created_at");
    if(error) lineError=error.message;
    sourceLines=(data??[]).map((row)=>{
      const product=Array.isArray(row.products)?row.products[0]:row.products;
      const variant=Array.isArray(row.product_variants)?row.product_variants[0]:row.product_variants;
      return {id:row.id,product_name:product?.product_name??"Produk",tracking_type:product?.tracking_type === "imei" || product?.tracking_type === "serial" ? product.tracking_type : "quantity",variant_sku:variant?.variant_sku??"—",variant_name:variant?.variant_name??"",source_quantity:Number(row.quantity),inventory_status:"quarantine",units:[],suggested_unit_id:null,has_source_unit:Boolean(row.product_unit_id)};
    });
  }
  if(selected&&type==="supplier"){
    const {data,error}=await supabase.from("goods_receipt_items").select("id,quantity_received,inventory_status,purchase_order_items(product_variant_id,product_variants(id,variant_sku,variant_name,products(product_name,tracking_type))),goods_receipt_units(unit_code)").eq("goods_receipt_id",selected.id).order("created_at");
    if(error) lineError=error.message;
    sourceLines=(data??[]).map((row)=>{
      const poi=Array.isArray(row.purchase_order_items)?row.purchase_order_items[0]:row.purchase_order_items;
      const variant=Array.isArray(poi?.product_variants)?poi.product_variants[0]:poi?.product_variants;
      const product=Array.isArray(variant?.products)?variant.products[0]:variant?.products;
      const options=(row.goods_receipt_units??[]).map((unit)=>({id:unit.unit_code,unit_code:unit.unit_code}));
      return {id:row.id,product_name:product?.product_name??"Produk",tracking_type:product?.tracking_type??"quantity",variant_sku:variant?.variant_sku??"—",variant_name:variant?.variant_name??"",source_quantity:Number(row.quantity_received),inventory_status:row.inventory_status,units:options,suggested_unit_id:null};
    });
  }

  return <div className="min-h-screen bg-slate-100 md:flex"><ErpSidebar activePath="/returns"/><main className="min-w-0 flex-1 p-4 md:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <div><Link href="/returns" className="text-sm font-semibold text-blue-700">← Daftar Returns</Link><h1 className="mt-2 text-2xl font-bold">Buat Retur</h1><p className="mt-1 text-sm text-slate-500">Pilih dokumen sumber yang sudah diposting. Draft tidak mengubah stok.</p></div>
    {params.error&&<p className="rounded-lg border border-red-200 bg-white p-3 text-sm text-red-700">Permintaan gagal ({params.error}).</p>}
    <form className="grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2">
      <label className="text-sm font-medium">Jenis Retur<select name="type" defaultValue={type} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="customer" disabled={canCustomer!==true}>Customer Return</option><option value="supplier" disabled={canSupplier!==true}>Supplier Return</option></select></label>
      <label className="text-sm font-medium">Dokumen Sumber<select name="source_document_id" defaultValue={sourceId} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">Pilih dokumen posted</option>{sourceDocs.map((doc)=><option key={doc.id} value={doc.id}>{doc.documentNumber} · {doc.documentDate} · {doc.partyName}</option>)}</select></label>
      <div className="sm:col-span-2"><button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Muat Dokumen Sumber</button></div>
    </form>
    {sourceError?<p className="rounded-lg border border-red-200 bg-white p-4 text-sm text-red-700">Daftar dokumen sumber gagal dimuat.</p>:!sourceDocs.length?<p className="rounded-lg border bg-white p-5 text-sm text-slate-500">Tidak ada dokumen posted yang dapat dipilih atau akses data tidak tersedia.</p>:null}
    {selected&&lineError?<p className="rounded-lg border border-red-200 bg-white p-4 text-sm text-red-700">Detail sumber gagal dimuat. {lineError}</p>:null}
    {selected&&!lineError&&<><div className="rounded-xl border bg-white p-4 text-sm"><strong>{selected.documentNumber}</strong><p className="mt-1 text-slate-500">{type==="customer"?"Delivery Order":"Goods Receipt"} · {selected.documentDate}</p></div><ReturnComposer returnType={type} sourceDocumentId={selected.id} sourceLines={sourceLines}/></>}
  </div></main></div>;
}
