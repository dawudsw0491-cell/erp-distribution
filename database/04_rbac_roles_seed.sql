-- =====================================================
-- PROJECT : ERP Distribution & Mobile Phone Trading
-- FILE    : 04_rbac_roles_seed.sql
-- PURPOSE : Data awal tujuh role pengguna
-- NOTE    : Dokumentasi SQL yang telah dieksekusi.
--           Jangan jalankan ulang tanpa pemeriksaan.
-- =====================================================

INSERT INTO public.roles (role_code, role_name, description)
VALUES
    ('owner', 'Owner', 'Pemilik usaha dengan kewenangan tertinggi'),
    ('manager', 'Manager', 'Pengelola operasional dan pengawasan bisnis'),
    ('purchasing', 'Purchasing', 'Pengelola pembelian dan pemasok'),
    ('warehouse', 'Warehouse', 'Pengelola gudang dan persediaan'),
    ('sales', 'Sales', 'Pengelola penjualan'),
    ('finance', 'Finance', 'Pengelola keuangan dan akuntansi'),
    ('auditor', 'Auditor', 'Pengguna untuk pemeriksaan dan audit');