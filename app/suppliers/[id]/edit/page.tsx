import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import SupplierEditForm from "./supplier-edit-form";

export const instant = false;

export const metadata = {
  title: "Edit Supplier | DAWUD ERP",
  description: "Ubah informasi supplier",
};

type EditSupplierPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditSupplierPage({
  params,
}: EditSupplierPageProps) {
  await connection();

  const { id } = await params;

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(id)) {
    notFound();
  }

  const auth = await getAuthorizationContext("suppliers.update");

  if (!auth.user) {
    redirect("/login");
  }

  if (!auth.profile || !auth.authorized) {
    return (
      <div className="flex min-h-screen flex-col md:flex-row">
        <ErpSidebar activePath="/suppliers" />
        <main className="flex flex-1 items-center justify-center bg-slate-100 p-6">
          <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
            <h1 className="text-xl font-bold text-slate-800">
              Akses Ditolak
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Anda tidak memiliki permission untuk mengubah data supplier.
            </p>
            <Link
              href="/suppliers"
              className="mt-6 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white"
            >
              Kembali ke Daftar Supplier
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const { data: supplier, error: supplierError } = await auth.supabase
    .from("suppliers")
    .select(`
      id,
      supplier_code,
      supplier_name,
      supplier_type,
      legal_name,
      business_license_number,
      tax_number,
      website,
      contact_person,
      phone,
      email,
      payment_term_days,
      credit_limit,
      currency_code
    `)
    .eq("id", id)
    .maybeSingle();

  if (supplierError) {
    return (
      <div className="flex min-h-screen flex-col md:flex-row">
        <ErpSidebar activePath="/suppliers" />
        <main className="flex-1 bg-slate-100 p-6">
          <div className="rounded-xl border border-red-200 bg-white p-6">
            <h1 className="font-bold text-red-700">
              Gagal Memuat Supplier
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Terjadi kesalahan saat mengambil data supplier.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (!supplier) {
    notFound();
  }

  const { data: address, error: addressError } = await auth.supabase
    .from("supplier_addresses")
    .select(`
      address,
      postal_code,
      village_id,
      district_id,
      regency_code,
      province_code
    `)
    .eq("supplier_id", id)
    .eq("is_primary", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (addressError) {
    return (
      <div className="flex min-h-screen flex-col md:flex-row">
        <ErpSidebar activePath="/suppliers" />
        <main className="flex-1 bg-slate-100 p-6">
          <div className="rounded-xl border border-red-200 bg-white p-6">
            <h1 className="font-bold text-red-700">
              Gagal Memuat Alamat Supplier
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Terjadi kesalahan saat mengambil alamat utama supplier.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (
    !address?.province_code ||
    !address.regency_code ||
    !address.district_id ||
    !address.village_id
  ) {
    return (
      <div className="flex min-h-screen flex-col md:flex-row">
        <ErpSidebar activePath="/suppliers" />
        <main className="flex-1 bg-slate-100 p-6">
          <div className="rounded-xl border border-amber-200 bg-white p-6">
            <h1 className="font-bold text-amber-700">
              Alamat Utama Belum Lengkap
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Supplier ini belum memiliki alamat utama dengan data wilayah
              Indonesia yang lengkap. Lengkapi data alamat sebelum melakukan
              perubahan supplier.
            </p>
            <Link
              href={`/suppliers/${id}`}
              className="mt-5 inline-block text-sm font-semibold text-blue-700 hover:underline"
            >
              Kembali ke Detail Supplier
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const [
    { data: province },
    { data: regency },
    { data: district },
    { data: village },
  ] = await Promise.all([
    auth.supabase
      .from("indonesia_provinces")
      .select("code, name")
      .eq("code", address.province_code)
      .maybeSingle(),

    auth.supabase
      .from("indonesia_regencies")
      .select("code, name")
      .eq("code", address.regency_code)
      .maybeSingle(),

    auth.supabase
      .from("indonesia_districts")
      .select("id, name")
      .eq("id", address.district_id)
      .maybeSingle(),

    auth.supabase
      .from("indonesia_villages")
      .select("id, name")
      .eq("id", address.village_id)
      .maybeSingle(),
  ]);

  if (!province || !regency || !district || !village) {
    return (
      <div className="flex min-h-screen flex-col md:flex-row">
        <ErpSidebar activePath="/suppliers" />
        <main className="flex-1 bg-slate-100 p-6">
          <div className="rounded-xl border border-amber-200 bg-white p-6">
            <h1 className="font-bold text-amber-700">
              Data Wilayah Tidak Lengkap
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Data wilayah alamat supplier tidak dapat ditemukan pada master
              wilayah Indonesia.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const initialData = {
    id: supplier.id,
    supplier_code: supplier.supplier_code,
    supplier_name: supplier.supplier_name,
    supplier_type: supplier.supplier_type,
    legal_name: supplier.legal_name ?? "",
    business_license_number: supplier.business_license_number ?? "",
    tax_number: supplier.tax_number ?? "",
    website: supplier.website ?? "",
    contact_person: supplier.contact_person ?? "",
    phone: supplier.phone ?? "",
    email: supplier.email ?? "",
    address: address.address ?? "",
    postal_code: address.postal_code ?? "",
    payment_term_days: supplier.payment_term_days ?? 0,
    credit_limit: Number(supplier.credit_limit ?? 0),
    currency_code: supplier.currency_code ?? "IDR",
    province: {
      id: province.code,
      name: province.name,
    },
    regency: {
      id: regency.code,
      name: regency.name,
    },
    district: {
      id: district.id,
      name: district.name,
    },
    village: {
      id: village.id,
      name: village.name,
    },
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <ErpSidebar activePath="/suppliers" />

      <main className="min-w-0 flex-1 bg-slate-100 p-5 md:p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <header>
            <Link
              href={`/suppliers/${id}`}
              className="text-sm font-medium text-blue-700 hover:underline"
            >
              ← Kembali ke Detail Supplier
            </Link>

            <h1 className="mt-3 text-2xl font-bold text-slate-900">
              Edit Supplier
            </h1>

            <p className="mt-1 text-sm text-slate-600">
              {supplier.supplier_code} · {supplier.supplier_name}
            </p>
          </header>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <SupplierEditForm initialData={initialData} />
          </section>
        </div>
      </main>
    </div>
  );
}
