import { redirect } from "next/navigation";

/** Legacy route consolidated into Product Management. */
export default function LegacyProductSetupRedirect() {
  redirect("/products");
}
