param(
  [string]$TargetTriple = "x86_64-pc-windows-msvc"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $repoRoot "backend"
$versionFile = Join-Path $repoRoot "VERSION"
$sidecarDir = Join-Path $repoRoot "apps\desktop\src-tauri\binaries"
$distExe = Join-Path $backendDir "dist\knownext-backend.exe"
$targetExe = Join-Path $sidecarDir "knownext-backend-$TargetTriple.exe"

Push-Location $backendDir
try {
  python -m PyInstaller --noconfirm --clean --onefile --name knownext-backend --hidden-import app.main --collect-submodules app --add-data "$versionFile;." knownext_backend.py
}
finally {
  Pop-Location
}

New-Item -ItemType Directory -Force -Path $sidecarDir | Out-Null
Copy-Item -LiteralPath $distExe -Destination $targetExe -Force
Write-Host "Backend sidecar built: $targetExe"
