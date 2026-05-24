param(
  [int]$Port = 8765
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$docsPath = Resolve-Path (Join-Path $projectRoot "docs")

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $listener) {
  Start-Process `
    -FilePath python `
    -ArgumentList @("-m", "http.server", "$Port", "--bind", "0.0.0.0", "-d", $docsPath.Path) `
    -WorkingDirectory $projectRoot.Path `
    -WindowStyle Hidden | Out-Null
  Start-Sleep -Seconds 1
}

$ip = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object {
    $_.IPAddress -notlike "127.*" -and
    $_.IPAddress -notlike "169.254.*" -and
    $_.InterfaceAlias -notlike "*WSL*" -and
    $_.InterfaceAlias -notlike "*Virtual*"
  } |
  Sort-Object @{ Expression = { if ($_.InterfaceAlias -like "*Wi-Fi*") { 0 } else { 1 } } }, InterfaceAlias |
  Select-Object -First 1

if (-not $ip) {
  throw "No LAN IPv4 address found."
}

$profile = Get-NetConnectionProfile -InterfaceAlias $ip.InterfaceAlias -ErrorAction SilentlyContinue

Write-Host "TechRadar 505 LAN server"
Write-Host "URL: http://$($ip.IPAddress):$Port/"
Write-Host "Serving: $($docsPath.Path)"
if ($profile -and $profile.NetworkCategory -eq "Public") {
  Write-Host "Note: Windows marks this network as Public. If your phone cannot open the URL, allow Python through Windows Firewall or switch this Wi-Fi network to Private."
}
