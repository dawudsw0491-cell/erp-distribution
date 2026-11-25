import { redirect } from "next/navigation";

export const metadata = {
  title: "Stock Balance | HEXACORE ERP",
  description: "Detail unit dan identifier tersedia melalui Stock Balance",
};

export default function SerializedUnitsRedirect() {
  redirect("/inventory/balances");
}
