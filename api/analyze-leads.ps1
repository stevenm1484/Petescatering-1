$path = Join-Path $PSScriptRoot 'places-cache.json'
$json = [System.IO.File]::ReadAllText($path)
$biz = $json | ConvertFrom-Json

Write-Host "Total: $($biz.Count)"
Write-Host "First: $($biz[0].name) | $($biz[0].industry) | reviews=$($biz[0].reviews)"

Write-Host "`nTop industries:"
$biz | Group-Object -Property { $_.industry } | Sort-Object Count -Descending | Select-Object -First 25 |
    ForEach-Object { Write-Host "  $($_.Name): $($_.Count)" }

$revs = @()
foreach ($b in $biz) {
    if ($null -ne $b.reviews) { $revs += [int]$b.reviews } else { $revs += 0 }
}
$sorted = $revs | Sort-Object
$mid = $sorted[[int]($sorted.Count / 2)]
$avg = ($revs | Measure-Object -Average).Average
Write-Host "`nReviews median: $mid avg: $([math]::Round($avg, 1))"
Write-Host "0 reviews: $(@($revs | Where-Object { $_ -eq 0 }).Count)"
Write-Host "1-9 reviews: $(@($revs | Where-Object { $_ -ge 1 -and $_ -lt 10 }).Count)"
Write-Host "10-49 reviews: $(@($revs | Where-Object { $_ -ge 10 -and $_ -lt 50 }).Count)"
Write-Host "50+ reviews: $(@($revs | Where-Object { $_ -ge 50 }).Count)"
Write-Host "100+ reviews: $(@($revs | Where-Object { $_ -ge 100 }).Count)"
Write-Host "hasWebsite flagged: $(@($biz | Where-Object { $_.hasWebsite -eq $true }).Count)"

$foundation = 0
$signature = 0
$luxury = 0
$nobuy = 0

foreach ($b in $biz) {
    $ind = [string]$b.industry
    if ([string]::IsNullOrWhiteSpace($ind)) { $ind = 'Unknown' }
    $r = 0
    if ($null -ne $b.reviews) { $r = [int]$b.reviews }

    if ($b.hasWebsite -eq $true) {
        $nobuy++
        continue
    }

    $indL = $ind.ToLower()
    $isEmergency = $indL -match 'towing|locksmith|plumb|hvac|electric|pest|tree|roof|garage|appliance|septic|junk|pool|auto repair|heating|cooling|drain'
    $isConsumer = $indL -match 'restaurant|food|cafe|bar|salon|spa|gym|retail|florist|bakery|cater|dental|medical|vet|daycare|real estate|insurance|law|beauty|nail|fitness|pizza|coffee|gift|boutique|furniture|jewel|shop|store'
    $isLowBudget = $indL -match 'cleaning|landscap|handyman|pressure|window clean|moving|painting|fence|concrete|demolition|thrift|antique|other|services|general'

    if ($isConsumer -and $r -ge 25) {
        $luxury++
    }
    elseif ($isEmergency -or ($r -ge 35)) {
        $signature++
    }
    elseif ($r -ge 3 -or (-not $isLowBudget)) {
        $foundation++
    }
    else {
        $nobuy++
    }
}

Write-Host "`nBest-fit package (if they bought at all):"
Write-Host "  Foundation: $foundation ($([math]::Round(100*$foundation/$biz.Count,1))%)"
Write-Host "  Signature:  $signature ($([math]::Round(100*$signature/$biz.Count,1))%)"
Write-Host "  Luxury:     $luxury ($([math]::Round(100*$luxury/$biz.Count,1))%)"
Write-Host "  Would not buy: $nobuy ($([math]::Round(100*$nobuy/$biz.Count,1))%)"

$reachable = $biz.Count - @($biz | Where-Object { $_.hasWebsite -eq $true }).Count
Write-Host "`nRealistic CLOSED deals from cold outreach (503 leads, no prior relationship):"
foreach ($pct in 5, 8, 12) {
    $closes = [math]::Round($reachable * $pct / 100)
    $f = [math]::Round($closes * ($foundation / $biz.Count))
    $s = [math]::Round($closes * ($signature / $biz.Count))
    $l = [math]::Round($closes * ($luxury / $biz.Count))
    Write-Host "  At $pct% close: ~$closes customers (~$f Foundation, ~$s Signature, ~$l Luxury)"
}
$never = $reachable - [math]::Round($reachable * 0.12)
Write-Host "  At 12% close: ~$never would never buy (~$([math]::Round(100*(1-0.12),0))% of list)"
