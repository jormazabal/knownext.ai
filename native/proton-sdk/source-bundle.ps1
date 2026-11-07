param([Parameter(Mandatory=$true)][string]$SourcesReceipt,[Parameter(Mandatory=$true)][string]$OutputFile)
$ErrorActionPreference='Stop'
$source=Get-Content -LiteralPath $SourcesReceipt -Raw|ConvertFrom-Json
$out=[IO.Path]::GetFullPath($OutputFile)
$stage=Join-Path (Split-Path -Parent $out) 'source-bundle'
$null=New-Item -ItemType Directory -Path $stage -Force
foreach($item in @(@('sdk',$source.sdkRoot,$source.sdkRevision),@('crypto',$source.cryptoRoot,$source.cryptoRevision))){
    $archive=Join-Path $stage ($item[0]+'-source.tar')
    & git -C $item[1] archive --format=tar "--output=$archive" $item[2]
    if($LASTEXITCODE -ne 0){throw 'Pinned source archive failed'}
}
$adapter=Join-Path $stage 'knownext-adapter'
$null=New-Item -ItemType Directory -Path $adapter -Force
Get-ChildItem -LiteralPath $PSScriptRoot -File | Where-Object {$_.Extension -in @('.cs','.csproj','.ps1','.mjs','.json','.lock','.md')} | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $adapter $_.Name) -Force}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'nuget-locks') -Destination (Join-Path $adapter 'nuget-locks') -Recurse -Force
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Copy-Item -LiteralPath (Join-Path $repo 'LICENSE') -Destination (Join-Path $adapter 'LICENSE') -Force
$metadata=Join-Path (Split-Path -Parent $SourcesReceipt) 'crypto-metadata.json'
if(!(Test-Path -LiteralPath $metadata)){throw 'The exact crypto dependency graph is required for corresponding sources'}
$licenseInventory=Join-Path (Split-Path -Parent $SourcesReceipt) 'license-inventory.json'
if(!(Test-Path -LiteralPath $licenseInventory)){throw 'Dependency license inventory is required before source distribution'}
Copy-Item -LiteralPath $licenseInventory -Destination (Join-Path $stage 'license-inventory.json') -Force
Copy-Item -LiteralPath (Join-Path $source.noticesDirectory 'THIRD-PARTY-NOTICES.txt') -Destination (Join-Path $stage 'THIRD-PARTY-NOTICES.txt') -Force
& {
    $packages=(Get-Content -LiteralPath $metadata -Raw|ConvertFrom-Json).packages
    $cache=if($env:CARGO_HOME){Join-Path $env:CARGO_HOME 'registry/cache'}else{Join-Path $HOME '.cargo/registry/cache'}
    $dependencySources=Join-Path $stage 'rust-dependencies'
    $null=New-Item -ItemType Directory -Path $dependencySources -Force
    foreach($package in $packages | Where-Object {$_.source -like 'registry+*'}){
        $name="$($package.name)-$($package.version).crate"
        $archives=@(Get-ChildItem -LiteralPath $cache -Directory | ForEach-Object {Get-Item -LiteralPath (Join-Path $_.FullName $name) -ErrorAction SilentlyContinue})
        if($archives.Count -eq 0){throw "Missing exact dependency source archive: $name"}
        $hashes=@($archives|ForEach-Object {(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}|Select-Object -Unique)
        if($hashes.Count -ne 1){throw "Ambiguous dependency source archive: $name"}
        Copy-Item -LiteralPath $archives[0].FullName -Destination (Join-Path $dependencySources $name) -Force
    }
}
@'
Pinned corresponding sources for the Proton native adapter.
sdk-source.tar and crypto-source.tar are git archives of the exact revisions in
knownext-adapter/pins.json. The adapter contains its recipe and explicit Rust lock.
rust-dependencies contains registry .crate source archives selected by the locked
dependency graph; each archive carries its own license. The locally named crypto
package 0.40.1-p0 is built from these sources, not represented as an upstream binary.
NuGet dependencies and .NET are covered by distributed THIRD-PARTY-NOTICES.txt and
their original package/source license terms; this archive makes no claim to own or
relicense them. This archive contains no account data or signing credentials.
'@ | Set-Content -LiteralPath (Join-Path $stage 'README.txt') -Encoding utf8
$sources=@(Get-ChildItem -LiteralPath $stage -Recurse -File|ForEach-Object {[ordered]@{path=[IO.Path]::GetRelativePath($stage,$_.FullName).Replace('\','/');bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}})
[ordered]@{schemaVersion=1;sdkRevision=$source.sdkRevision;cryptoRevision=$source.cryptoRevision;files=$sources}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $stage 'manifest.json') -Encoding utf8
Compress-Archive -LiteralPath @(Get-ChildItem -LiteralPath $stage -Force | Select-Object -ExpandProperty FullName) -DestinationPath $out -Force
Write-Host 'Pinned Proton source archive prepared without account/signing data.'
