
-- =====================================================
-- PROJECT : ERP Distribution & Mobile Phone Trading
-- FILE    : 06_rbac_role_mapping.sql
-- PURPOSE : Pemetaan permission ke tujuh role
-- SOURCE  : Hasil query public.role_permissions
-- TOTAL   : 76 pemetaan
-- NOTE    : Dokumentasi saja. Jangan dijalankan ulang.
-- =====================================================

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.permission_code IN (
    'audit.view',
    'dashboard.view',
    'finance.view',
    'inventory.view',
    'master.view',
    'purchasing.view',
    'reports.export',
    'reports.view',
    'sales.view'
)
WHERE r.role_code = 'auditor';

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.permission_code IN (
    'dashboard.view',
    'finance.approve',
    'finance.create',
    'finance.journal',
    'finance.view',
    'reports.export',
    'reports.view'
)
WHERE r.role_code = 'finance';

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.permission_code IN (
    'audit.view',
    'dashboard.view',
    'finance.approve',
    'finance.view',
    'inventory.opname',
    'inventory.view',
    'master.view',
    'purchasing.approve',
    'purchasing.view',
    'reports.export',
    'reports.view',
    'sales.return',
    'sales.view'
)
WHERE r.role_code = 'manager';

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.permission_code IN (
    'audit.view',
    'dashboard.view',
    'finance.approve',
    'finance.create',
    'finance.journal',
    'finance.view',
    'inventory.create',
    'inventory.opname',
    'inventory.transfer',
    'inventory.update',
    'inventory.view',
    'master.create',
    'master.delete',
    'master.update',
    'master.view',
    'purchasing.approve',
    'purchasing.create',
    'purchasing.view',
    'reports.export',
    'reports.view',
    'roles.manage',
    'sales.create',
    'sales.discount',
    'sales.return',
    'sales.view',
    'users.manage',
    'users.view'
)
WHERE r.role_code = 'owner';

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.permission_code IN (
    'dashboard.view',
    'master.create',
    'master.update',
    'master.view',
    'purchasing.create',
    'purchasing.view'
)
WHERE r.role_code = 'purchasing';

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.permission_code IN (
    'dashboard.view',
    'inventory.view',
    'master.view',
    'sales.create',
    'sales.discount',
    'sales.return',
    'sales.view'
)
WHERE r.role_code = 'sales';

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.permission_code IN (
    'dashboard.view',
    'inventory.create',
    'inventory.opname',
    'inventory.transfer',
    'inventory.update',
    'inventory.view',
    'master.view'
)
WHERE r.role_code = 'warehouse';
