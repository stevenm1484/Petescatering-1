# WebGap API usage tracker
# Every Google Places API call goes through Invoke-TrackedPlacesRequest, which:
#   1. Refuses to run if today's request count >= dailyRequestLimit (api-config.json)
#   2. Refuses to run if estimated month cost >= monthlyBudgetUSD
#   3. Logs every request (timestamp, SKU, status, estimated cost) to api-usage.json
#   4. Regenerates api-usage-data.js so usage.html always shows current numbers
#
# Usage from a pipeline script:
#   . "$PSScriptRoot\usage-tracker.ps1"
#   $result = Invoke-TrackedPlacesRequest -Sku 'textSearchPro' `
#     -Uri 'https://places.googleapis.com/v1/places:searchText' `
#     -Body '{ "textQuery": "auto repair in Charlotte, NC" }' `
#     -FieldMask 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount' `
#     -ApiKey $apiKey

$script:ApiDir = $PSScriptRoot
$script:ConfigPath = Join-Path $script:ApiDir 'api-config.json'
$script:LedgerPath = Join-Path $script:ApiDir 'api-usage.json'
$script:DashboardDataPath = Join-Path $script:ApiDir 'api-usage-data.js'

function Get-PlacesApiKey {
    # Reads GOOGLE_PLACES_API_KEY from the .env file in the project root
    $envPath = Join-Path (Split-Path $script:ApiDir -Parent) '.env'
    if (-not (Test-Path $envPath)) {
        throw "No .env file found at $envPath. Create one with: GOOGLE_PLACES_API_KEY=your-key-here"
    }
    foreach ($line in Get-Content $envPath -Encoding UTF8) {
        if ($line -match '^\s*GOOGLE_PLACES_API_KEY\s*=\s*(.+?)\s*$') {
            $key = $Matches[1].Trim('"').Trim("'")
            if ($key -notmatch '^AIza[0-9A-Za-z\-_]{35}$') {
                Write-Warning "The key in .env doesn't look like a Google API key (should start with 'AIza' and be 39 characters). Double-check it was pasted completely."
            }
            return $key
        }
    }
    throw "GOOGLE_PLACES_API_KEY not found in $envPath. Add a line: GOOGLE_PLACES_API_KEY=your-key-here"
}

function Get-ApiConfig {
    ConvertFrom-Json (Get-Content $script:ConfigPath -Raw -Encoding UTF8)
}

function Get-UsageLedger {
    if (Test-Path $script:LedgerPath) {
        $data = ConvertFrom-Json (Get-Content $script:LedgerPath -Raw -Encoding UTF8)
        return @($data)
    }
    return @()
}

function Save-UsageLedger {
    param($Ledger)
    ConvertTo-Json -InputObject @($Ledger) -Depth 5 -Compress |
        Set-Content -Path $script:LedgerPath -Encoding UTF8
}

function Get-UsageSummary {
    param($Ledger, $Config)

    $today = (Get-Date).ToString('yyyy-MM-dd')
    $month = (Get-Date).ToString('yyyy-MM')

    $todayEntries = @($Ledger | Where-Object { "$($_.timestamp)" -like "$today*" })
    $monthEntries = @($Ledger | Where-Object { "$($_.timestamp)" -like "$month*" })

    $skuSummaries = @()
    $monthCostUSD = 0.0
    foreach ($skuName in $Config.skus.PSObject.Properties.Name) {
        $sku = $Config.skus.$skuName
        $monthCount = @($monthEntries | Where-Object { $_.sku -eq $skuName }).Count
        $billable = [Math]::Max(0, $monthCount - $sku.freeCallsPerMonth)
        $cost = [Math]::Round($billable * $sku.pricePerCallUSD, 4)
        $monthCostUSD += $cost
        $skuSummaries += @{
            sku = $skuName
            label = $sku.label
            monthCount = $monthCount
            freeCallsPerMonth = $sku.freeCallsPerMonth
            billableCalls = $billable
            estCostUSD = $cost
        }
    }

    return @{
        date = $today
        todayCount = $todayEntries.Count
        dailyRequestLimit = $Config.dailyRequestLimit
        monthCount = $monthEntries.Count
        monthCostUSD = [Math]::Round($monthCostUSD, 4)
        monthlyBudgetUSD = $Config.monthlyBudgetUSD
        skus = $skuSummaries
    }
}

