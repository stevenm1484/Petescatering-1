# One-time setup so Webnara can be opened from other devices on your Wi-Fi.
# Right-click PowerShell -> Run as Administrator, then run:
#   powershell -ExecutionPolicy Bypass -File enable-share.ps1

param([int]$Port = 8080)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
    Write-Error "Run this script as Administrator."
    exit 1
}

$url = "http://+:$Port/"
netsh http add urlacl url=$url user=Everyone | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Error "Could not reserve $url"
    exit 1
}

$ruleName = "Webnara Local Share ($Port)"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existing) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port | Out-Null
}

Write-Host "Sharing enabled for port $Port."
Write-Host "Start the server with:"
Write-Host "  powershell -ExecutionPolicy Bypass -File serve.ps1 -Share"
Write-Host ""
Write-Host "Then send your partner the network URLs printed by serve.ps1."
