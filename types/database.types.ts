
export type SupplierType = "company" | "individual";

export type SupplierRow = {
  id: string;
  supplier_code: string;
  supplier_name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  tax_number: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  payment_term_days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  supplier_type: SupplierType;
  legal_name: string | null;
  business_license_number: string | null;
  website: string | null;
  credit_limit: number;
  currency_code: string;
  created_by: string | null;
};

export type SupplierInsert = {
  id?: string;
  supplier_code: string;
  supplier_name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  tax_number?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  payment_term_days?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  supplier_type?: SupplierType;
  legal_name?: string | null;
  business_license_number?: string | null;
  website?: string | null;
  credit_limit?: number;
  currency_code?: string;
  created_by?: string | null;
};

export type SupplierUpdate = {
  supplier_code?: string;
  supplier_name?: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  tax_number?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  payment_term_days?: number;
  is_active?: boolean;
  supplier_type?: SupplierType;
  legal_name?: string | null;
  business_license_number?: string | null;
  website?: string | null;
  credit_limit?: number;
  currency_code?: string;
  created_by?: string | null;
};
