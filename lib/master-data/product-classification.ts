export type ProductCategoryOption = {
  id: string;
  category_name: string;
  parent_id: string | null;
  is_active?: boolean;
};

function normalizeCategoryInput(value: string) {
  return value.trim().replace(/\\s+/g, " ").toUpperCase();
}

export function recommendProductCategory(
  productName: string,
  brandName: string,
  condition: string,
  categories: ProductCategoryOption[]
) {
  const name = normalizeCategoryInput(productName);
  const brand = normalizeCategoryInput(brandName);

  if (!name || !condition) return null;

  let mainCategory = "";
  let subcategory = "";

  if (/\b(IPAD|TABLET|GALAXY TAB|REDMI PAD|XIAOMI PAD)\b/.test(name)) {
    mainCategory = "TABLET";
  } else if (
    /\b(MACBOOK|LAPTOP|NOTEBOOK|CHROMEBOOK|THINKPAD|VIVOBOOK|ZENBOOK)\b/.test(name)
  ) {
    mainCategory = "KOMPUTER DAN LAPTOP";
  } else if (
    /\b(ROUTER|SWITCH|ACCESS POINT|ACCESS-POINT|MODEM|ONT|OLT|REPEATER|MESH WIFI)\b/.test(name)
  ) {
    mainCategory = "NETWORKING";
  } else if (
    /\b(IC|MIKROKONTROLER|RESISTOR|KAPASITOR|TRANSISTOR|DIODE|PCB|ARDUINO|SENSOR|MOSFET)\b/.test(name)
  ) {
    mainCategory = "KOMPONEN ELEKTRONIK";
  } else if (
    /\b(AIRPODS|EARBUDS|HEADSET|HEADPHONE|EARPHONE|CHARGER|ADAPTER|CABLE|KABEL|CASE|COVER|POWERBANK|TEMPERED GLASS|SCREEN PROTECTOR|MOUSE|KEYBOARD|USB HUB|DOCKING)\b/.test(name)
  ) {
    mainCategory = "AKSESORIS";
  } else if (
    /\b(IPHONE)\b/.test(name) ||
    (brand === "APPLE" && /\b(15|16|17|14|13|12|11)\b/.test(name))
  ) {
    mainCategory = "SMARTPHONE";
    subcategory = "SMARTPHONE IOS";
  } else if (
    /\b(SMARTPHONE|GALAXY|REDMI|POCO|XIAOMI|OPPO|VIVO|REALME|INFINIX|TECNO)\b/.test(name) ||
    (
      ["SAMSUNG", "XIAOMI", "OPPO", "VIVO", "REALME", "INFINIX", "TECNO", "POCO"].includes(brand) &&
      /\b(A\d{1,2}|S\d{1,2}|NOTE|PRO|ULTRA|F\d{1,2}|C\d{1,2}|X\d{1,2})\b/.test(name)
    )
  ) {
    mainCategory = "SMARTPHONE";
    subcategory = "SMARTPHONE ANDROID";
  }

  if (!mainCategory) return null;

  if (condition === "SECOND") {
    subcategory = `${mainCategory} SECONDHAND`;
  }

  const main = categories.find(
    (item) =>
      item.category_name === mainCategory &&
      item.parent_id === null &&
      item.is_active !== false
  );

  if (!main) return null;

  const child = subcategory
    ? categories.find(
        (item) =>
          item.category_name === subcategory &&
          item.parent_id === main.id &&
          item.is_active !== false
      )
    : undefined;

  return {
    categoryId: main.id,
    categoryName: main.category_name,
    subcategoryId: child?.id ?? "",
    subcategoryName: child?.category_name ?? "",
    missingSubcategory: Boolean(subcategory && !child),
  };
}
