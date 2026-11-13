
import { connection } from "next/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getAuthorizationContext } from "@/lib/auth/authorization";
import ErpSidebar from "@/components/layout/erp-sidebar";

import GoodsReceiptForm, {
  type GoodsReceiptFormItem,
} from "../goods-receipt-form";

export const instant = false;

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

type PurchaseOrderRow = {
  id: string;
  po_number: string;
  supplier_id: string;
  warehouse_id: string;
  status: string;
};

type PurchaseOrderItemRow = {
  id: string;
  product_variant_id: string;
  quantity: number;
  received_quantity: number;
  unit_cost: number;
  discount_amount: number;
  tax_amount: number;
};

type VariantRow = {
  id: string;
  product_id: string;
  variant_sku: string;
  variant_name: string;
};

type ProductRow = {
  id: string;
  sku: string;
  product_name: string;
  tracking_type: string;
};

type SupplierRow = {
  id: string;
  supplier_code: string;
  supplier_name: string;
};

type WarehouseRow = {
  id: string;
  warehouse_code: string;
  warehouse_name: string;
};

type GoodsReceiptDraftItem = {
  purchase_order_item_id: string;
  quantity_received: number;
};

const errorMessages: Record<string, string> = {
  invalid_id: "Purchase Order ID tidak valid.",
  permission_denied: "Anda tidak memiliki izin membuat Goods Receipt.",
  invalid_receipt_date: "Tanggal penerimaan tidak valid.",
  notes_too_long: "Catatan terlalu panjang.",
  invalid_items: "Data item penerimaan tidak valid.",
  invalid_item_data: "Data item tidak valid.",
  invalid_quantity: "Kuantitas penerimaan tidak valid.",
  invalid_inventory_status: "Inventory status tidak valid.",
  invalid_units: "Data unit tidak valid.",
  invalid_unit_data: "Data unit tidak valid.",
  invalid_unit_code: "Unit Code tidak valid.",
  invalid_identifiers: "Data identifier tidak valid.",
  invalid_identifier_data: "IMEI atau Serial Number tidak valid.",
  invalid_item_notes: "Catatan item terlalu panjang.",
  save_failed: "Goods Receipt gagal disimpan. Periksa data dan coba kembali.",
};

function getErrorMessage(error?: string): string | undefined {
  if (!error) return undefined;
  return errorMessages[error] ?? "Terjadi kesalahan saat membuat Goods Receipt.";
}

