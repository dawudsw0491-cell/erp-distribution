import { redirect } from "next/navigation";

/**
 * Legacy product setup route.
 * Product categories, models, attributes and attribute values are maintained
 * inside the unified Product Management workspace.
 */
export default function LegacyProductSetupRedirect() {
  redirect("/products");
}
