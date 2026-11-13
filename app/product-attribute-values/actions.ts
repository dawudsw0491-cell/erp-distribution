
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export type AttributeValueActionState = {
  error?: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CODE_REGEX = /^[A-Z0-9_-]+$/;

function getFormValue(formData: FormData, field: string): string {
  return String(formData.get(field) ?? "").trim();
}

function normalizeCode(value: string): string {
  return value.toUpperCase();
}

/**
 * CREATE PRODUCT ATTRIBUTE VALUE
 */
export async function createProductAttributeValue(
  _prevState: AttributeValueActionState,
  formData: FormData
): Promise<AttributeValueActionState> {
  const attributeId = getFormValue(formData, "attribute_id");
  const valueCode = normalizeCode(getFormValue(formData, "value_code"));
  const valueName = getFormValue(formData, "value_name");
  const description = getFormValue(formData, "description");

  if (!UUID_REGEX.test(attributeId)) {
    return { error: "Parent Attribute tidak valid." };
  }

  if (!valueCode || !CODE_REGEX.test(valueCode) || valueCode.length > 50) {
    return {
      error:
        "Value Code wajib diisi. Gunakan huruf, angka, tanda hubung, atau garis bawah.",
    };
  }

  if (!valueName || valueName.length > 100) {
    return {
      error: "Value Name wajib diisi dan maksimal 100 karakter.",
    };
  }

  if (description.length > 1000) {
    return { error: "Description maksimal 1000 karakter." };
  }

  const { supabase, authorized } =
    await getAuthorizationContext("master.create");

  if (!authorized) {
    return {
      error: "Anda tidak memiliki izin untuk membuat Attribute Value.",
    };
  }

  const { data: parentAttribute, error: parentError } = await supabase
    .from("product_attributes")
    .select("id")
    .eq("id", attributeId)
    .eq("is_active", true)
    .maybeSingle();

  if (parentError || !parentAttribute) {
    return {
      error: "Parent Attribute tidak ditemukan atau sudah tidak aktif.",
    };
  }

  const { data: duplicateCode } = await supabase
    .from("product_attribute_values")
    .select("id")
    .eq("attribute_id", attributeId)
    .ilike("value_code", valueCode)
    .maybeSingle();

  if (duplicateCode) {
    return {
      error: "Value Code sudah digunakan pada Parent Attribute tersebut.",
    };
  }

  const { data: duplicateName } = await supabase
    .from("product_attribute_values")
    .select("id")
    .eq("attribute_id", attributeId)
    .ilike("value_name", valueName)
    .maybeSingle();

  if (duplicateName) {
    return {
      error: "Value Name sudah digunakan pada Parent Attribute tersebut.",
    };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("product_attribute_values")
    .insert({
      attribute_id: attributeId,
      value_code: valueCode,
      value_name: valueName,
      description: description || null,
      is_active: true,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return {
        error:
          "Attribute Value dengan kode atau nama tersebut sudah tersedia.",
      };
    }

    return {
      error: `Gagal menyimpan data: ${insertError.message}`,
    };
  }

  revalidatePath("/product-attribute-values");

  redirect(`/product-attribute-values/${inserted.id}?success=created`);
}

/**
 * UPDATE PRODUCT ATTRIBUTE VALUE
 */
export async function updateProductAttributeValue(
  formData: FormData
): Promise<void> {
  const id = getFormValue(formData, "id");
  const attributeId = getFormValue(formData, "attribute_id");
  const valueCode = normalizeCode(getFormValue(formData, "value_code"));
  const valueName = getFormValue(formData, "value_name");
  const description = getFormValue(formData, "description");

  const fail = (message: string): never => {
    redirect(
      `/product-attribute-values/${id}/edit?error=${encodeURIComponent(message)}`
    );
  };

  if (!UUID_REGEX.test(id)) {
    throw new Error("ID Attribute Value tidak valid.");
  }

  if (!UUID_REGEX.test(attributeId)) {
    return fail("Parent Attribute tidak valid.");
  }

  if (!valueCode || !CODE_REGEX.test(valueCode) || valueCode.length > 50) {
    return fail(
      "Value Code wajib diisi dan hanya boleh berisi huruf, angka, - atau _."
    );
  }

  if (!valueName || valueName.length > 100) {
    return fail("Value Name wajib diisi dan maksimal 100 karakter.");
  }

  if (description.length > 1000) {
    return fail("Description maksimal 1000 karakter.");
  }

  const { supabase, authorized } =
    await getAuthorizationContext("master.update");

  if (!authorized) {
    return fail("Anda tidak memiliki izin mengubah Attribute Value.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("product_attribute_values")
    .select("id, attribute_id")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return fail(`Gagal mengambil data: ${existingError.message}`);
  }

  if (existing === null) {
    return fail("Attribute Value tidak ditemukan.");
  }

  const existingAttributeId = existing.attribute_id;

  // Parent Attribute hanya boleh dipindahkan jika belum digunakan.
  if (attributeId !== existingAttributeId) {
    const { data: usage, error: usageError } = await supabase
      .from("product_variant_attribute_values")
      .select("attribute_value_id")
      .eq("attribute_value_id", id)
      .limit(1);

    if (usageError) {
      return fail(
        `Gagal memeriksa relasi Product Variant: ${usageError.message}`
      );
    }

    if (usage && usage.length > 0) {
      return fail(
        "Parent Attribute tidak dapat diubah karena Attribute Value sudah digunakan oleh Product Variant. Value Code, Value Name, dan Description tetap dapat diubah."
      );
    }

    const { data: parentAttribute, error: parentError } = await supabase
      .from("product_attributes")
      .select("id")
      .eq("id", attributeId)
      .eq("is_active", true)
      .maybeSingle();

    if (parentError || !parentAttribute) {
      return fail("Parent Attribute tidak ditemukan atau sudah tidak aktif.");
    }
  }

  const { data: duplicateCode } = await supabase
    .from("product_attribute_values")
    .select("id")
    .eq("attribute_id", attributeId)
    .ilike("value_code", valueCode)
    .neq("id", id)
    .maybeSingle();

  if (duplicateCode) {
    return fail("Value Code sudah digunakan pada Parent Attribute tersebut.");
  }

  const { data: duplicateName } = await supabase
    .from("product_attribute_values")
    .select("id")
    .eq("attribute_id", attributeId)
    .ilike("value_name", valueName)
    .neq("id", id)
    .maybeSingle();

  if (duplicateName) {
    return fail("Value Name sudah digunakan pada Parent Attribute tersebut.");
  }

  const { error: updateError } = await supabase
    .from("product_attribute_values")
    .update({
      attribute_id: attributeId,
      value_code: valueCode,
      value_name: valueName,
      description: description || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    if (updateError.code === "23505") {
      return fail("Value Code atau Value Name sudah digunakan.");
    }

    return fail(`Gagal memperbarui data: ${updateError.message}`);
  }

  revalidatePath("/product-attribute-values");
  revalidatePath(`/product-attribute-values/${id}`);
  revalidatePath(`/product-attribute-values/${id}/edit`);

  redirect(`/product-attribute-values/${id}?success=updated`);
}

/**
 * TOGGLE PRODUCT ATTRIBUTE VALUE STATUS
 *
 * Mengubah status aktif/nonaktif.
 * Tidak menghapus data maupun relasi Product Variant.
 */
export async function toggleProductAttributeValueStatus(
  formData: FormData
): Promise<void> {
  const id = getFormValue(formData, "id");

  const fail = (message: string): never => {
    redirect(
      `/product-attribute-values/${id}?error=${encodeURIComponent(message)}`
    );
  };

  if (!UUID_REGEX.test(id)) {
    throw new Error("ID Attribute Value tidak valid.");
  }

  const { supabase, authorized } =
    await getAuthorizationContext("master.update");

  if (!authorized) {
    return fail("Anda tidak memiliki izin mengubah status Attribute Value.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("product_attribute_values")
    .select("id, is_active")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return fail(`Gagal mengambil data: ${existingError.message}`);
  }

  if (existing === null) {
    return fail("Attribute Value tidak ditemukan.");
  }

  const existingIsActive = existing.is_active;
  const newStatus = !existingIsActive;

  const { data: updated, error: updateError } = await supabase
    .from("product_attribute_values")
    .update({
      is_active: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("is_active", existingIsActive)
    .select("id, is_active")
    .maybeSingle();

  if (updateError) {
    return fail(`Gagal mengubah status: ${updateError.message}`);
  }

  if (!updated) {
    return fail(
      "Status Attribute Value sudah berubah atau data tidak dapat diperbarui. Silakan muat ulang halaman."
    );
  }

  revalidatePath("/product-attribute-values");
  revalidatePath(`/product-attribute-values/${id}`);

  redirect(
    `/product-attribute-values/${id}?success=${
      newStatus ? "activated" : "deactivated"
    }`
  );
}

/**
 * DELETE PRODUCT ATTRIBUTE VALUE
 *
 * Hard delete satu record berdasarkan ID.
 *
 * Ketentuan:
 * 1. Memerlukan permission master.delete.
 * 2. Tidak menghapus Parent Attribute.
 * 3. Tidak menghapus Product Variant.
 * 4. Menolak penghapusan jika masih digunakan Product Variant.
 * 5. Database FK tetap menjadi perlindungan relasi terakhir.
 */
export async function deleteProductAttributeValue(
  formData: FormData
): Promise<void> {
  const id = getFormValue(formData, "id");

  const fail = (message: string): never => {
    redirect(
      `/product-attribute-values?error=${encodeURIComponent(message)}`
    );
  };

  if (!UUID_REGEX.test(id)) {
    return fail("ID Attribute Value tidak valid.");
  }

  const { supabase, authorized } =
    await getAuthorizationContext("master.delete");

  if (!authorized) {
    return fail("Anda tidak memiliki izin menghapus Attribute Value.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("product_attribute_values")
    .select("id, value_code, value_name")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return fail(`Gagal mengambil data: ${existingError.message}`);
  }

  if (existing === null) {
    return fail("Attribute Value tidak ditemukan atau sudah dihapus.");
  }

  const existingValueName: string = existing.value_name;
  const existingValueCode: string = existing.value_code;

  // Periksa apakah Attribute Value digunakan Product Variant.
  const { data: usage, error: usageError } = await supabase
    .from("product_variant_attribute_values")
    .select("attribute_value_id")
    .eq("attribute_value_id", id)
    .limit(1);

  if (usageError) {
    return fail(
      `Gagal memeriksa relasi Product Variant: ${usageError.message}`
    );
  }

  if (usage && usage.length > 0) {
    return fail(
      `Attribute Value "${existingValueName}" tidak dapat dihapus karena masih digunakan oleh Product Variant.`
    );
  }

  // Hard delete hanya satu Attribute Value.
  const { data: deleted, error: deleteError } = await supabase
    .from("product_attribute_values")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (deleteError) {
    if (deleteError.code === "23503") {
      return fail(
        "Attribute Value tidak dapat dihapus karena masih memiliki relasi dengan data lain."
      );
    }

    return fail(`Gagal menghapus Attribute Value: ${deleteError.message}`);
  }

  if (!deleted) {
    return fail(
      "Attribute Value tidak berhasil dihapus. Data mungkin sudah berubah atau tidak tersedia."
    );
  }

  revalidatePath("/product-attribute-values");
  revalidatePath("/product-attributes");

  redirect(
    `/product-attribute-values?success=deleted&deleted=${encodeURIComponent(
      existingValueCode
    )}`
  );
}
