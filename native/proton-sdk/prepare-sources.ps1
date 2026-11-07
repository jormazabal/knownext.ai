param(
    [Parameter(Mandatory=$true)][string]$WorkDirectory,
    [string]$Dotnet='dotnet',
    [switch]$FetchOnly
)
$ErrorActionPreference='Stop'
$pins=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'pins.json') -Raw | ConvertFrom-Json
$work=[IO.Path]::GetFullPath($WorkDirectory)
$null=New-Item -ItemType Directory -Path $work -Force
@{sdk=@{version=$pins.dotnetSdk;rollForward='disable';allowPrerelease=$false}}|ConvertTo-Json -Depth 3|Set-Content -LiteralPath (Join-Path $work 'global.json') -Encoding utf8
function Invoke-Checked([string]$Program,[string[]]$Arguments){
    & $Program @Arguments
    if($LASTEXITCODE -ne 0){throw "$Program failed ($LASTEXITCODE)"}
}
function Get-PinnedSource($Pin,[string]$Name){
    $folder=Join-Path $work "sources/$Name"
    if(!(Test-Path -LiteralPath (Join-Path $folder '.git'))){
        if((Test-Path -LiteralPath $folder) -and @(Get-ChildItem -LiteralPath $folder -Force).Count){throw "Refusing non-repository source directory: $Name"}
        $null=New-Item -ItemType Directory -Path $folder -Force
        Invoke-Checked 'git' @('init','--quiet',$folder)
        Invoke-Checked 'git' @('-C',$folder,'remote','add','origin',$Pin.repository)
    }
    $remote=(& git -C $folder remote get-url origin).Trim()
    if($LASTEXITCODE -ne 0 -or $remote -cne $Pin.repository){throw "Unexpected source remote: $Name"}
    $head=& git -C $folder rev-parse --verify HEAD 2>$null
    if($LASTEXITCODE -ne 0 -or $head -cne $Pin.revision){
        Invoke-Checked 'git' @('-C',$folder,'fetch','--depth=1','origin',$Pin.revision)
        Invoke-Checked 'git' @('-C',$folder,'checkout','--quiet','--detach',$Pin.revision)
    }
    $head=(& git -C $folder rev-parse HEAD).Trim()
    if($head -cne $Pin.revision){throw "Source revision mismatch: $Name"}
    # Do not silently reset or build modified vendor sources.
    $changes=& git -C $folder status --porcelain --untracked-files=no
    if($LASTEXITCODE -ne 0 -or $changes){throw "Modified vendor source: $Name"}
    if(!(Test-Path -LiteralPath (Join-Path $folder $Pin.license))){throw "Missing source license: $Name"}
    return $folder
}
$sdk=Get-PinnedSource $pins.sdk 'sdk'
$crypto=Get-PinnedSource $pins.crypto 'crypto'
$manifest=Join-Path $crypto 'src/rust/proton-crypto-ffi/Cargo.toml'
$lock=Join-Path (Split-Path -Parent $manifest) 'Cargo.lock'
$pinnedLock=Join-Path $PSScriptRoot $pins.crypto.cargoLock
Copy-Item -LiteralPath $pinnedLock -Destination $lock -Force
$feed=Join-Path $work 'nuget'
$null=New-Item -ItemType Directory -Path $feed -Force
$nuget=Join-Path $work 'nuget.config'
$escaped=[Security.SecurityElement]::Escape($feed)
[IO.File]::WriteAllText($nuget,"<configuration><packageSources><clear/><add key=`"knownext-proton-source`" value=`"$escaped`"/><add key=`"nuget.org`" value=`"https://api.nuget.org/v3/index.json`"/></packageSources></configuration>",[Text.UTF8Encoding]::new($false))
$previous=Get-Location
Set-Location -LiteralPath $work
try{
$version=(& $Dotnet --version).Trim()
if($LASTEXITCODE -ne 0 -or $version -cne $pins.dotnetSdk){throw "Proton build requires .NET SDK $($pins.dotnetSdk); select that SDK before building"}
if(!$FetchOnly){
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'nuget-locks/Proton.Cryptography.json') -Destination (Join-Path $crypto 'src/dotnet/packages.lock.json') -Force
    Invoke-Checked $Dotnet @('pack',(Join-Path $crypto 'src/dotnet/Proton.Cryptography.csproj'),'-c','Release',"-p:Version=$($pins.cryptoPackageVersion)","-p:PackageVersion=$($pins.cryptoPackageVersion)",'-p:RestoreLockedMode=true','-p:RestorePackagesWithLockFile=true','--configfile',$nuget,'-o',$feed)
    if(!(Test-Path -LiteralPath (Join-Path $feed "Proton.Cryptography.$($pins.cryptoPackageVersion).nupkg"))){throw 'Local source crypto package missing'}
}
}finally{Set-Location -LiteralPath $previous}
$notice=Join-Path $work 'notices'
$null=New-Item -ItemType Directory -Path $notice -Force
Copy-Item -LiteralPath (Join-Path $sdk $pins.sdk.license) -Destination (Join-Path $notice 'Proton-Drive-SDK-MIT.txt')
Copy-Item -LiteralPath (Join-Path $crypto $pins.crypto.license) -Destination (Join-Path $notice 'Proton-Cryptography-MIT.txt')
$package=Join-Path $feed "Proton.Cryptography.$($pins.cryptoPackageVersion).nupkg"
$packageHash=if(!$FetchOnly){(Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash.ToLowerInvariant()}else{$null}
[ordered]@{schemaVersion=1;sdkRevision=$pins.sdk.revision;cryptoRevision=$pins.crypto.revision;sdkRoot=$sdk;accountRoot=(Join-Path $sdk 'incubating/account/cs/src/Proton.Drive.Sdk.Account');cryptoRoot=$crypto;cryptoManifest=$manifest;cryptoCargoLockSha256=(Get-FileHash -LiteralPath $pinnedLock -Algorithm SHA256).Hash.ToLowerInvariant();nugetConfig=$nuget;nugetFeed=$feed;nugetPackagesDirectory=if($packageHash){Join-Path $work "packages-$($packageHash.Substring(0,16))"}else{$null};dotnetVersion=$version;cryptoPackageVersion=$pins.cryptoPackageVersion;cryptoPackageSha256=$packageHash;noticesDirectory=$notice;sourcePackagePrepared=(!$FetchOnly)} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $work 'sources.json') -Encoding utf8
Write-Host "Pinned Proton sources prepared: SDK $($pins.sdk.revision), crypto $($pins.crypto.revision)."