function Write-DashboardData {
    param($Ledger, $Config)
    $summary = Get-UsageSummary -Ledger $Ledger -Config $Config
    $recent = @($Ledger | Select-Object -Last 50)
    [Array]::Reverse($recent)
    $payload = @{
        generatedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        summary = $summary
        recentRequests = $recent
    }
    $json = ConvertTo-Json -InputObject $payload -Depth 6 -Compress
    Set-Content -Path $script:DashboardDataPath -Value ("const API_USAGE = " + $json + ";") -Encoding UTF8
}

function Assert-UnderLimits {
    param($Ledger, $Config)

    $summary = Get-UsageSummary -Ledger $Ledger -Config $Config

    if ($summary.todayCount -ge $Config.dailyRequestLimit) {
        throw ("DAILY LIMIT REACHED: {0} of {1} requests used today. Raise dailyRequestLimit in api-config.json or wait until tomorrow." -f $summary.todayCount, $Config.dailyRequestLimit)
    }

    if ($summary.monthCostUSD -ge $Config.monthlyBudgetUSD) {
        throw ("MONTHLY BUDGET REACHED: estimated `${0} of `${1} budget spent this month. Raise monthlyBudgetUSD in api-config.json if intentional." -f $summary.monthCostUSD, $Config.monthlyBudgetUSD)
    }
}

function Invoke-TrackedPlacesRequest {
    param(
        [Parameter(Mandatory)] [string]$Sku,
        [Parameter(Mandatory)] [string]$Uri,
        [string]$Method = 'Post',
        [string]$Body = '{}',
        [string]$FieldMask = '',
        [string]$ApiKey = ''
    )

    if (-not $ApiKey) { $ApiKey = Get-PlacesApiKey }

    $config = Get-ApiConfig
    if (-not $config.skus.PSObject.Properties.Name.Contains($Sku)) {
        throw "Unknown SKU '$Sku'. Add it to api-config.json first so its cost can be tracked."
    }

    $ledger = @(Get-UsageLedger)
    Assert-UnderLimits -Ledger $ledger -Config $config

    $headers = @{ 'X-Goog-Api-Key' = $ApiKey }
    if ($FieldMask) { $headers['X-Goog-FieldMask'] = $FieldMask }

    $status = 'ok'
    $response = $null
    try {
        $params = @{
            Uri = $Uri
            Method = $Method
            Headers = $headers
            TimeoutSec = 30
            UseBasicParsing = $true
        }
        if ($Method -ne 'Get') {
            $params['Body'] = [System.Text.Encoding]::UTF8.GetBytes($Body)
            $params['ContentType'] = 'application/json; charset=utf-8'
        }
        $resp = Invoke-WebRequest @params
        $text = [System.Text.Encoding]::UTF8.GetString($resp.RawContentStream.ToArray())
        $response = ConvertFrom-Json $text
    } catch {
        $status = 'error'
        throw
    } finally {
        # Log the request even if it failed - failed requests can still bill
        $skuCfg = $config.skus.$Sku
        $month = (Get-Date).ToString('yyyy-MM')
        $monthCountAfter = @($ledger | Where-Object { "$($_.timestamp)" -like "$month*" -and $_.sku -eq $Sku }).Count + 1
        $entryCost = if ($monthCountAfter -gt $skuCfg.freeCallsPerMonth) { $skuCfg.pricePerCallUSD } else { 0 }

        $ledger = @($ledger) + @{
            timestamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
            sku = $Sku
            status = $status
            estCostUSD = $entryCost
        }
        Save-UsageLedger -Ledger $ledger
        Write-DashboardData -Ledger $ledger -Config $config
    }

    return $response
}

function Show-UsageSummary {
    $config = Get-ApiConfig
    $ledger = Get-UsageLedger
    $s = Get-UsageSummary -Ledger $ledger -Config $config
    Write-Host ("Today:      {0} / {1} requests" -f $s.todayCount, $s.dailyRequestLimit)
    Write-Host ("This month: {0} requests, est. cost `${1} / `${2} budget" -f $s.monthCount, $s.monthCostUSD, $s.monthlyBudgetUSD)
    foreach ($sku in $s.skus) {
        Write-Host ("  {0}: {1} calls ({2} free/mo, {3} billable) = `${4}" -f $sku.label, $sku.monthCount, $sku.freeCallsPerMonth, $sku.billableCalls, $sku.estCostUSD)
    }
}
