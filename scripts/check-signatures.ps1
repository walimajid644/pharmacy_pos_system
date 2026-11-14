param([switch]$RequireSigned)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $workspace 'package.json') -Raw | ConvertFrom-Json).version
$targets = @(
    (Join-Path $workspace 'src-tauri\target\release\pharmacy-pos.exe'),
    (Join-Path $workspace "src-tauri\target\release\bundle\nsis\Pharmacy POS_${version}_x64-setup.exe")
)
$results = foreach ($target in $targets) {
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "Build artifact missing: $target" }
    $signature = Get-AuthenticodeSignature -LiteralPath $target
    [pscustomobject]@{
        File = Split-Path -Leaf $target
        SHA256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
        Status = [string]$signature.Status
        Signer = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null }
    }
}
$output = Join-Path $workspace 'test-results\security'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$results | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'signatures.json') -Encoding UTF8
$results | Format-Table -AutoSize
if ($RequireSigned -and @($results | Where-Object Status -ne 'Valid').Count -gt 0) {
    throw 'Release signature gate failed: both application and installer require valid trusted Authenticode signatures.'
}
