BEGIN;

INSERT INTO public.indonesia_provinces
    (code, name, is_active)
VALUES
('11', 'Aceh', true),
('12', 'Sumatera Utara', true),
('13', 'Sumatera Barat', true),
('14', 'Riau', true),
('15', 'Jambi', true),
('16', 'Sumatera Selatan', true),
('17', 'Bengkulu', true),
('18', 'Lampung', true),
('19', 'Kepulauan Bangka Belitung', true),
('21', 'Kepulauan Riau', true),
('31', 'Daerah Khusus Ibukota Jakarta', true),
('32', 'Jawa Barat', true),
('33', 'Jawa Tengah', true),
('34', 'Daerah Istimewa Yogyakarta', true),
('35', 'Jawa Timur', true),
('36', 'Banten', true),
('51', 'Bali', true),
('52', 'Nusa Tenggara Barat', true),
('53', 'Nusa Tenggara Timur', true),
('61', 'Kalimantan Barat', true),
('62', 'Kalimantan Tengah', true),
('63', 'Kalimantan Selatan', true),
('64', 'Kalimantan Timur', true),
('65', 'Kalimantan Utara', true),
('71', 'Sulawesi Utara', true),
('72', 'Sulawesi Tengah', true),
('73', 'Sulawesi Selatan', true),
('74', 'Sulawesi Tenggara', true),
('75', 'Gorontalo', true),
('76', 'Sulawesi Barat', true),
('81', 'Maluku', true),
('82', 'Maluku Utara', true),
('91', 'Papua', true),
('92', 'Papua Barat', true),
('93', 'Papua Selatan', true),
('94', 'Papua Tengah', true),
('95', 'Papua Pegunungan', true),
('96', 'Papua Barat Daya', true)
ON CONFLICT (code)
DO UPDATE SET
    name = EXCLUDED.name,
    is_active = true;

COMMIT;