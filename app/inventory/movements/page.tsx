import { redirect } from "next/navigation";

export const metadata = {
  title: "Inventory | HEXACORE ERP",
  description: "Pengelolaan persediaan",
};

export default function StockMovementRedirect() {
  redirect("/inventory/balances");
}
