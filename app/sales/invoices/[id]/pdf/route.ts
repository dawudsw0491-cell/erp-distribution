import {NextRequest,NextResponse} from "next/server";
import {getAuthorizationContext} from "@/lib/auth/authorization";

const clean=(value:unknown)=>String(value??"—").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^\x20-\x7E]/g," ").replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)").replace(/\s+/g," ").trim();
const money=(value:unknown)=>"Rp "+new Intl.NumberFormat("id-ID",{maximumFractionDigits:0}).format(Number(value??0));
function makePdf(lines:string[]){
 const commands=["BT","/F1 10 Tf","50 800 Td","14 TL"];
 for(const line of lines){commands.push(`(${clean(line)}) Tj`,"T*");}
 commands.push("ET");
 const stream=commands.join("\n");
 const objects=[
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`
 ];
 let pdf="%PDF-1.4\n";
 const offsets=[0];
 objects.forEach((obj,i)=>{offsets.push(new TextEncoder().encode(pdf).length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
 const xref=new TextEncoder().encode(pdf).length;
 pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
 for(let i=1;i<offsets.length;i++)pdf+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
 pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return new TextEncoder().encode(pdf);
}
export async function GET(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return NextResponse.json({error:"Invalid invoice id"},{status:400});
 const {supabase,user,profile,authorized}=await getAuthorizationContext("sales.view");
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 if(!profile||!authorized)return NextResponse.json({error:"Forbidden"},{status:403});
 const {data:invoice,error}=await supabase.from("sales_invoices").select("*,customers(customer_code,customer_name,phone,email,address,tax_number),warehouses(warehouse_name)").eq("id",id).maybeSingle();
 if(error||!invoice)return NextResponse.json({error:"Invoice not found"},{status:404});
 const [{data:items,error:itemError}]=await Promise.all([supabase.from("sales_invoice_items").select("*").eq("invoice_id",id).order("created_at")]);
 if(itemError)return NextResponse.json({error:"Invoice details unavailable"},{status:500});
 const customer=Array.isArray(invoice.customers)?invoice.customers[0]:invoice.customers;
 const warehouse=Array.isArray(invoice.warehouses)?invoice.warehouses[0]:invoice.warehouses;
 const balance=Number(invoice.subtotal)-Number(invoice.paid_amount);
 const content=[
  "HEXA CORE",
  "INVOICE / DOKUMEN PENAGIHAN PENJUALAN",
  "",
  "Nomor Invoice : "+invoice.invoice_number,
  "Tanggal       : "+invoice.invoice_date,
  "Jatuh Tempo   : "+(invoice.due_date??"—"),
  "Status        : "+invoice.status,
  "",
  "DITAGIHKAN KEPADA",
  customer?.customer_name??"—",
  "Kode Pelanggan: "+(customer?.customer_code??"—"),
  "Alamat        : "+(customer?.address??"—"),
  "Telepon       : "+(customer?.phone??"—"),
  "NPWP          : "+(customer?.tax_number??"—"),
  "",
  "INFORMASI PENGIRIMAN",
  "Gudang        : "+(warehouse?.warehouse_name??"—"),
  "Sumber        : Delivery Order",
  "Catatan       : "+(invoice.notes??"—"),
  "",
  "PRODUK / VARIAN                         SKU              QTY        HARGA          JUMLAH",
  "--------------------------------------------------------------------------------------",
  ...(items??[]).map((item:any)=>clean(item.product_name_snapshot+" / "+item.variant_name_snapshot+" | "+item.variant_sku_snapshot+" | "+item.quantity+" Unit | "+money(item.unit_price)+" | "+money(item.line_total))),
  "",
  "Subtotal      : "+money(invoice.subtotal),
  "Sudah dibayar : "+money(invoice.paid_amount),
  "Sisa tagihan  : "+money(balance),
  "",
  "Disiapkan oleh,                              Diterima oleh,",
  "",
  "",
  "HEXA CORE                                    Pelanggan"
 ];
 const bytes=makePdf(content);
 return new NextResponse(bytes,{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${clean(invoice.invoice_number).replace(/ /g,"-")}.pdf"`,"Cache-Control":"private, no-store"}});
}
