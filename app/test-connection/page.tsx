export const instant = false;

import { createClient } from "@/lib/supabase/server";

export default async function TestConnectionPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("connection_test")
    .select("*")
    .limit(1);

  return (
    <main className="min-h-screen p-10">
      <h1 className="text-2xl font-bold">
        ERP Distribution - Supabase Connection
      </h1>

      {error ? (
        <div className="mt-6 rounded-lg bg-red-100 p-4 text-red-800">
          <p className="font-bold">Koneksi atau query belum berhasil.</p>
          <p>{error.message}</p>
        </div>
      ) : (
        <div className="mt-6 rounded-lg bg-green-100 p-4 text-green-800">
          <p className="font-bold">Supabase berhasil dihubungi.</p>
          <p>Data yang diterima: {data.length} baris.</p>
        </div>
      )}
    </main>
  );
}