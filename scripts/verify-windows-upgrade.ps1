param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F]{64}$')]
    [string]$CandidateSha256
)

$ErrorActionPreference = 'Stop'
if (!$IsWindows -or $env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or
    $env:GITHUB_REPOSITORY -ne 'jormazabal/knownext.ai' -or $env:GITHUB_EVENT_NAME -ne 'workflow_dispatch') {
    throw 'This upgrade check requires the isolated GitHub-hosted Windows runner.'
}

$work = Join-Path $env:RUNNER_TEMP 'knownext-msi-upgrade'
$evidence = Join-Path $work 'evidence'
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$baselinePath = Join-Path $work 'KnowNext.ai_2.6.0_x64_en-US.msi'
$candidatePath = Join-Path $work 'KnowNext.ai_3.0.0_x64_en-US.msi'
$baselineHash = '9fed807911e341aa6e4ba6f99e2553750cd2b56711a265723116ae7e1008d591'
$family = '{389ECB95-C3D2-5327-872C-5E9508C14B2A}'
$installKey = 'HKCU:\Software\knownext\KnowNext.ai'
$uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
$appData = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'ai.knownext.desktop'
$localData = [Environment]::GetFolderPath('LocalApplicationData')
$repo = Split-Path -Parent $PSScriptRoot

function Read-VerifiedMsi([string]$Path, [string]$ExpectedHash, [string]$Version) {
    $hash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($hash -ine $ExpectedHash) { throw "MSI SHA-256 mismatch for $Version." }
    $installer = New-Object -ComObject WindowsInstaller.Installer
    $database = $installer.OpenDatabase($Path, 0)
    $view = $database.OpenView('SELECT `Property`, `Value` FROM `Property`')
    $properties = @{}
    [void]$view.Execute()
    try {
        while ($row = $view.Fetch()) { $properties[$row.StringData(1)] = $row.StringData(2) }
    } finally {
        [void]$view.Close()
    }
    if ($properties.ProductName -cne 'KnowNext.ai' -or $properties.Manufacturer -cne 'knownext' -or
        $properties.ProductVersion -ne $Version -or $properties.UpgradeCode -ine $family -or
        $properties.ALLUSERS -ne '2' -or $properties.MSIINSTALLPERUSER -ne '1' -or
        $properties.ProductCode -notmatch '^\{[0-9a-fA-F-]{36}\}$') {
        throw "Unexpected MSI identity or installation scope for $Version."
    }
    return [ordered]@{ sha256 = $hash; version = $Version; upgradeCode = $properties.UpgradeCode; productCode = $properties.ProductCode }
}

function Assert-AppStopped {
    if (Get-Process -Name 'knownext-ai-desktop' -ErrorAction SilentlyContinue) { throw 'Unexpected running KnowNext process on the verification runner.' }
}

function Install-PerUserMsi([string]$Path, [string]$LogName) {
    $log = Join-Path $evidence $LogName
    $arguments = @('/i', ('"' + $Path + '"'), '/qn', '/norestart', 'REBOOT=ReallySuppress', 'ALLUSERS=2', 'MSIINSTALLPERUSER=1', '/L*v', ('"' + $log + '"'))
    $process = Start-Process -FilePath (Join-Path $env:SystemRoot 'System32/msiexec.exe') -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "MSI failed with exit $($process.ExitCode). See $LogName." }
    Assert-AppStopped
}

