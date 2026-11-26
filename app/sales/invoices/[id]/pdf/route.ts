import {NextRequest,NextResponse} from "next/server";
import {getAuthorizationContext} from "@/lib/auth/authorization";

const PAGE_W=595, PAGE_H=842;
const clean=(value:unknown)=>String(value??"—").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^\x20-\x7E]/g," ").replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)").replace(/\s+/g," ").trim();
const money=(value:unknown)=>"Rp "+new Intl.NumberFormat("id-ID",{maximumFractionDigits:0}).format(Number(value??0));
const raw=(value:unknown)=>String(value??"—").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^\x20-\x7E]/g," ").replace(/\s+/g," ").trim();
const wrap=(value:unknown,max:number)=>{const words=raw(value).split(/\s+/);const out:string[]=[];let line="";for(const word of words){const next=line?line+" "+word:word;if(next.length>max&&line){out.push(line);line=word;}else line=next;}if(line)out.push(line);return out.length?out:["—"];};

function makePdf(invoice:any,customer:any,warehouse:any,items:any[],balance:number){
 const pages:string[][]=[];let c:string[]=[];let y=0;
 const addPage=()=>{c=[];pages.push(c);y=0;};
 const text=(x:number,top:number,size:number,value:unknown,bold=false,color="[0.12 0.17 0.25]")=>{c.push(`BT ${color} rg /${bold?"F2":"F1"} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${(PAGE_H-top-size).toFixed(2)} Tm (${clean(value)}) Tj ET`);};
 const rect=(x:number,top:number,w:number,h:number,fill:string)=>c.push(`${fill} rg ${x} ${PAGE_H-top-h} ${w} ${h} re f`);
 const line=(x1:number,top1:number,x2:number,top2:number,color="[0.84 0.87 0.91]",width=0.7)=>c.push(`${color} RG ${width} w ${x1} ${PAGE_H-top1} m ${x2} ${PAGE_H-top2} l S`);
 const label=(x:number,top:number,value:string)=>text(x,top,7,value,true,"[0.40 0.46 0.54]");
 const value=(x:number,top:number,v:unknown,size=9,bold=false)=>text(x,top,size,v,bold);
 const header=(continued=false)=>{rect(0,0,PAGE_W,112,"[0.07 0.13 0.23]");rect(0,108,PAGE_W,4,"[0.12 0.42 0.78]");text(38,27,10,"HEXA CORE",true,"[1 1 1]");text(38,45,7,"DISTRIBUTION  /  SALES DOCUMENT",false,"[0.72 0.80 0.90]");text(38,70,21,continued?"INVOICE  /  LANJUTAN":"INVOICE",true,"[1 1 1]");text(405,31,7,"NOMOR INVOICE",true,"[0.72 0.80 0.90]");text(405,47,11,invoice.invoice_number,true,"[1 1 1]");text(405,68,8,"TANGGAL  "+invoice.invoice_date,false,"[1 1 1]");y=132;};
 const tableHeader=()=>{rect(38,y,519,25,"[0.13 0.20 0.31]");text(48,y+8,7,"DESKRIPSI PRODUK",true,"[1 1 1]");text(326,y+8,7,"SKU",true,"[1 1 1]");text(414,y+8,7,"QTY",true,"[1 1 1]");text(452,y+8,7,"HARGA",true,"[1 1 1]");text(515,y+8,7,"JUMLAH",true,"[1 1 1]");y+=25;};
 addPage();header();
 // Invoice status and due date
 rect(38,y,519,48,"[0.95 0.97 0.99]");
 label(50,y+9,"STATUS");value(50,y+23,({issued:"BELUM LUNAS",partially_paid:"DIBAYAR SEBAGIAN",paid:"LUNAS",void:"VOID"} as Record<string,string>)[invoice.status]??invoice.status,9,true);
 label(245,y+9,"JATUH TEMPO");value(245,y+23,invoice.due_date??"—",9,true);
 label(425,y+9,"MATA UANG");value(425,y+23,"IDR / RUPIAH",9,true);y+=62;
 // Customer and shipping panels
 const leftX=38,rightX=304,panelW=253,panelTop=y;
 const customerAddress=wrap(customer?.address,43), customerName=wrap(customer?.customer_name,39);
 const customerRows=[...customerName,...customerAddress,"Telp: "+(customer?.phone??"—"),"Kode: "+(customer?.customer_code??"—"),"NPWP: "+(customer?.tax_number??"—")];
 const rightRows=["Gudang: "+(warehouse?.warehouse_name??"—"),"Sumber dokumen: Delivery Order",...wrap("Catatan: "+(invoice.notes??"—"),38)];
 const panelH=Math.max(116,30+Math.max(customerRows.length,rightRows.length)*13+12);
 rect(leftX,panelTop,panelW,panelH,"[0.97 0.98 0.99]");rect(rightX,panelTop,panelW,panelH,"[0.97 0.98 0.99]");
 rect(leftX,panelTop,3,panelH,"[0.12 0.42 0.78]");rect(rightX,panelTop,3,panelH,"[0.12 0.42 0.78]");
 label(leftX+13,panelTop+12,"DITAGIHKAN KEPADA");label(rightX+13,panelTop+12,"INFORMASI PENGIRIMAN");
 customerRows.forEach((r,i)=>value(leftX+13,panelTop+29+i*13,r,8,i===0));
 rightRows.forEach((r,i)=>value(rightX+13,panelTop+29+i*13,r,8,i===0));
 y=panelTop+panelH+24;
 text(38,y,10,"RINCIAN BARANG",true,"[0.12 0.17 0.25]");text(38,y+14,7,"Daftar item yang ditagihkan pada invoice ini",false,"[0.40 0.46 0.54]");y+=26;
 tableHeader();
 for(let i=0;i<items.length;i++){
  const item=items[i];const desc=wrap([item.product_name_snapshot,item.variant_name_snapshot].filter(Boolean).join(" / "),43);
  const sku=wrap(item.variant_sku_snapshot,13);const rowLines=Math.max(desc.length,sku.length,1);const rowH=Math.max(32,rowLines*11+15);
  if(y+rowH>700){text(520,815,"LANJUTAN",true, "[0.45 0.50 0.58]");addPage();header(true);tableHeader();}
  if(i%2===0)rect(38,y,519,rowH,"[0.97 0.98 0.99]");
  desc.forEach((v,j)=>value(48,y+9+j*11,v,7.5,j===0));
  sku.forEach((v,j)=>value(326,y+9+j*11,v,7));
  value(414,y+9,String(item.quantity)+" Unit",7);
  value(452,y+9,money(item.unit_price),6.7);
  value(515,y+9,money(item.line_total),6.7,true);
  line(38,y+rowH,557,y+rowH);y+=rowH;
 }
 if(y+166>790){addPage();header(true);}
 y+=18;
 const totalX=340,totalW=217;
 rect(totalX,y,totalW,100,"[0.95 0.97 0.99]");
 label(totalX+13,y+13,"RINGKASAN TAGIHAN");
 value(totalX+13,y+33,"Subtotal",8);text(totalX+totalW-13-85,y+33,8,money(invoice.subtotal),true);
 value(totalX+13,y+51,"Sudah dibayar",8);text(totalX+totalW-13-85,y+51,8,money(invoice.paid_amount),true);
 line(totalX+12,y+61,totalX+totalW-12,y+61);
 text(totalX+13,y+73,8,"SISA TAGIHAN",true,"[0.12 0.17 0.25]");
 text(totalX+totalW-13-110,y+72,10,money(balance),true,"[0.07 0.30 0.58]");
 y+=121;
 // Signature area
 text(64,y,8,"DIBUAT OLEH",true,"[0.40 0.46 0.54]");text(370,y,8,"DITERIMA OLEH",true,"[0.40 0.46 0.54]");
 line(64,y+61,225,y+61);line(370,y+61,531,y+61);
 value(64,y+68,"HEXA CORE",8,true);value(370,y+68,"Pelanggan",8,true);
 // Footer on every page
 pages.forEach((page,index)=>{page.push("[0.84 0.87 0.91] RG 0.7 w 38 37 m 557 37 l S");page.push(`BT [0.42 0.47 0.54] rg /F1 7 Tf 1 0 0 1 38 22 Tm (HEXA CORE  |  DOKUMEN PENJUALAN) Tj ET`);page.push(`BT [0.42 0.47 0.54] rg /F1 7 Tf 1 0 0 1 510 22 Tm (HALAMAN ${index+1} / ${pages.length}) Tj ET`);});
 const objects:string[]=["<< /Type /Catalog /Pages 2 0 R >>",""];
 const pageIds:number[]=[];
 for(let i=0;i<pages.length;i++){const pageId=objects.length+1,contentId=objects.length+2;pageIds.push(pageId);const stream=pages[i].join("\n");objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${objects.length+1} 0 R /F2 ${objects.length+2} 0 R >> >> /Contents ${contentId} 0 R >>`);objects.push(`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`);}
 objects[1]=`<< /Type /Pages /Kids [${pageIds.map(id=>id+" 0 R").join(" ")}] /Count ${pages.length} >>`;
 objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
 let pdf="%PDF-1.4\n";const offsets=[0];objects.forEach((obj,i)=>{offsets.push(new TextEncoder().encode(pdf).length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
 const xref=new TextEncoder().encode(pdf).length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;for(let i=1;i<offsets.length;i++)pdf+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
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
 const {data:items,error:itemError}=await supabase.from("sales_invoice_items").select("*").eq("invoice_id",id).order("created_at");
 if(itemError)return NextResponse.json({error:"Invoice details unavailable"},{status:500});
 const customer=Array.isArray(invoice.customers)?invoice.customers[0]:invoice.customers;
 const warehouse=Array.isArray(invoice.warehouses)?invoice.warehouses[0]:invoice.warehouses;
 const balance=Number(invoice.subtotal)-Number(invoice.paid_amount);
 const bytes=makePdf(invoice,customer,warehouse,items??[],balance);
 return new NextResponse(bytes,{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${clean(invoice.invoice_number).replace(/ /g,"-")}.pdf"`,"Cache-Control":"private, no-store"}});
}
