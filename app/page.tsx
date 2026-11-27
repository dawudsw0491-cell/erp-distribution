import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import DashboardClock from "@/components/layout/dashboard-clock";

type Product = { id: string; sku: string; product_name: string; minimum_stock: number | null; is_active: boolean };
type Balance = { product_id: string | null; warehouse_id: string; available_quantity: number | string | null; on_hand_quantity: number | string | null; inventory_value: number | string | null };
type SalesOrder = { id: string; sales_order_number: string; order_date: string; status: string; subtotal: number | string | null; sales_order_items?: { product_id: string; quantity: number | string }[] };

const number = (value: number) => Number(value || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });
const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value || 0);
const dateLabel = (value: Date) => new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(value);
const dayStart = (value: Date) => { const date = new Date(value); date.setHours(0, 0, 0, 0); return date; };

async function DashboardContent() {
  await connection();
  const [dashboard, master, inventory, sales] = await Promise.all([
    getAuthorizationContext("dashboard.view"),
    getAuthorizationContext("master.view"),
    getAuthorizationContext("inventory.view"),
    getAuthorizationContext("sales.view"),
  ]);
  if (!dashboard.user) redirect("/login");
  if (!dashboard.profile || !dashboard.authorized) return <main className="flex min-h-screen items-center justify-center bg-slate-100"><p className="rounded-xl border bg-white p-8">Akses Dashboard ditolak.</p></main>;

  const canMaster = Boolean(master.user && master.profile && master.authorized);
  const canInventory = Boolean(inventory.user && inventory.profile && inventory.authorized);
  const canSales = Boolean(sales.user && sales.profile && sales.authorized);
  const now = new Date();
  const today = dayStart(now);
  const dateKey = (value: Date) => value.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [productResult, balanceResult, salesHistoryResult, salesWeekResult] = await Promise.all([
    canMaster ? master.supabase.from("products").select("id,sku,product_name,minimum_stock,is_active").eq("is_active", true).order("product_name").limit(2000) : Promise.resolve({ data: null, error: null }),
    canInventory ? inventory.supabase.from("inventory_balances").select("product_id,available_quantity,on_hand_quantity,inventory_value").limit(5000) : Promise.resolve({ data: null, error: null }),
    canSales ? sales.supabase.from("sales_orders").select("id,order_date,status,subtotal,sales_order_items(product_id,quantity)").in("status", ["confirmed", "partially_delivered", "delivered", "partially_returned", "returned"]).order("order_date", { ascending: false }).limit(2000) : Promise.resolve({ data: null, error: null }),
    canSales ? sales.supabase.from("sales_orders").select("id,order_date,subtotal").in("status", ["confirmed", "partially_delivered", "delivered", "partially_returned", "returned"]).gte("order_date", dateKey(sevenDaysAgo)).lte("order_date", dateKey(today)).order("order_date", { ascending: true }).limit(2000) : Promise.resolve({ data: null, error: null }),
  ]);

  const products = (productResult.data ?? []) as Product[];
  const rawBalances = (balanceResult.data ?? []) as Balance[];
  const balanceWarehouseIds = Array.from(new Set(rawBalances.map((row) => row.warehouse_id).filter(Boolean)));
  const warehouseChecks = canInventory
    ? await Promise.all(balanceWarehouseIds.map(async (warehouseId) => {
        const result = await inventory.supabase.rpc("has_warehouse_access", { target_warehouse_id: warehouseId });
        return { warehouseId, allowed: !result.error && result.data === true, hasError: Boolean(result.error) };
      }))
    : [];
  const allowedWarehouseIds = new Set(warehouseChecks.filter((item) => item.allowed).map((item) => item.warehouseId));
  const balances = rawBalances.filter((row) => allowedWarehouseIds.has(row.warehouse_id));
  const warehouseScopeError = warehouseChecks.some((item) => item.hasError);
  const salesHistory = (salesHistoryResult.data ?? []) as SalesOrder[];
  const salesWeek = (salesWeekResult.data ?? []) as Pick<SalesOrder, "id" | "order_date" | "subtotal">[];
  const masterError = Boolean(productResult.error);
  const inventoryError = Boolean(balanceResult.error || warehouseScopeError);
  const salesError = Boolean(salesHistoryResult.error || salesWeekResult.error);

  const stockByProduct = new Map<string, number>();
  for (const row of balances) {
    if (row.product_id) stockByProduct.set(row.product_id, (stockByProduct.get(row.product_id) ?? 0) + Number(row.available_quantity ?? 0));
  }
  const totalAvailable = balances.reduce((sum, row) => sum + Number(row.available_quantity ?? 0), 0);
  const totalOnHand = balances.reduce((sum, row) => sum + Number(row.on_hand_quantity ?? 0), 0);
  const totalValue = balances.reduce((sum, row) => sum + Number(row.inventory_value ?? 0), 0);

  const lowStock = products.map((product) => ({
    ...product,
    available: stockByProduct.get(product.id) ?? 0,
    minimum: Number(product.minimum_stock ?? 0),
  })).filter((product) => product.minimum > 0 && product.available <= product.minimum)
    .sort((a, b) => a.available - b.available).slice(0, 8);

  const lastSale = new Map<string, string>();
  const soldByProduct = new Map<string, number>();
  for (const order of salesHistory) {
    for (const line of order.sales_order_items ?? []) {
      const previous = lastSale.get(line.product_id);
      if (!previous || order.order_date > previous) lastSale.set(line.product_id, order.order_date);
      soldByProduct.set(line.product_id, (soldByProduct.get(line.product_id) ?? 0) + Number(line.quantity ?? 0));
    }
  }
  const slowMoving = products.map((product) => {
    const last = lastSale.get(product.id);
    const days = last ? Math.max(0, Math.floor((today.getTime() - dayStart(new Date(last)).getTime()) / 86400000)) : null;
    return { ...product, last, days };
  }).filter((product) => product.days === null || product.days > 5)
    .sort((a, b) => (b.days ?? 99999) - (a.days ?? 99999)).slice(0, 8);

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(sevenDaysAgo);
    date.setDate(date.getDate() + index);
    const key = dateKey(date);
    return { key, label: dateLabel(date), value: salesWeek.filter((order) => order.order_date === key).reduce((sum, order) => sum + Number(order.subtotal ?? 0), 0) };
  });
  const maxSales = Math.max(1, ...days.map((item) => item.value));
  const todaySales = salesWeek.filter((order) => order.order_date === dateKey(today)).reduce((sum, order) => sum + Number(order.subtotal ?? 0), 0);
  const monthOrders = salesHistory.filter((order) => order.order_date >= dateKey(monthStart) && order.order_date <= dateKey(today));
  const monthSales = monthOrders.reduce((sum, order) => sum + Number(order.subtotal ?? 0), 0);
  const displayName = dashboard.profile.full_name?.trim() || dashboard.user.email || "Pengguna";

  const cards = [
    { title: "Produk Aktif", value: canMaster ? (masterError ? "Gagal dimuat" : number(products.length)) : "—", note: "Produk pada Master Data", href: "/master-data" },
    { title: "Stok Tersedia", value: canInventory ? (inventoryError ? "Gagal dimuat" : number(totalAvailable)) : "—", note: "Unit yang dapat digunakan", href: "/inventory/balances" },
    { title: "Penjualan Hari Ini", value: canSales ? (salesError ? "Gagal dimuat" : money(todaySales)) : "—", note: "Sales Order non-draft hari ini", href: "/sales" },
    { title: "Penjualan Bulan Ini", value: canSales ? (salesError ? "Gagal dimuat" : money(monthSales)) : "—", note: number(monthOrders.length) + " transaksi bulan berjalan", href: "/sales" },
  ];

  return <div className="min-h-screen bg-slate-100 text-slate-800 md:flex">
    <ErpSidebar activePath="/" />
    <main className="min-w-0 flex-1">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 md:px-8">
        <div><h1 className="text-xl font-bold text-slate-900">Dashboard</h1><p className="mt-1 text-sm text-slate-500">Ringkasan operasional dan kinerja bisnis</p></div>
        <div className="flex flex-wrap items-center gap-4"><DashboardClock /><div className="text-right"><p className="text-sm font-semibold">{displayName}</p><p className="text-xs text-slate-500">Pengguna ERP</p></div></div>
      </header>
      <div className="mx-auto max-w-[1600px] space-y-6 p-5 md:p-8">
        <section className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">Ringkasan Operasional</h2><p className="mt-1 text-sm text-slate-500">Angka mengikuti hak akses akun dan data transaksi yang tersedia.</p></div><p className="text-xs text-slate-500">Diperbarui {new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: "Asia/Jakarta" }).format(now)}</p></section>
        {(masterError || inventoryError || salesError) && <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Sebagian data gagal dimuat. Nilai yang tidak tersedia tidak ditampilkan sebagai nol.</p>}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => <Link key={card.title} href={card.href} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"><div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-500">{card.title}</p><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-xl text-slate-700">▦</span></div><p className="mt-4 break-words text-2xl font-bold text-slate-900">{card.value}</p><p className="mt-2 text-xs text-slate-500">{card.note}</p></Link>)}</section>
        <section className="grid gap-6 xl:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-bold text-slate-900">Grafik Penjualan 7 Hari</h3><p className="mt-1 text-sm text-slate-500">Nilai Sales Order berdasarkan tanggal transaksi</p></div><span className="text-sm font-semibold">{canSales && !salesError ? money(days.reduce((sum, item) => sum + item.value, 0)) : "—"}</span></div>
            {canSales && !salesError ? <div className="mt-6 grid h-56 grid-cols-7 items-end gap-3 border-b border-slate-200 pb-2">{days.map((item) => <div key={item.key} className="flex h-full flex-col items-center justify-end gap-2"><span className="text-center text-[10px] text-slate-500">{item.value > 0 ? money(item.value) : "—"}</span><div className="flex w-full flex-1 items-end"><div title={item.label + ": " + money(item.value)} className="w-full rounded-t-md bg-blue-600" style={{ height: (item.value > 0 ? Math.max(4, item.value / maxSales * 100) : 0) + "%" }} /></div><span className="text-xs text-slate-500">{item.label}</span></div>)}</div> : <p className="mt-6 rounded-lg bg-slate-50 p-6 text-sm text-slate-500">{canSales ? "Data penjualan gagal dimuat." : "Akses data penjualan tidak tersedia."}</p>}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-bold text-slate-900">Ringkasan Persediaan</h3><p className="mt-1 text-sm text-slate-500">Saldo gudang yang dapat diakses</p><div className="mt-5 space-y-4"><div><p className="text-xs text-slate-500">Unit tersedia</p><p className="mt-1 text-2xl font-bold">{canInventory && !inventoryError ? number(totalAvailable) : "—"}</p></div><div><p className="text-xs text-slate-500">Unit seluruh status</p><p className="mt-1 text-xl font-semibold">{canInventory && !inventoryError ? number(totalOnHand) : "—"}</p></div><div><p className="text-xs text-slate-500">Nilai persediaan</p><p className="mt-1 text-lg font-semibold">{canInventory && !inventoryError ? money(totalValue) : "—"}</p></div><Link href="/inventory/balances" className="inline-flex text-sm font-semibold text-blue-700 hover:underline">Lihat saldo persediaan →</Link></div></div>
        </section>
        <section className="grid gap-6 xl:grid-cols-2">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h3 className="font-bold text-slate-900">Produk Stok Rendah</h3><p className="mt-1 text-sm text-slate-500">Stok tersedia sama dengan atau di bawah batas minimum produk</p></div>{!canMaster || !canInventory ? <p className="p-5 text-sm text-slate-500">Akses Master Data dan Persediaan diperlukan.</p> : masterError || inventoryError ? <p className="p-5 text-sm text-red-700">Data stok rendah gagal dimuat.</p> : lowStock.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">Tidak ada produk di bawah batas minimum.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3">Produk</th><th className="px-5 py-3">Stok tersedia</th><th className="px-5 py-3">Batas minimum</th></tr></thead><tbody className="divide-y divide-slate-100">{lowStock.map((item) => <tr key={item.id}><td className="px-5 py-3"><p className="font-semibold">{item.product_name}</p><p className="text-xs text-slate-500">{item.sku}</p></td><td className="px-5 py-3 font-semibold text-amber-700">{number(item.available)}</td><td className="px-5 py-3">{number(item.minimum)}</td></tr>)}</tbody></table></div>}<div className="border-t border-slate-100 px-5 py-3"><Link href="/inventory/balances" className="text-sm font-semibold text-blue-700 hover:underline">Buka Stock Balance →</Link></div></div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h3 className="font-bold text-slate-900">Produk Lambat Terjual</h3><p className="mt-1 text-sm text-slate-500">Tidak ada penjualan lebih dari 5 hari berdasarkan maksimal 2.000 Sales Order terbaru</p></div>{!canMaster || !canSales ? <p className="p-5 text-sm text-slate-500">Akses Master Data dan Penjualan diperlukan.</p> : masterError || salesError ? <p className="p-5 text-sm text-red-700">Data perputaran produk gagal dimuat.</p> : slowMoving.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">Belum ada produk dengan jeda penjualan lebih dari 5 hari.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3">Produk</th><th className="px-5 py-3">Penjualan terakhir</th><th className="px-5 py-3">Hari tanpa penjualan</th></tr></thead><tbody className="divide-y divide-slate-100">{slowMoving.map((item) => <tr key={item.id}><td className="px-5 py-3"><p className="font-semibold">{item.product_name}</p><p className="text-xs text-slate-500">{item.sku}</p></td><td className="px-5 py-3">{item.last ? dateLabel(new Date(item.last)) : "Belum pernah tercatat"}</td><td className="px-5 py-3 font-semibold text-amber-700">{item.days === null ? "Belum ada" : number(item.days) + " hari"}</td></tr>)}</tbody></table></div>}<div className="border-t border-slate-100 px-5 py-3"><Link href="/sales" className="text-sm font-semibold text-blue-700 hover:underline">Buka Penjualan →</Link></div></div>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-bold text-slate-900">Produk Paling Banyak Terjual</h3><p className="mt-1 text-sm text-slate-500">Jumlah unit dari maksimal 2.000 Sales Order terbaru</p></div><Link href="/sales" className="text-sm font-semibold text-blue-700 hover:underline">Lihat transaksi →</Link></div>{!canSales || salesError ? <p className="mt-4 text-sm text-slate-500">Data penjualan tidak tersedia untuk menghitung perputaran.</p> : soldByProduct.size === 0 ? <p className="mt-4 text-sm text-slate-500">Belum ada data unit terjual.</p> : <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from(soldByProduct.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id, quantity]) => <div key={id} className="rounded-lg border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-semibold">{products.find((product) => product.id === id)?.product_name ?? "Produk"}</p><p className="mt-2 text-xl font-bold">{number(quantity)} unit</p><p className="text-xs text-slate-500">Jumlah pada Sales Order terbaca</p></div>)}</div>}</section>
        <footer className="pb-4 text-center text-xs text-slate-400">HEXA CORE · Ringkasan operasional</footer>
      </div>
    </main>
  </div>;
}

export default function Home() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-slate-100"><p className="text-sm text-slate-500">Memuat Dashboard...</p></main>}><DashboardContent /></Suspense>;
}
