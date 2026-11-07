param([Parameter(Mandatory=$true)][string]$SourcesReceipt,[Parameter(Mandatory=$true)][ValidateSet('win-x64','linux-bionic-arm64','linux-bionic-x64')][string]$Runtime)
$ErrorActionPreference='Stop'
$source=Get-Content -LiteralPath $SourcesReceipt -Raw|ConvertFrom-Json
$pins=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'pins.json') -Raw|ConvertFrom-Json
$package=Join-Path $source.nugetFeed "Proton.Cryptography.$($pins.cryptoPackageVersion).nupkg"
$hash=[Convert]::ToBase64String([Security.Cryptography.SHA512]::HashData([IO.File]::ReadAllBytes($package)))
function Copy-Lock([string]$Name,[string]$Destination){
    $value=Get-Content -LiteralPath (Join-Path $PSScriptRoot "nuget-locks/$Runtime/$Name.json") -Raw|ConvertFrom-Json -AsHashtable
    foreach($framework in $value.dependencies.Values){
        if($framework.ContainsKey('Proton.Cryptography')){
            if($framework['Proton.Cryptography'].resolved -cne $pins.cryptoPackageVersion){throw 'Unexpected local crypto lock version'}
            # Only our freshly source-built local package may vary (NuGet zip
            # timestamps). All external versions and content hashes stay pinned.
            $framework['Proton.Cryptography'].contentHash=$hash
        }
    }
    $null=New-Item -ItemType Directory -Path (Split-Path -Parent $Destination) -Force
    $value|ConvertTo-Json -Depth 30|Set-Content -LiteralPath $Destination -Encoding utf8
}
foreach($name in @('Proton.Sdk','Proton.Drive.Sdk')){Copy-Lock $name (Join-Path $source.sdkRoot "client/cs/src/$name/packages.lock.json")}
Copy-Lock 'KnownextProton' (Join-Path $PSScriptRoot "obj/$Runtime.packages.lock.json")
Write-Host "Pinned external NuGet graph prepared for $Runtime; local crypto package identity verified."
