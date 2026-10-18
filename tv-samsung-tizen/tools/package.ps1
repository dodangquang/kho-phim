[CmdletBinding()]
param(
    [switch]$Unsigned,
    [string]$SecurityProfile,
    [string]$TizenCli = 'C:\tizen-studio\tools\ide\bin\tizen.bat',
    [string]$OutputDirectory,
    [string]$StagingDirectory
)
$ErrorActionPreference = 'Stop'
$projectPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$widgetConfig = [xml](Get-Content -LiteralPath (Join-Path $projectPath 'config.xml') -Raw)
$widgetVersion = [string]$widgetConfig.widget.version
if ($widgetVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid widget version in config.xml.' }
if (-not $OutputDirectory) { $OutputDirectory = Split-Path -Parent $projectPath }
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$outputPath = (Resolve-Path -LiteralPath $OutputDirectory).Path
if (-not $StagingDirectory) { $StagingDirectory = Join-Path $projectPath '.build' }
$stagePath = Join-Path $StagingDirectory ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stagePath -Force | Out-Null
$runtimeFiles = @('config.xml', 'index.html', 'style.css', 'tv-compat.css', 'boot.js', 'core.js', 'player.js', 'posters.js', 'home.js', 'app.js', 'icon.png')
foreach ($runtimeFile in $runtimeFiles) {
    Copy-Item -LiteralPath (Join-Path $projectPath $runtimeFile) -Destination $stagePath
}
if ($Unsigned) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $destination = Join-Path $outputPath "KhoPhim_Samsung_Tizen_v${widgetVersion}_UNSIGNED.wgt"
    if (Test-Path -LiteralPath $destination) { throw "Output already exists: $destination. Choose a different output folder." }
    [IO.Compression.ZipFile]::CreateFromDirectory($stagePath, $destination, [IO.Compression.CompressionLevel]::Optimal, $false)
    Write-Warning 'UNSIGNED: sign with a Samsung certificate profile covering your TV DUID before installation.'
} else {
    if (-not $SecurityProfile) { throw 'Specify -SecurityProfile with your Samsung TV certificate profile, or -Unsigned for a source widget.' }
    if (-not (Test-Path -LiteralPath $TizenCli)) { throw "Tizen CLI not found: $TizenCli. Install Tizen Studio + Samsung TV Extension + Samsung Certificate Extension." }
    & $TizenCli package -t wgt -s $SecurityProfile -- $stagePath
    if ($LASTEXITCODE -ne 0) { throw 'Tizen package/sign failed. No signed release produced.' }
    $signedPackages = @(Get-ChildItem -LiteralPath $stagePath -Filter '*.wgt' -File)
    if ($signedPackages.Count -ne 1) { throw 'Expected one WGT from the Tizen packager.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($signedPackages[0].FullName)
    try {
        if (-not $archive.GetEntry('author-signature.xml') -or -not $archive.GetEntry('signature1.xml')) {
            throw 'Tizen package has no complete signature. Check the certificate profile.'
        }
    } finally { $archive.Dispose() }
    $destination = Join-Path $outputPath "KhoPhim_Samsung_Tizen_v${widgetVersion}_SIGNED.wgt"
    if (Test-Path -LiteralPath $destination) { throw "Output already exists: $destination. Choose a different output folder." }
    Copy-Item -LiteralPath $signedPackages[0].FullName -Destination $destination
}
Get-Item -LiteralPath $destination | Select-Object FullName, Length
Get-FileHash -LiteralPath $destination -Algorithm SHA256
