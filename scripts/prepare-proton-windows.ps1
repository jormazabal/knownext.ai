param(
    [string]$WorkDirectory,
    [string]$Dotnet='dotnet',
    [switch]$WriteGitHubEnvironment
)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(!$WorkDirectory){$WorkDirectory=Join-Path $repo 'target/proton-sdk'}
$work=[IO.Path]::GetFullPath($WorkDirectory)
$pins=Get-Content -LiteralPath (Join-Path $repo 'native/proton-sdk/pins.json') -Raw|ConvertFrom-Json
function Invoke-Checked([string]$Program,[string[]]$Arguments){& $Program @Arguments;if($LASTEXITCODE -ne 0){throw "$Program failed ($LASTEXITCODE)"}}
if(![Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([Runtime.InteropServices.OSPlatform]::Windows)){throw 'Windows Proton native preparation requires Windows/MSVC'}
$rust=(& rustc --version).Trim()
if($LASTEXITCODE -ne 0 -or !$rust.StartsWith("rustc $($pins.rustToolchain) ")){throw "Select Rust $($pins.rustToolchain) for the pinned Proton build"}
& (Join-Path $repo 'native/proton-sdk/prepare-sources.ps1') -WorkDirectory $work -Dotnet $Dotnet
$sources=Get-Content -LiteralPath (Join-Path $work 'sources.json') -Raw|ConvertFrom-Json
$oldFlags=$env:RUSTFLAGS
$oldTarget=$env:CARGO_TARGET_DIR
$previous=Get-Location
try{
    # The QA DLL linked VCRUNTIME140. Release must work without an installed
    # Visual C++ redistributable or a user-installed Proton/.NET client.
    $env:RUSTFLAGS='-C target-feature=+crt-static'
    $env:CARGO_TARGET_DIR=Join-Path $work 'crypto-target'
    Set-Location -LiteralPath (Split-Path -Parent $sources.cryptoManifest)
    Invoke-Checked 'cargo' @('build','--release','--locked','--target','x86_64-pc-windows-msvc')
    $metadata=& cargo metadata --format-version 1 --locked --filter-platform x86_64-pc-windows-msvc
    if($LASTEXITCODE -ne 0){throw 'Could not capture the pinned crypto dependency graph'}
    [IO.File]::WriteAllText((Join-Path $work 'crypto-metadata.json'),($metadata -join "`n"),[Text.UTF8Encoding]::new($false))
}finally{
    Set-Location -LiteralPath $previous
    $env:RUSTFLAGS=$oldFlags
    $env:CARGO_TARGET_DIR=$oldTarget
}
$crypto=Join-Path $work 'crypto-target/x86_64-pc-windows-msvc/release/proton_crypto.dll'
$publish=Join-Path $work 'publish/win-x64'
& (Join-Path $repo 'native/proton-sdk/build.ps1') -Runtime win-x64 -Dotnet $Dotnet -SdkRoot $sources.sdkRoot -AccountRoot $sources.accountRoot -NugetConfig $sources.nugetConfig -NativeCrypto $crypto -OutputDirectory $publish
$destination=Join-Path $repo 'apps/desktop/src-tauri/resources/proton/windows'
$null=New-Item -ItemType Directory -Path $destination -Force
foreach($name in @('knownext_proton.dll','proton_crypto.dll')){Copy-Item -LiteralPath (Join-Path $publish $name) -Destination (Join-Path $destination $name) -Force}
$dotnetExe=(Get-Command $Dotnet -ErrorAction Stop).Source
$dotnetRoot=Split-Path -Parent $dotnetExe
Invoke-Checked 'node' @((Join-Path $repo 'native/proton-sdk/write-notices.mjs'),(Join-Path $work 'sources.json'),$dotnetRoot,(Join-Path $destination 'THIRD-PARTY-NOTICES.txt'))
$libraries=[ordered]@{}
foreach($name in @('knownext_proton.dll','proton_crypto.dll')){$file=Join-Path $destination $name;$libraries[$name]=[ordered]@{bytes=(Get-Item -LiteralPath $file).Length;sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()}}
[ordered]@{schemaVersion=1;sdkRevision=$sources.sdkRevision;cryptoRevision=$sources.cryptoRevision;cryptoPackageVersion=$pins.cryptoPackageVersion;cryptoCargoLockSha256=$sources.cryptoCargoLockSha256;dotnetSdk=$pins.dotnetSdk;rustToolchain=$pins.rustToolchain;target='win-x64';nativeCryptoTarget='x86_64-pc-windows-msvc';crt='static';libraries=$libraries;noticesSha256=(Get-FileHash -LiteralPath (Join-Path $destination 'THIRD-PARTY-NOTICES.txt') -Algorithm SHA256).Hash.ToLowerInvariant()}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $destination 'provenance.json') -Encoding utf8
Invoke-Checked 'node' @((Join-Path $repo 'scripts/check-proton-windows.mjs'),$destination)
& (Join-Path $repo 'native/proton-sdk/probe.ps1') -Library (Join-Path $destination 'knownext_proton.dll')
if(!$?){throw 'Native SDK offline ABI/crypto verification failed'}
$config=Get-Content -LiteralPath (Join-Path $repo 'apps/desktop/src-tauri/tauri.conf.json') -Raw|ConvertFrom-Json
$family=$config.bundle.windows.wix.upgradeCode
if($env:TAURI_CONFIG){$override=$env:TAURI_CONFIG|ConvertFrom-Json;if($override.bundle.windows.wix.upgradeCode){$family=$override.bundle.windows.wix.upgradeCode}}
$hash=[Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes("$family/knownext-proton-resources/v1"))
$hex=[Convert]::ToHexString($hash).Substring(0,32).ToLowerInvariant()
$component="{0}-{1}-5{2}-a{3}-{4}" -f $hex.Substring(0,8),$hex.Substring(8,4),$hex.Substring(13,3),$hex.Substring(17,3),$hex.Substring(20,12)
$environment=[ordered]@{TAURI_KNOWNEXT_FONT_LICENSE=(Join-Path $repo 'apps/desktop/src-tauri/crates/knownext-docs/assets/fonts/OFL.txt');TAURI_KNOWNEXT_PROTON_RESOURCES=$destination;TAURI_KNOWNEXT_PROTON_COMPONENT_GUID=$component}
$distribution=Join-Path $work 'distribution'
$null=New-Item -ItemType Directory -Path $distribution -Force
$releaseOutput=Join-Path $repo 'output'
$null=New-Item -ItemType Directory -Path $releaseOutput -Force
$sourceArchive=Join-Path $releaseOutput 'knownext-proton-sources-windows.zip'
& (Join-Path $repo 'native/proton-sdk/source-bundle.ps1') -SourcesReceipt (Join-Path $work 'sources.json') -OutputFile $sourceArchive
$environment['KNOWNEXT_PROTON_WINDOWS_SOURCES']=$sourceArchive
$environment|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $destination 'resources-env.json') -Encoding utf8
if($WriteGitHubEnvironment){if(!$env:GITHUB_ENV){throw 'GITHUB_ENV is not available'};foreach($entry in $environment.GetEnumerator()){"$($entry.Key)=$($entry.Value)"|Out-File -LiteralPath $env:GITHUB_ENV -Append -Encoding utf8}}
Write-Host 'Windows Proton resources prepared and verified offline; no account or cloud calls.'
