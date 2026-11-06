
-- =====================================================
-- PROJECT : ERP Distribution & Mobile Phone Trading
-- FILE    : 05_rbac_permissions_seed.sql
-- PURPOSE : Data awal 27 permission sistem
-- SOURCE  : Hasil pemeriksaan tabel public.permissions
-- NOTE    : Dokumentasi saja. Jangan dijalankan ulang.
-- =====================================================

INSERT INTO public.permissions
    (permission_code, permission_name, description)
VALUES
    ('audit.view', 'Melihat Audit Trail',
     'Melihat riwayat aktivitas sistem'),

    ('dashboard.view', 'Melihat Dashboard',
     'Akses dashboard ERP'),

    ('finance.approve', 'Menyetujui Transaksi Keuangan',
     'Persetujuan transaksi keuangan'),

    ('finance.create', 'Mencatat Keuangan',
     'Mencatat transaksi keuangan'),

    ('finance.journal', 'Mengelola Jurnal',
     'Mengelola jurnal akuntansi'),

    ('finance.view', 'Melihat Keuangan',
     'Melihat data keuangan'),

    ('inventory.create', 'Mencatat Persediaan',
     'Mencatat penerimaan persediaan'),

    ('inventory.opname', 'Stock Opname',
     'Melakukan stock opname'),

    ('inventory.transfer', 'Transfer Antar Gudang',
     'Memindahkan stok antar gudang'),

    ('inventory.update', 'Mengubah Persediaan',
     'Mengubah data persediaan'),

    ('inventory.view', 'Melihat Persediaan',
     'Melihat stok dan IMEI'),

    ('master.create', 'Membuat Master Data',
     'Menambah data master'),

    ('master.delete', 'Menghapus Master Data',
     'Menghapus data master'),

    ('master.update', 'Mengubah Master Data',
     'Mengubah data master'),

    ('master.view', 'Melihat Master Data',
     'Melihat data master'),

    ('purchasing.approve', 'Menyetujui Pembelian',
     'Persetujuan pembelian'),

    ('purchasing.create', 'Membuat Pembelian',
     'Membuat transaksi pembelian'),

    ('purchasing.view', 'Melihat Pembelian',
     'Melihat transaksi pembelian'),

    ('reports.export', 'Ekspor Laporan',
     'Mengunduh laporan'),

    ('reports.view', 'Melihat Laporan',
     'Akses laporan operasional dan keuangan'),

    ('roles.manage', 'Mengelola Role dan Permission',
     'Mengelola hak akses sistem'),

    ('sales.create', 'Membuat Penjualan',
     'Mencatat transaksi penjualan'),

    ('sales.discount', 'Memberikan Diskon',
     'Memberikan diskon penjualan'),

    ('sales.return', 'Memproses Retur',
     'Memproses retur penjualan'),

    ('sales.view', 'Melihat Penjualan',
     'Melihat transaksi penjualan'),

    ('users.manage', 'Mengelola Pengguna',
     'Mengelola akun dan role pengguna'),

    ('users.view', 'Melihat Pengguna',
     'Melihat akun pengguna');
