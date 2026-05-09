param(
  [Parameter(Mandatory = $true)]
  [string]$Path
)

$ErrorActionPreference = "Stop"

$resolvedPath = Resolve-Path -LiteralPath $Path
$thumbprint = $env:WINDOWS_CERTIFICATE_THUMBPRINT
$timestampUrl = if ($env:WINDOWS_TIMESTAMP_URL) { $env:WINDOWS_TIMESTAMP_URL } else { "http://timestamp.digicert.com" }
$signingRequired = $env:WINDOWS_SIGNING_REQUIRED -eq "true"

if ([string]::IsNullOrWhiteSpace($thumbprint)) {
  if ($signingRequired) {
    throw "WINDOWS_CERTIFICATE_THUMBPRINT is required for Windows release signing."
  }

  Write-Host "WINDOWS_CERTIFICATE_THUMBPRINT is not set; skipping Authenticode signing for $resolvedPath."
  exit 0
}

$signtool = Get-ChildItem -Path "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Filter signtool.exe -Recurse |
  Where-Object { $_.FullName -match "\\x64\\signtool\.exe$" } |
  Sort-Object FullName -Descending |
  Select-Object -First 1

if (-not $signtool) {
  throw "signtool.exe was not found in the Windows SDK."
}

& $signtool.FullName sign /sha1 $thumbprint /fd SHA256 /tr $timestampUrl /td SHA256 /v $resolvedPath
if ($LASTEXITCODE -ne 0) {
  throw "signtool failed with exit code $LASTEXITCODE."
}

$signature = Get-AuthenticodeSignature -LiteralPath $resolvedPath
if ($signature.Status -ne "Valid") {
  throw "Authenticode signature is not valid for $resolvedPath. Status: $($signature.Status)"
}
