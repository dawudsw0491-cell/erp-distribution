
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export type ProductAttributeActionState = {
  success: boolean;
  message: string;
  errors?: {
    attribute_code?: string;
    attribute_name?: string;
    description?: string;
  };
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createProductAttribute(
  _previousState: ProductAttributeActionState,
  formData: FormData
): Promise<ProductAttributeActionState> {
  const attributeCode = String(
    formData.get("attribute_code") ?? ""
  )
    .trim()
    .toUpperCase();

  const attributeName = String(
    formData.get("attribute_name") ?? ""
  ).trim();

  const description = String(
    formData.get("description") ?? ""
  ).trim();

  const errors: NonNullable<
    ProductAttributeActionState["errors"]
  > = {};

  if (!attributeCode) {
    errors.attribute_code = "Kode atribut wajib diisi.";
  } else if (!/^[A-Z0-9_-]+$/.test(attributeCode)) {
    errors.attribute_code =
      "Kode hanya boleh berisi huruf, angka, underscore, dan tanda hubung.";
  } else if (attributeCode.length > 50) {
    errors.attribute_code = "Kode maksimal 50 karakter.";
  }

  if (!attributeName) {
    errors.attribute_name = "Nama atribut wajib diisi.";
  } else if (attributeName.length > 100) {
    errors.attribute_name = "Nama maksimal 100 karakter.";
  }

  if (description.length > 1000) {
    errors.description = "Deskripsi maksimal 1000 karakter.";
  }

  if (Object.keys(errors).length > 0) {
    return {
      success: false,
      message: "Periksa kembali data atribut.",
      errors,
    };
  }

  const { supabase, user, authorized } =
    await getAuthorizationContext("master.create");

  if (!user) {
    return {
      success: false,
      message: "Sesi login tidak ditemukan. Silakan login kembali.",
    };
  }

  if (!authorized) {
    return {
      success: false,
      message: "Anda tidak memiliki izin menambahkan atribut.",
    };
  }

  const { data: existingCodes, error: codeError } = await supabase
    .from("product_attributes")
    .select("id, attribute_code")
    .ilike("attribute_code", attributeCode)
    .limit(1);

  if (codeError) {
    console.error("Product attribute code check:", codeError);

    return {
      success: false,
      message: "Gagal memeriksa kode atribut di database.",
    };
  }

  if (existingCodes && existingCodes.length > 0) {
    return {
      success: false,
      message: "Kode atribut sudah digunakan.",
      errors: {
        attribute_code: "Gunakan kode atribut yang berbeda.",
      },
    };
  }

  const { data: existingNames, error: nameError } = await supabase
    .from("product_attributes")
    .select("id, attribute_name")
    .ilike("attribute_name", attributeName)
    .limit(1);

  if (nameError) {
    console.error("Product attribute name check:", nameError);

    return {
      success: false,
      message: "Gagal memeriksa nama atribut di database.",
    };
  }

  if (existingNames && existingNames.length > 0) {
    return {
      success: false,
      message: "Nama atribut sudah digunakan.",
      errors: {
        attribute_name: "Gunakan nama atribut yang berbeda.",
      },
    };
  }

  const { error: insertError } = await supabase
    .from("product_attributes")
    .insert({
      attribute_code: attributeCode,
      attribute_name: attributeName,
      description: description || null,
      is_active: true,
    });

  if (insertError) {
    console.error("Product attribute insert:", insertError);

    if (insertError.code === "23505") {
      return {
        success: false,
        message:
          "Kode atau nama atribut sudah digunakan. Periksa kembali data.",
      };
    }

    return {
      success: false,
      message: `Gagal menyimpan atribut: ${insertError.message}`,
    };
  }

  revalidatePath("/product-attributes");
  redirect("/product-attributes");
}

export async function toggleProductAttributeStatus(
  formData: FormData
): Promise<void> {
  const attributeId = String(formData.get("id") ?? "").trim();

  if (!UUID_REGEX.test(attributeId)) {
    throw new Error("ID Product Attribute tidak valid.");
  }

  const { supabase, user, authorized } =
    await getAuthorizationContext("master.update");

  if (!user) {
    redirect("/login");
  }

  if (!authorized) {
    throw new Error(
      "Anda tidak memiliki izin mengubah status Product Attribute."
    );
  }

  const { data: attribute, error: fetchError } = await supabase
    .from("product_attributes")
    .select("id, is_active")
    .eq("id", attributeId)
    .maybeSingle();

  if (fetchError) {
    console.error("Product attribute status fetch:", fetchError);
    throw new Error("Gagal mengambil data Product Attribute.");
  }

  if (!attribute) {
    throw new Error("Product Attribute tidak ditemukan.");
  }

  const { error: updateError } = await supabase
    .from("product_attributes")
    .update({
      is_active: !attribute.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", attributeId);

  if (updateError) {
    console.error("Product attribute status update:", updateError);
    throw new Error("Gagal memperbarui status Product Attribute.");
  }

  revalidatePath("/product-attributes");
  revalidatePath(`/product-attributes/${attributeId}`);

  redirect(`/product-attributes/${attributeId}`);
}

export async function updateProductAttribute(
  formData: FormData
): Promise<void> {
  const attributeId = String(formData.get("id") ?? "").trim();

  const attributeCode = String(
    formData.get("attribute_code") ?? ""
  )
    .trim()
    .toUpperCase();

  const attributeName = String(
    formData.get("attribute_name") ?? ""
  ).trim();

  const description = String(
    formData.get("description") ?? ""
  ).trim();

  if (!UUID_REGEX.test(attributeId)) {
    throw new Error("ID Product Attribute tidak valid.");
  }

  if (
    !attributeCode ||
    !/^[A-Z0-9_-]+$/.test(attributeCode) ||
    attributeCode.length > 50
  ) {
    throw new Error("Kode atribut tidak valid.");
  }

  if (!attributeName || attributeName.length > 100) {
    throw new Error("Nama atribut tidak valid.");
  }

  if (description.length > 1000) {
    throw new Error("Deskripsi maksimal 1000 karakter.");
  }

  const { supabase, user, authorized } =
    await getAuthorizationContext("master.update");

  if (!user) {
    redirect("/login");
  }

  if (!authorized) {
    throw new Error(
      "Anda tidak memiliki izin mengubah Product Attribute."
    );
  }

  const { data: currentAttribute, error: fetchError } =
    await supabase
      .from("product_attributes")
      .select("id")
      .eq("id", attributeId)
      .maybeSingle();

  if (fetchError) {
    console.error("Product attribute fetch:", fetchError);
    throw new Error("Gagal mengambil data Product Attribute.");
  }

  if (!currentAttribute) {
    throw new Error("Product Attribute tidak ditemukan.");
  }

  const { data: duplicateCode, error: codeError } =
    await supabase
      .from("product_attributes")
      .select("id")
      .ilike("attribute_code", attributeCode)
      .neq("id", attributeId)
      .limit(1);

  if (codeError) {
    console.error("Product attribute code check:", codeError);
    throw new Error("Gagal memeriksa kode atribut.");
  }

  if (duplicateCode && duplicateCode.length > 0) {
    throw new Error("Kode atribut sudah digunakan.");
  }

  const { data: duplicateName, error: nameError } =
    await supabase
      .from("product_attributes")
      .select("id")
      .ilike("attribute_name", attributeName)
      .neq("id", attributeId)
      .limit(1);

  if (nameError) {
    console.error("Product attribute name check:", nameError);
    throw new Error("Gagal memeriksa nama atribut.");
  }

  if (duplicateName && duplicateName.length > 0) {
    throw new Error("Nama atribut sudah digunakan.");
  }

  const { error: updateError } = await supabase
    .from("product_attributes")
    .update({
      attribute_code: attributeCode,
      attribute_name: attributeName,
      description: description || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", attributeId);

  if (updateError) {
    console.error("Product attribute update:", updateError);

    if (updateError.code === "23505") {
      throw new Error(
        "Kode atau nama atribut sudah digunakan."
      );
    }

    throw new Error("Gagal menyimpan perubahan Product Attribute.");
  }

  revalidatePath("/product-attributes");
  revalidatePath(`/product-attributes/${attributeId}`);
  revalidatePath(`/product-attributes/${attributeId}/edit`);

  redirect(`/product-attributes/${attributeId}?success=updated`);
}

export async function deleteProductAttribute(
  formData: FormData
): Promise<void> {
  const attributeId = String(formData.get("id") ?? "").trim();

  const fail = (message: string): never => {
    redirect(
      `/product-attributes?error=${encodeURIComponent(message)}`
    );
  };

  if (!UUID_REGEX.test(attributeId)) {
    return fail("ID Product Attribute tidak valid.");
  }

  const { supabase, user, authorized } =
    await getAuthorizationContext("master.delete");

  if (!user) {
    redirect("/login");
  }

  if (!authorized) {
    return fail(
      "Anda tidak memiliki izin menghapus Product Attribute."
    );
  }

  const { data, error } = await supabase.rpc(
    "delete_product_attribute",
    {
      p_attribute_id: attributeId,
    }
  );

  if (error) {
    console.error("Product Attribute delete RPC:", error);
    return fail(
      `Gagal menghapus Product Attribute: ${error.message}`
    );
  }

  const result = data as {
    success?: boolean;
    message?: string;
    attribute_code?: string;
    dependencies?: {
      category_attribute_templates?: number;
      product_attribute_assignments?: number;
      product_attribute_values?: number;
      product_variant_attribute_values?: number;
    };
  } | null;

  if (!result?.success) {
    let message =
      result?.message ??
      "Product Attribute tidak berhasil dihapus.";

    if (result?.dependencies) {
      const dependencies = result.dependencies;

      message +=
        ` Category Template: ${dependencies.category_attribute_templates ?? 0};` +
        ` Product Assignment: ${dependencies.product_attribute_assignments ?? 0};` +
        ` Attribute Values: ${dependencies.product_attribute_values ?? 0};` +
        ` Variant Values: ${dependencies.product_variant_attribute_values ?? 0}.`;
    }

    return fail(message);
  }

  revalidatePath("/product-attributes");
  revalidatePath("/product-attribute-values");
  revalidatePath("/product-models");

  redirect(
    `/product-attributes?success=deleted&deleted=${encodeURIComponent(
      result.attribute_code ?? ""
    )}`
  );
}
