import { redirect } from "next/navigation";

export const metadata = {
  title: "Laporan | HEXA CORE ERP",
  description: "Alamat lama laporan operasional; diarahkan ke Akuntansi & Laporan",
};

export default function ReportsRedirect() {
  redirect("/accounting");
}
