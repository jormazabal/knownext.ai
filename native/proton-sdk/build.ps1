param(
    [ValidateSet('win-x64','linux-bionic-arm64','linux-bionic-x64')][string]$Runtime='win-x64',
    [string]$OutputDirectory,
    [string]$Dotnet,
    [string]$SdkRoot,
    [string]$AccountRoot,
    [string]$NugetConfig,
    [string]$NativeCrypto,
    [string]$NdkRoot,
    [switch]$RestoreOnly
)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$work=Join-Path $repo 'target/proton-sdk'
if(!$Dotnet){$Dotnet='dotnet'}
if(!$SdkRoot){$SdkRoot=Join-Path $work 'sources/sdk'}
if(!$AccountRoot){$AccountRoot=Join-Path $SdkRoot 'incubating/account/cs/src/Proton.Drive.Sdk.Account'}
if(!$NugetConfig){$NugetConfig=Join-Path $work 'nuget.config'}
if(!$OutputDirectory){$OutputDirectory=Join-Path $work "publish/$Runtime"}
foreach($required in @($SdkRoot,$AccountRoot,$NugetConfig)){
    if(!(Test-Path -LiteralPath $required)){throw 'Pinned Proton sources/package feed missing; run prepare-sources.ps1 first'}
}
$pins=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'pins.json') -Raw|ConvertFrom-Json
$NugetConfig=[IO.Path]::GetFullPath($NugetConfig)
$sourcesFile=Join-Path (Split-Path -Parent $NugetConfig) 'sources.json'
if(!(Test-Path -LiteralPath $sourcesFile)){throw 'Pinned source receipt missing; run prepare-sources.ps1 first'}
$sources=Get-Content -LiteralPath $sourcesFile -Raw|ConvertFrom-Json
if(!$sources.sourcePackagePrepared){throw 'Prepare the local crypto package before restoring the bridge'}
& (Join-Path $PSScriptRoot 'prepare-restore.ps1') -SourcesReceipt $sourcesFile -Runtime $Runtime
$priorDirectory=Get-Location
$priorPackages=$env:NUGET_PACKAGES
$env:NUGET_PACKAGES=$sources.nugetPackagesDirectory
Set-Location -LiteralPath (Split-Path -Parent $sourcesFile)
try{
$dotnetVersion=(& $Dotnet --version).Trim()
if($LASTEXITCODE -ne 0 -or $dotnetVersion -cne $pins.dotnetSdk){throw "Proton build requires .NET SDK $($pins.dotnetSdk)"}
$OutputDirectory=[IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $OutputDirectory|Out-Null
$env:DOTNET_CLI_TELEMETRY_OPTOUT='1'
$properties=@("-p:ProtonSdkRoot=$SdkRoot","-p:ProtonAccountRoot=$AccountRoot",'-p:CryptoBackend=rust',"-p:ProtonCryptographyVersion=$($pins.cryptoPackageVersion)")
& $Dotnet restore (Join-Path $PSScriptRoot 'KnownextProton.csproj') -r $Runtime --locked-mode --configfile $NugetConfig @properties
if($LASTEXITCODE -ne 0){throw 'Pinned NuGet restore failed'}
if($RestoreOnly){return}
$arguments=@('publish',(Join-Path $PSScriptRoot 'KnownextProton.csproj'),'-c','Release','-r',$Runtime,'--no-restore')+$properties+@("-p:NativeOutputPath=$OutputDirectory/link/",'-o',$OutputDirectory)
if($Runtime -ne 'win-x64'){
    if(!$NdkRoot){$NdkRoot=Join-Path $env:LOCALAPPDATA 'Android/Sdk/ndk/28.2.13676358'}
    $hostTag=if($IsWindows){'windows-x86_64'}else{'linux-x86_64'}
    $env:PATH=(Join-Path $NdkRoot "toolchains/llvm/prebuilt/$hostTag/bin")+[IO.Path]::PathSeparator+$env:PATH
    $arguments+=@('-p:DisableUnsupportedError=true','-p:PublishAotUsingRuntimePack=true','-p:CppCompilerAndLinker=clang','-p:CrossCompileAbi=android29','-p:StripSymbols=false')
}
& $Dotnet @arguments
if($LASTEXITCODE -ne 0){throw "Native SDK wrapper build failed ($LASTEXITCODE)"}
$binary=if($Runtime -eq 'win-x64'){'Proton.Drive.Sdk.Account.dll'}else{'Proton.Drive.Sdk.Account.so'}
$target=if($Runtime -eq 'win-x64'){'knownext_proton.dll'}else{'libknownext_proton.so'}
Copy-Item -LiteralPath (Join-Path $OutputDirectory $binary) -Destination (Join-Path $OutputDirectory $target)
if($NativeCrypto){
    $cryptoTarget=if($Runtime -eq 'win-x64'){'proton_crypto.dll'}else{'libproton_crypto.so'}
    Copy-Item -LiteralPath $NativeCrypto -Destination (Join-Path $OutputDirectory $cryptoTarget)
}
Get-ChildItem -LiteralPath $OutputDirectory -File|Where-Object{$_.Extension -in @('.dll','.so')}|ForEach-Object{
    [pscustomobject]@{name=$_.Name;bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}
}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $OutputDirectory 'artifacts.json') -Encoding utf8
}finally{Set-Location -LiteralPath $priorDirectory;$env:NUGET_PACKAGES=$priorPackages}