export default async function NewGoodsReceiptPage({
  params,
  searchParams,
}: PageProps) {
  await connection();

  const { id } = await params;
  const query = await searchParams;

  const { supabase } =
    await getAuthorizationContext("purchasing.view");

  // Purchase Order
  const { data: poData, error: poError } = await supabase
    .from("purchase_orders")
    .select("id, po_number, supplier_id, warehouse_id, status")
    .eq("id", id)
    .maybeSingle();

  if (poError) {
    throw new Error(`Gagal mengambil Purchase Order: ${poError.message}`);
  }

  if (!poData) {
    notFound();
  }

  const purchaseOrder = poData as PurchaseOrderRow;

  if (!["approved", "partially_received"].includes(purchaseOrder.status)) {
    redirect(`/purchases/${id}`);
  }

  // Supplier dan warehouse
  const [
    { data: supplierData, error: supplierError },
    { data: warehouseData, error: warehouseError },
  ] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, supplier_code, supplier_name")
      .eq("id", purchaseOrder.supplier_id)
      .maybeSingle(),

    supabase
      .from("warehouses")
      .select("id, warehouse_code, warehouse_name")
      .eq("id", purchaseOrder.warehouse_id)
      .maybeSingle(),
  ]);

  if (supplierError) {
    throw new Error(`Gagal mengambil supplier: ${supplierError.message}`);
  }

  if (warehouseError) {
    throw new Error(`Gagal mengambil warehouse: ${warehouseError.message}`);
  }

  const supplier = supplierData as SupplierRow | null;
  const warehouse = warehouseData as WarehouseRow | null;

  // Item PO
  const { data: itemData, error: itemError } = await supabase
    .from("purchase_order_items")
    .select(
      "id, product_variant_id, quantity, received_quantity, unit_cost, discount_amount, tax_amount"
    )
    .eq("purchase_order_id", id)
    .order("created_at", { ascending: true });

  if (itemError) {
    throw new Error(`Gagal mengambil item PO: ${itemError.message}`);
  }

  const poItems = (itemData ?? []) as PurchaseOrderItemRow[];

  // Draft Goods Receipt aktif untuk PO ini
  const { data: draftReceiptData, error: draftReceiptError } =
    await supabase
      .from("goods_receipts")
      .select("id")
      .eq("purchase_order_id", id)
      .eq("status", "draft");

  if (draftReceiptError) {
    throw new Error(
      `Gagal mengambil draft Goods Receipt: ${draftReceiptError.message}`
    );
  }

  const draftReceiptIds = (draftReceiptData ?? []).map(
    (receipt: { id: string }) => receipt.id
  );

  let draftItems: GoodsReceiptDraftItem[] = [];

  if (draftReceiptIds.length > 0) {
    const { data, error } = await supabase
      .from("goods_receipt_items")
      .select("purchase_order_item_id, quantity_received")
      .in("goods_receipt_id", draftReceiptIds);

    if (error) {
      throw new Error(
        `Gagal mengambil item draft Goods Receipt: ${error.message}`
      );
    }

    draftItems = (data ?? []) as GoodsReceiptDraftItem[];
  }

  const draftQuantityMap = new Map<string, number>();

  for (const draftItem of draftItems) {
    const previous =
      draftQuantityMap.get(draftItem.purchase_order_item_id) ?? 0;

    draftQuantityMap.set(
      draftItem.purchase_order_item_id,
      previous + Number(draftItem.quantity_received)
    );
  }

  // Product variants
  const variantIds = [
    ...new Set(
      poItems.map(
        (item: PurchaseOrderItemRow) => item.product_variant_id
      )
    ),
  ];

  let variants: VariantRow[] = [];

  if (variantIds.length > 0) {
    const { data, error } = await supabase
      .from("product_variants")
      .select("id, product_id, variant_sku, variant_name")
      .in("id", variantIds);

    if (error) {
      throw new Error(`Gagal mengambil varian produk: ${error.message}`);
    }

    variants = (data ?? []) as VariantRow[];
  }

  // Products dan tracking type
  const productIds = [
    ...new Set(
      variants.map((variant: VariantRow) => variant.product_id)
    ),
  ];

  let products: ProductRow[] = [];

  if (productIds.length > 0) {
    const { data, error } = await supabase
      .from("products")
      .select("id, sku, product_name, tracking_type")
      .in("id", productIds);

    if (error) {
      throw new Error(`Gagal mengambil master produk: ${error.message}`);
    }

    products = (data ?? []) as ProductRow[];
  }

  const variantMap = new Map<string, VariantRow>(
    variants.map((variant: VariantRow) => [variant.id, variant])
  );

  const productMap = new Map<string, ProductRow>(
    products.map((product: ProductRow) => [product.id, product])
  );

  // Bentuk data untuk komponen form
  const receiptItems: GoodsReceiptFormItem[] = poItems
    .map((item: PurchaseOrderItemRow) => {
      const variant = variantMap.get(item.product_variant_id) ?? null;

      const product = variant
        ? productMap.get(variant.product_id) ?? null
        : null;

      const orderedQuantity = Number(item.quantity);
      const receivedQuantity = Number(item.received_quantity);
      const draftQuantity = draftQuantityMap.get(item.id) ?? 0;

      const remainingQuantity = Math.max(
        0,
        orderedQuantity - receivedQuantity - draftQuantity
      );

      const trackingType: GoodsReceiptFormItem["tracking_type"] =
  product?.tracking_type === "imei"
    ? "imei"
    : product?.tracking_type === "serial"
      ? "serial"
      : "quantity";

      return {
        id: item.id,
        product_variant_id: item.product_variant_id,
        product_name: product?.product_name ?? "Unknown Product",
        product_sku: product?.sku ?? "-",
        variant_name: variant?.variant_name ?? "-",
        variant_sku: variant?.variant_sku ?? "-",
        tracking_type: trackingType,
        ordered_quantity: orderedQuantity,
        received_quantity: receivedQuantity,
        draft_quantity: draftQuantity,
        remaining_quantity: remainingQuantity,
        unit_cost: Number(item.unit_cost),
        discount_amount: Number(item.discount_amount),
        tax_amount: Number(item.tax_amount),
      };
    })
    .filter((item) => item.remaining_quantity > 0);

  if (receiptItems.length === 0) {
    redirect(`/purchases/${id}`);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <ErpSidebar />

      <main className="min-w-0 flex-1 space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="mb-2 text-sm text-slate-500">
              <Link href="/purchases" className="hover:underline">
                Purchases
              </Link>
              {" / "}
              <Link
                href={`/purchases/${id}`}
                className="hover:underline"
              >
                {purchaseOrder.po_number}
              </Link>
              {" / Goods Receipt"}
            </div>

            <h1 className="text-2xl font-semibold text-slate-900">
              Create Goods Receipt
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Catat barang yang benar-benar diterima dari supplier.
            </p>
          </div>

          <Link
            href={`/purchases/${id}`}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Kembali ke Purchase Order
          </Link>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 font-semibold text-slate-900">
            Purchase Order Information
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-slate-500">PO Number</p>
              <p className="mt-1 font-medium">
                {purchaseOrder.po_number}
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500">Supplier</p>
              <p className="mt-1 font-medium">
                {supplier?.supplier_name ?? "-"}
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500">Warehouse</p>
              <p className="mt-1 font-medium">
                {warehouse?.warehouse_name ?? "-"}
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500">PO Status</p>
              <p className="mt-1 font-medium capitalize">
                {purchaseOrder.status.replaceAll("_", " ")}
              </p>
            </div>
          </div>
        </section>

        <GoodsReceiptForm
          purchaseOrderId={purchaseOrder.id}
          receiptItems={receiptItems}
          receiptDate={today}
          errorMessage={getErrorMessage(query.error)}
        />
      </main>
    </div>
  );
}
