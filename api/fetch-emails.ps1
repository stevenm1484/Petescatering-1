# Looks up public business emails via web search and writes admin/emails-data.js.
# Run: powershell -ExecutionPolicy Bypass -File api/fetch-emails.ps1
# Options: -Max 50 (limit businesses), -DelayMs 1200 (pause between searches)

param(
    [int]$Max = 0,
    [int]$DelayMs = 1200
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$placesPath = Join-Path $root 'admin\places-data.js'
$cachePath = Join-Path $PSScriptRoot 'email-cache.json'
$batchDir = Join-Path $PSScriptRoot 'email-batches'
$resultsPath = Join-Path $batchDir 'results-fetch.txt'

if (-not (Test-Path $placesPath)) { throw "Missing $placesPath" }
New-Item -ItemType Directory -Force -Path $batchDir | Out-Null

$raw = Get-Content $placesPath -Raw -Encoding UTF8
if ($raw -notmatch 'GOOGLE_BUSINESSES\s*=\s*(\[.*\]);') { throw 'Could not parse places-data.js' }
$businesses = @((ConvertFrom-Json $Matches[1]))

$cache = @{}
if (Test-Path $cachePath) {
    $cache = @{}
    (ConvertFrom-Json (Get-Content $cachePath -Raw -Encoding UTF8)).PSObject.Properties | ForEach-Object {
        $cache[$_.Name] = $_.Value
    }
}

$blockedDomains = @(
    'google.com', 'gmail.com', 'facebook.com', 'yelp.com', 'example.com',
    'wixpress.com', 'sentry.io', 'schema.org', 'duckduckgo.com', 'bing.com',
    'yahoo.com', 'hotmail.com', 'outlook.com', 'protonmail.com', 'icloud.com',
    'yellowpages.com', 'bbb.org', 'mapquest.com', 'tripadvisor.com'
)

function Get-BusinessTokens {
    param([string]$Name)
    ($Name.ToLower() -replace '[^a-z0-9\s]', ' ' -split '\s+' | Where-Object { $_.Length -ge 3 }) | Select-Object -First 6
}

function Test-AllowedEmail {
    param([string]$Email)
    if ($Email -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') { return $false }
    $domain = ($Email -split '@')[1].ToLower()
    foreach ($bad in $blockedDomains) {
        if ($domain -eq $bad -or $domain.EndsWith(".$bad")) { return $false }
    }
    if ($Email -match 'noreply|no-reply|donotreply|privacy@|support@wix|sentry') { return $false }
    return $true
}

function Select-BestEmail {
    param([string[]]$Candidates, [string]$BusinessName)
    $tokens = Get-BusinessTokens $BusinessName
    $scored = foreach ($email in ($Candidates | Select-Object -Unique)) {
        $lower = $email.ToLower()
        if (-not (Test-AllowedEmail $lower)) { continue }
        $score = 0
        $local, $domain = $lower -split '@', 2
        if ($local -in @('info', 'contact', 'office', 'admin', 'sales', 'hello')) { $score += 8 }
        foreach ($t in $tokens) {
            if ($domain -like "*$t*") { $score += 5 }
            if ($local -like "*$t*") { $score += 2 }
        }
        if ($local -match '^\d+$') { $score -= 5 }
        [pscustomobject]@{ Email = $lower; Score = $score }
    }
    ($scored | Sort-Object Score -Descending | Select-Object -First 1).Email
}

function Find-EmailOnline {
    param($Business)
    $query = [uri]::EscapeDataString("$($Business.name) $($Business.city) $($Business.state) email contact")
    $url = "https://www.bing.com/search?q=$query"
    try {
        $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 25 `
            -UserAgent 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        $html = $resp.Content -replace '&#64;', '@' -replace '&#46;', '.' -replace '%40', '@'
        $found = [regex]::Matches($html, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}') |
            ForEach-Object { $_.Value.ToLower() } |
            Select-Object -Unique
        return Select-BestEmail -Candidates @($found) -BusinessName $Business.name
    } catch {
        return $null
    }
}

$processed = 0
$found = 0
$lines = New-Object 'System.Collections.Generic.List[string]'

foreach ($b in $businesses) {
    if ($Max -gt 0 -and $processed -ge $Max) { break }

    if ($cache.ContainsKey($b.id) -and $cache[$b.id]) {
        $email = [string]$cache[$b.id]
        $lines.Add("$($b.id)`t$email`tcached")
        $found++
        $processed++
        continue
    }

    Write-Host ("[{0}/{1}] {2}" -f ($processed + 1), $businesses.Count, $b.name)
    $email = Find-EmailOnline -Business $b
    $cache[$b.id] = $email
    if ($email) {
        $lines.Add("$($b.id)`t$email`tweb search")
        $found++
        Write-Host "  -> $email" -ForegroundColor Green
    } else {
        Write-Host '  -> (none)' -ForegroundColor DarkGray
    }

    ($cache | ConvertTo-Json -Compress) | Set-Content $cachePath -Encoding UTF8
    $processed++
    Start-Sleep -Milliseconds $DelayMs
}

if ($lines.Count -gt 0) {
    $existing = @()
    if (Test-Path $resultsPath) { $existing = @(Get-Content $resultsPath -Encoding UTF8) }
    $merged = [ordered]@{}
    foreach ($line in ($existing + $lines)) {
        $parts = $line -split "`t"
        if ($parts.Count -ge 2) { $merged[$parts[0]] = $line }
    }
    Set-Content $resultsPath -Value ($merged.Values) -Encoding UTF8
}

& (Join-Path $PSScriptRoot 'build-emails.ps1')
Write-Host ""
Write-Host "Done: processed $processed businesses, $found with emails." -ForegroundColor Green
