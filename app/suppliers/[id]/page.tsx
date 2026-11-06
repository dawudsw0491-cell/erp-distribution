
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import ErpSidebar from "@/components/layout/erp-sidebar";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import BankAccountManager from "./bank-account-manager";
import ContactManager from "./contact-manager";
import ProductSupplierManager from "./product-supplier-manager";

export const instant = false;

export const metadata = {
  title: "Detail Supplier | DAWUD ERP",
  description: "Detail informasi supplier",
};

type SupplierDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

function formatCurrency(value: number | null, currency: string) {
  if (value === null) return "-";

  try {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return new Intl.NumberFormat("id-ID", {
      maximumFractionDigits: 0,
    }).format(value);
  }
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | number | null;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-slate-900">
        {value === null || value === "" ? "-" : value}
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-5 font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

export default async function SupplierDetailPage({
  params,
}: SupplierDetailPageProps) {
  await connection();

  const { id } = await params;

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(id)) {
    notFound();
  }

  const {
    supabase,
    user,
    profile,
    authorized,
  } = await getAuthorizationContext("suppliers.view");

  if (!user) {
    redirect("/login");
  }

  if (!profile || !authorized) {
    return (
      <div className="flex min-h-screen flex-col md:flex-row">
        <ErpSidebar activePath="/suppliers" />

        <main className="flex flex-1 items-center justify-center bg-slate-100 p-6">
          <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
            <h1 className="text-xl font-bold text-slate-800">
              Akses Ditolak
            </h1>

            <p className="mt-3 text-sm text-slate-600">
              Anda tidak memiliki permission untuk melihat detail supplier.
            </p>

            <Link
              href="/"
              className="mt-6 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white"
            >
              Kembali ke Dashboard
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const { data: supplier, error } = await supabase
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
      address,
      city,
      province,
      regency_code,
      payment_term_days,
      credit_limit,
      currency_code,
      is_active,
      created_at,
      updated_at
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) {
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

  const { data: addresses, error: addressError } = await supabase
    .from("supplier_addresses")
    .select(`
      id,
      address_type,
      address_label,
      address,
      city,
      province,
      postal_code,
      country_code,
      is_primary,
      village_id,
      district_id,
      regency_code,
      province_code
    `)
    .eq("supplier_id", id)
    .order("is_primary", { ascending: false });

  const [
    { data: bankPermission, error: bankPermissionError },
    { data: updatePermission, error: updatePermissionError },
    { data: createPermission, error: createPermissionError },
  ] = await Promise.all([
    supabase.rpc("has_permission", {
      required_permission: "suppliers.manage_bank",
    }),
    supabase.rpc("has_permission", {
      required_permission: "suppliers.update",
    }),
    supabase.rpc("has_permission", {
      required_permission: "suppliers.create",
    }),
  ]);

  const canManageBank =
    !bankPermissionError && bankPermission === true;

  const canUpdateSupplier =
    !updatePermissionError && updatePermission === true;

  const canCreateSupplierProduct =
    !createPermissionError && createPermission === true;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <ErpSidebar activePath="/suppliers" />

      <main className="min-w-0 flex-1 bg-slate-100 p-5 md:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <Link
                href="/suppliers"
                className="text-sm font-medium text-blue-700 hover:underline"
              >
                ← Kembali ke Daftar Supplier
              </Link>

              <h1 className="mt-3 text-2xl font-bold text-slate-900">
                {supplier.supplier_name}
              </h1>

              <p className="mt-1 text-sm text-slate-600">
                {supplier.supplier_code}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`w-fit rounded-full px-4 py-2 text-sm font-semibold ${
                  supplier.is_active
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {supplier.is_active ? "Aktif" : "Nonaktif"}
              </span>

              {canUpdateSupplier && (
                <Link
                  href={`/suppliers/${supplier.id}/edit`}
                  className="inline-flex items-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Edit Supplier
                </Link>
              )}
            </div>
          </header>

          <Section title="Informasi Umum">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <DetailItem label="Kode Supplier" value={supplier.supplier_code} />
              <DetailItem label="Nama Supplier" value={supplier.supplier_name} />

              <DetailItem
                label="Jenis Supplier"
                value={
                  supplier.supplier_type === "company"
                    ? "Perusahaan"
                    : "Perorangan"
                }
              />

              <DetailItem label="Nama Legal" value={supplier.legal_name} />
              <DetailItem label="Nomor Izin Usaha" value={supplier.business_license_number} />
              <DetailItem label="NPWP" value={supplier.tax_number} />
              <DetailItem label="Website" value={supplier.website} />
              <DetailItem label="Contact Person" value={supplier.contact_person} />
              <DetailItem label="Telepon" value={supplier.phone} />
              <DetailItem label="Email" value={supplier.email} />
              <DetailItem label="Alamat Legacy" value={supplier.address} />
              <DetailItem label="Kota" value={supplier.city} />
              <DetailItem label="Provinsi" value={supplier.province} />
            </div>
          </Section>

          <Section title="Informasi Pembayaran">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <DetailItem
                label="Termin Pembayaran"
                value={`${supplier.payment_term_days} hari`}
              />

              <DetailItem
                label="Limit Kredit"
                value={formatCurrency(
                  supplier.credit_limit === null
                    ? null
                    : Number(supplier.credit_limit),
                  supplier.currency_code
                )}
              />

              <DetailItem
                label="Mata Uang"
                value={supplier.currency_code}
              />
            </div>
          </Section>

          <Section title="Alamat Supplier">
            {addressError ? (
              <p className="text-sm text-red-600">
                Gagal mengambil data alamat.
              </p>
            ) : !addresses?.length ? (
              <p className="text-sm text-slate-500">
                Belum ada alamat tambahan.
              </p>
            ) : (
              <div className="w-full space-y-4">
                {addresses.map((item) => (
                  <div
                    key={item.id}
                    className="w-full rounded-lg border border-slate-200 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900">
                        {item.address_label || item.address_type}
                      </h3>

                      {item.is_primary && (
                        <span className="rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-700">
                          Alamat Utama
                        </span>
                      )}
                    </div>

                    <p className="mt-2 text-sm text-slate-700">
                      {item.address}
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      {[
                        item.city,
                        item.province,
                        item.postal_code,
                        item.country_code,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Kontak Supplier">
            <ContactManager supplierId={supplier.id} />
          </Section>

          {canManageBank && (
            <Section title="Rekening Bank Supplier">
              <BankAccountManager supplierId={supplier.id} />
            </Section>
          )}

          <Section title="Produk yang Disuplai">
            <ProductSupplierManager
              supplierId={supplier.id}
              currencyCode={supplier.currency_code}
              canCreate={canCreateSupplierProduct}
              canUpdate={canUpdateSupplier}
            />
          </Section>

          <p className="text-xs text-slate-500">
            Terakhir diperbarui:{" "}
            {supplier.updated_at
              ? new Date(supplier.updated_at).toLocaleString("id-ID")
              : "-"}
          </p>
        </div>
      </main>
    </div>
  );
}
