
import Link from "next/link";
import AttributeForm from "./attribute-form";

export const metadata = {
  title: "Tambah Atribut Produk | HEXACore",
};

export default function NewProductAttributePage() {
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <Link
            href="/product-attributes"
            className="text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            ← Kembali ke Product Attributes
          </Link>

          <h1 className="mt-4 text-2xl font-bold text-slate-900">
            Tambah Atribut Produk
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Tambahkan atribut standar untuk spesifikasi produk.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <AttributeForm />
        </div>
      </div>
    </main>
  );
}
