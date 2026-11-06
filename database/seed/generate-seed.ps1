
$ErrorActionPreference = "Stop"

# Lokasi file
$SeedPath = $PSScriptRoot
$ProvinceCsv = Join-Path $SeedPath "provinces.csv"
$RegencyCsv = Join-Path $SeedPath "regencies.csv"

$ProvinceSql = Join-Path $SeedPath "01_seed_provinces.sql"
$RegencySql = Join-Path $SeedPath "02_seed_regencies.sql"

Write-Host "=== GENERATOR DATA WILAYAH INDONESIA ===" -ForegroundColor Cyan

# Pastikan file tersedia
foreach ($file in @($ProvinceCsv, $RegencyCsv)) {
    if (-not (Test-Path $file)) {
        throw "File tidak ditemukan: $file"
    }
}

# Membaca CSV
$provinces = @(Import-Csv -Path $ProvinceCsv)
$regencies = @(Import-Csv -Path $RegencyCsv)

# Validasi jumlah
if ($provinces.Count -ne 38) {
    throw "Jumlah provinsi harus 38. Ditemukan: $($provinces.Count)"
}

if ($regencies.Count -ne 514) {
    throw "Jumlah kabupaten/kota harus 514. Ditemukan: $($regencies.Count)"
}

# Validasi duplikasi
if (@($provinces | Group-Object id | Where-Object Count -gt 1).Count -gt 0) {
    throw "Ditemukan ID provinsi duplikat."
}

if (@($regencies | Group-Object id | Where-Object Count -gt 1).Count -gt 0) {
    throw "Ditemukan ID kabupaten/kota duplikat."
}

# Validasi relasi provinsi
$provinceIds = @($provinces | ForEach-Object { $_.id })

$invalidRegencies = @(
    $regencies | Where-Object {
        $provinceIds -notcontains $_.province_id
    }
)

if ($invalidRegencies.Count -gt 0) {
    throw "Ditemukan kabupaten/kota dengan kode provinsi tidak valid."
}

# Fungsi mengamankan teks SQL
function ConvertTo-SqlLiteral {
    param([string]$Value)

    if ($null -eq $Value) {
        throw "Ditemukan nilai kosong."
    }

    return "'" + $Value.Replace("'", "''") + "'"
}

# Membuat SQL provinsi
$provinceValues = foreach ($item in $provinces) {
    if ([string]::IsNullOrWhiteSpace($item.id) -or
        [string]::IsNullOrWhiteSpace($item.name)) {
        throw "Data provinsi tidak lengkap."
    }

    $code = ConvertTo-SqlLiteral $item.id
    $name = ConvertTo-SqlLiteral $item.name

    "($code, $name, true)"
}

$provinceContent = @"
BEGIN;

INSERT INTO public.indonesia_provinces
    (code, name, is_active)
VALUES
$($provinceValues -join ",`n")
ON CONFLICT (code)
DO UPDATE SET
    name = EXCLUDED.name,
    is_active = true;

COMMIT;
"@

# Membuat SQL kabupaten/kota
$regencyValues = foreach ($item in $regencies) {
    if ([string]::IsNullOrWhiteSpace($item.id) -or
        [string]::IsNullOrWhiteSpace($item.province_id) -or
        [string]::IsNullOrWhiteSpace($item.name)) {
        throw "Data kabupaten/kota tidak lengkap."
    }

    if ($item.name -match '^Kabupaten\s+') {
        $type = "KABUPATEN"
    }
    elseif ($item.name -match '^Kota\s+') {
        $type = "KOTA"
    }
    else {
        throw "Jenis wilayah tidak dikenali: $($item.name)"
    }

    $code = ConvertTo-SqlLiteral $item.id
    $provinceCode = ConvertTo-SqlLiteral $item.province_id
    $name = ConvertTo-SqlLiteral $item.name
    $regencyType = ConvertTo-SqlLiteral $type

    "($code, $provinceCode, $name, $regencyType, true)"
}

$regencyContent = @"
BEGIN;

INSERT INTO public.indonesia_regencies
    (code, province_code, name, regency_type, is_active)
VALUES
$($regencyValues -join ",`n")
ON CONFLICT (code)
DO UPDATE SET
    province_code = EXCLUDED.province_code,
    name = EXCLUDED.name,
    regency_type = EXCLUDED.regency_type,
    is_active = true;

COMMIT;
"@

# Simpan file SQL dengan UTF-8
[System.IO.File]::WriteAllText(
    $ProvinceSql,
    $provinceContent,
    [System.Text.UTF8Encoding]::new($false)
)

[System.IO.File]::WriteAllText(
    $RegencySql,
    $regencyContent,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host ""
Write-Host "GENERATOR BERHASIL" -ForegroundColor Green
Write-Host "Provinsi       : $($provinces.Count)"
Write-Host "Kabupaten/Kota : $($regencies.Count)"
Write-Host ""
Write-Host "File SQL dibuat:"
Write-Host "01_seed_provinces.sql"
Write-Host "02_seed_regencies.sql"
Write-Host ""
Write-Host "Database belum diubah." -ForegroundColor Yellow