function Read-InstalledRegistration($Package) {
    $entry = Get-ItemProperty -LiteralPath (Join-Path $uninstallKey $Package.productCode)
    if ($entry.DisplayName -cne 'KnowNext.ai' -or $entry.DisplayVersion -ne $Package.version -or $entry.WindowsInstaller -ne 1) {
        throw "Incorrect HKCU uninstall registration for $($Package.version)."
    }
    $path = (Get-ItemProperty -LiteralPath $installKey -Name InstallDir).InstallDir
    $full = [IO.Path]::GetFullPath($path).TrimEnd('\', '/')
    if (!$full.StartsWith($localData.TrimEnd('\', '/') + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'The installer did not register a per-user installation path.'
    }
    $exe = Join-Path $full 'knownext-ai-desktop.exe'
    if (!(Test-Path -LiteralPath $exe -PathType Leaf)) { throw 'The registered installation does not contain the executable.' }
    return [ordered]@{ installDir = $full; displayVersion = $entry.DisplayVersion; executableSha256 = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant() }
}

$proof = [ordered]@{ pass = $false; runner = 'github-hosted-windows'; scope = 'Per-user MSI installation and upgrade with synthetic AppData'; phase = 'verify-inputs' }
try {
    $proof.baseline = Read-VerifiedMsi $baselinePath $baselineHash '2.6.0'
    $proof.candidate = Read-VerifiedMsi $candidatePath $CandidateSha256 '3.0.0'
    if ($proof.baseline.productCode -ieq $proof.candidate.productCode) { throw 'The MSI versions must have distinct ProductCodes.' }
    Assert-AppStopped
    if ((Test-Path -LiteralPath $appData) -or (Test-Path -LiteralPath $installKey) -or
        (Test-Path -LiteralPath (Join-Path $uninstallKey $proof.baseline.productCode)) -or
        (Test-Path -LiteralPath (Join-Path $uninstallKey $proof.candidate.productCode))) {
        throw 'The verification runner already has KnowNext state.'
    }

    $proof.phase = 'install-baseline'
    Install-PerUserMsi $baselinePath 'install-2.6.0.log'
    $proof.baselineInstalled = Read-InstalledRegistration $proof.baseline
    New-Item -ItemType Directory -Path $appData -Force | Out-Null
    $witness = Join-Path $appData 'synthetic-msi-upgrade-witness.json'
    [ordered]@{ schemaVersion = 1; synthetic = $true; fixture = 'KnowNext MSI upgrade'; run = $env:GITHUB_RUN_ID } |
        ConvertTo-Json | Set-Content -LiteralPath $witness -Encoding utf8
    $witnessHash = (Get-FileHash -LiteralPath $witness -Algorithm SHA256).Hash.ToLowerInvariant()

    $proof.phase = 'upgrade-candidate'
    Install-PerUserMsi $candidatePath 'upgrade-3.0.0.log'
    $proof.candidateInstalled = Read-InstalledRegistration $proof.candidate
    if ($proof.candidateInstalled.installDir -ine $proof.baselineInstalled.installDir) { throw 'The upgrade changed the registered installation path.' }
    if (Test-Path -LiteralPath (Join-Path $uninstallKey $proof.baseline.productCode)) { throw 'The old ProductCode remains registered after the upgrade.' }
    if ((Get-FileHash -LiteralPath $witness -Algorithm SHA256).Hash -ine $witnessHash) { throw 'The synthetic AppData witness changed.' }
    $proof.witness = [ordered]@{ sha256 = $witnessHash; preserved = $true }
    $proof.oldProductRegistrationRemoved = $true

    $proof.phase = 'verify-installed-resources'
    $native = Join-Path $proof.candidateInstalled.installDir 'resources/proton/windows'
    & node (Join-Path $PSScriptRoot 'check-proton-windows.mjs') $native > (Join-Path $evidence 'installed-proton-resources.json')
    if ($LASTEXITCODE -ne 0) { throw 'Installed Proton resource verification failed.' }
    $font = 'crates/knownext-docs/assets/fonts/OFL.txt'
    $installedFont = Get-FileHash -LiteralPath (Join-Path $proof.candidateInstalled.installDir $font) -Algorithm SHA256
    $sourceFont = Get-FileHash -LiteralPath (Join-Path $repo "apps/desktop/src-tauri/$font") -Algorithm SHA256
    if ($installedFont.Hash -cne $sourceFont.Hash) { throw 'Installed font notice differs from the bundled license.' }
    $components = Get-ItemProperty -LiteralPath (Join-Path $installKey 'Components')
    if ($components.'Noto font license' -ne 1 -or $components.'Proton native SDK' -ne 1) { throw 'Installed resource components lack HKCU registration.' }
    Assert-AppStopped
    $proof.resourceRegistrationVerified = $true
    $proof.phase = 'complete'
    $proof.pass = $true
    Write-Host 'Verified per-user MSI upgrade, synthetic AppData continuity, and installed resources.'
} catch {
    $proof.error = $_.Exception.Message
    throw
} finally {
    $proof | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $evidence 'msi-upgrade.json') -Encoding utf8
}
