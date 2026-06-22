# WebGap data pipeline: pulls businesses from Google Places API and keeps ONLY
# ones that are operating, have a phone number, and have NO website on their
# Google profile. Writes the result to ..\places-data.js for the frontend.
#
# Every request goes through the usage tracker (daily limit + budget enforced).
#
# By default, new results are MERGED into existing places-data.js so reruns add
# businesses instead of replacing them. Use -Fresh to wipe and rebuild.

param(
    [switch]$Fresh,
    [int]$MaxSearches = 0,
    [int]$CategoriesPerCity = 4,
    [int]$CategoryOffset = 0,
    [int]$StartCityIndex = 0
)

. "$PSScriptRoot\usage-tracker.ps1"
. "$PSScriptRoot\industry-resolver.ps1"
. "$PSScriptRoot\places-io.ps1"

$categories = @(
    @{ q = 'plumber';               industry = 'Plumbing' },
    @{ q = 'towing service';        industry = 'Towing' },
    @{ q = 'lawn care service';     industry = 'Landscaping' },
    @{ q = 'auto repair shop';      industry = 'Automotive' },
    @{ q = 'cleaning service';      industry = 'Cleaning' },
    @{ q = 'barber shop';           industry = 'Barber' },
    @{ q = 'nail salon';            industry = 'Nail Salon' },
    @{ q = 'handyman';              industry = 'Home Services' },
    @{ q = 'roofing contractor';    industry = 'Roofing' },
    @{ q = 'electrician';           industry = 'Electrical' },
    @{ q = 'HVAC contractor';       industry = 'HVAC' },
    @{ q = 'pest control service';  industry = 'Pest Control' },
    @{ q = 'moving company';        industry = 'Moving' },
    @{ q = 'house painter';         industry = 'Painting' },
    @{ q = 'restaurant';            industry = 'Restaurants' },
    @{ q = 'bakery';                industry = 'Food & Beverage' },
    @{ q = 'locksmith';             industry = 'Locksmith' },
    @{ q = 'appliance repair';      industry = 'Appliance Repair' },
    @{ q = 'tree service';          industry = 'Tree Service' },
    @{ q = 'auto body shop';        industry = 'Auto Body' },
    @{ q = 'pet groomer';           industry = 'Pet Services' },
    @{ q = 'veterinarian';          industry = 'Pet Services' },
    @{ q = 'florist';               industry = 'Retail' },
    @{ q = 'daycare';               industry = 'Childcare' },
    @{ q = 'dentist';               industry = 'Dental' },
    @{ q = 'chiropractor';          industry = 'Healthcare' },
    @{ q = 'photographer';          industry = 'Creative Services' },
    @{ q = 'tax preparation service'; industry = 'Professional Services' },
    @{ q = 'catering service';      industry = 'Food & Beverage' },
    @{ q = 'flooring contractor';   industry = 'Flooring' },
    @{ q = 'pool cleaning service'; industry = 'Pool Service' },
    @{ q = 'concrete contractor';   industry = 'Construction' },
    @{ q = 'fitness center';        industry = 'Fitness' },
    @{ q = 'yoga studio';           industry = 'Fitness' },
    @{ q = 'dry cleaner';           industry = 'Laundry' },
    @{ q = 'hair salon';            industry = 'Hair Salon' },
    @{ q = 'gift shop';             industry = 'Retail' },
    @{ q = 'pizza restaurant';       industry = 'Restaurants' },
    @{ q = 'coffee shop';           industry = 'Food & Beverage' }
)

$cities = @(
    @{ city = 'Charlotte';        state = 'NC' },
    @{ city = 'Memphis';          state = 'TN' },
    @{ city = 'Tulsa';            state = 'OK' },
    @{ city = 'Albuquerque';      state = 'NM' },
    @{ city = 'Louisville';       state = 'KY' },
    @{ city = 'Fresno';           state = 'CA' },
    @{ city = 'Toledo';           state = 'OH' },
    @{ city = 'Birmingham';       state = 'AL' },
    @{ city = 'Spokane';          state = 'WA' },
    @{ city = 'El Paso';          state = 'TX' },
    @{ city = 'Wichita';          state = 'KS' },
    @{ city = 'Omaha';            state = 'NE' },
    @{ city = 'Baton Rouge';      state = 'LA' },
    @{ city = 'Richmond';         state = 'VA' },
    @{ city = 'Tucson';           state = 'AZ' },
    @{ city = 'Anchorage';        state = 'AK' },
    @{ city = 'Little Rock';      state = 'AR' },
    @{ city = 'Colorado Springs'; state = 'CO' },
    @{ city = 'Hartford';         state = 'CT' },
    @{ city = 'Wilmington';       state = 'DE' },
    @{ city = 'Jacksonville';     state = 'FL' },
    @{ city = 'Savannah';         state = 'GA' },
    @{ city = 'Honolulu';         state = 'HI' },
    @{ city = 'Des Moines';       state = 'IA' },
    @{ city = 'Boise';            state = 'ID' },
    @{ city = 'Rockford';         state = 'IL' },
    @{ city = 'Fort Wayne';       state = 'IN' },
    @{ city = 'Worcester';        state = 'MA' },
    @{ city = 'Baltimore';        state = 'MD' },
    @{ city = 'Portland';         state = 'ME' },
    @{ city = 'Detroit';          state = 'MI' },
    @{ city = 'St. Paul';         state = 'MN' },
    @{ city = 'St. Louis';        state = 'MO' },
    @{ city = 'Jackson';          state = 'MS' },
    @{ city = 'Billings';         state = 'MT' },
    @{ city = 'Fargo';            state = 'ND' },
    @{ city = 'Manchester';       state = 'NH' },
    @{ city = 'Newark';           state = 'NJ' },
    @{ city = 'Reno';             state = 'NV' },
    @{ city = 'Buffalo';          state = 'NY' },
    @{ city = 'Eugene';           state = 'OR' },
    @{ city = 'Pittsburgh';       state = 'PA' },
    @{ city = 'Providence';       state = 'RI' },
    @{ city = 'Columbia';         state = 'SC' },
    @{ city = 'Sioux Falls';      state = 'SD' },
    @{ city = 'Salt Lake City';   state = 'UT' },
    @{ city = 'Burlington';       state = 'VT' },
    @{ city = 'Milwaukee';        state = 'WI' },
    @{ city = 'Charleston';       state = 'WV' },
    @{ city = 'Cheyenne';         state = 'WY' },
    @{ city = 'Austin';           state = 'TX' },
    @{ city = 'Dallas';           state = 'TX' },
    @{ city = 'Houston';          state = 'TX' },
    @{ city = 'Miami';            state = 'FL' },
    @{ city = 'Phoenix';          state = 'AZ' },
    @{ city = 'Seattle';          state = 'WA' },
    @{ city = 'San Diego';        state = 'CA' },
    @{ city = 'Nashville';        state = 'TN' },
    @{ city = 'Indianapolis';     state = 'IN' },
    @{ city = 'Columbus';         state = 'OH' },
    @{ city = 'Kansas City';      state = 'MO' },
    @{ city = 'Oklahoma City';    state = 'OK' },
    @{ city = 'Las Vegas';        state = 'NV' },
    @{ city = 'Sacramento';       state = 'CA' },
    @{ city = 'Raleigh';          state = 'NC' },
    @{ city = 'New Orleans';       state = 'LA' },
    @{ city = 'Cleveland';        state = 'OH' },
    @{ city = 'Cincinnati';       state = 'OH' }
)

$categoriesPerCity = [Math]::Max(1, $CategoriesPerCity)
$categoryOffset = [Math]::Max(0, $CategoryOffset)
$mask = 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.businessStatus,places.location,places.regularOpeningHours.weekdayDescriptions,places.primaryTypeDisplayName,places.googleMapsUri'

# Businesses the user deleted in the admin UI - never re-add them
$blocked = New-Object 'System.Collections.Generic.HashSet[string]'
$statePath = Join-Path $PSScriptRoot 'webgap-state.json'
if (Test-Path $statePath) {
    $state = ConvertFrom-Json (Get-Content $statePath -Raw -Encoding UTF8)
    foreach ($id in @($state.deleted)) { if ($id) { [void]$blocked.Add($id) } }
}
if ($blocked.Count -gt 0) { Write-Host "Excluding $($blocked.Count) deleted businesses (api\webgap-state.json)" }

$dest = Get-PlacesDataPath
$seen = New-Object 'System.Collections.Generic.HashSet[string]'
$out = New-Object 'System.Collections.Generic.List[object]'
$mergedExisting = 0

if (-not $Fresh) {
    $existing = @(Read-PlacesCache)
    foreach ($b in $existing) {
        $id = Get-BusinessId $b
        if (-not $id) { continue }
        if ($blocked.Contains($id)) { continue }
        [void]$seen.Add((Get-PlaceKey $id))
        $out.Add($b)
        $mergedExisting++
    }
    if ($mergedExisting -gt 0) {
        Write-Host "Merged $mergedExisting existing businesses from places-data.js"
    }
} else {
    Write-Host "Fresh run: replacing places-data.js" -ForegroundColor Yellow
}

$searches = 0
$scanned = 0
$added = 0

:cityLoop for ($ci = [Math]::Max(0, $StartCityIndex); $ci -lt $cities.Count; $ci++) {
    $c = $cities[$ci]
    for ($k = $categoryOffset; $k -lt $categoriesPerCity; $k++) {
        if ($MaxSearches -gt 0 -and $searches -ge $MaxSearches) {
            Write-Host "Stopping: reached MaxSearches ($MaxSearches)" -ForegroundColor Yellow
            break cityLoop
        }
        # Rotate categories so different cities cover different industries
        $cat = $categories[(($ci * $categoriesPerCity) + $k) % $categories.Count]
        $query = "$($cat.q) in $($c.city), $($c.state)"
        $body = (@{ textQuery = $query; pageSize = 20 } | ConvertTo-Json -Compress)

        try {
            $result = Invoke-TrackedPlacesRequest -Sku 'textSearchPro' `
                -Uri 'https://places.googleapis.com/v1/places:searchText' `
                -Body $body -FieldMask $mask
        } catch {
            if ($_.Exception.Message -match 'LIMIT REACHED|BUDGET REACHED') {
                Write-Host "Stopping: $($_.Exception.Message)" -ForegroundColor Yellow
                break cityLoop
            }
            Write-Host "  Request failed for '$query': $($_.Exception.Message)" -ForegroundColor Red
            continue
        }

        $searches++
        $places = @($result.places)
        $scanned += $places.Count
        $kept = 0

        foreach ($p in $places) {
            if ($p.websiteUri) { continue }
            if (-not $p.nationalPhoneNumber) { continue }
            if ($p.businessStatus -ne 'OPERATIONAL') { continue }
            if (-not $p.displayName -or -not $p.displayName.text) { continue }
            if ($blocked.Contains("gp-$($p.id)")) { continue }
            if (-not $seen.Add($p.id)) { continue }

            # formattedAddress looks like: "926 Westmere Ave, Charlotte, NC 28208, USA"
            $parts = @($p.formattedAddress -split ',\s*')
            $street = ''; $city = $c.city; $state = $c.state; $zip = ''
            foreach ($part in $parts) {
                if ($part -match '^([A-Z]{2})\s+(\d{5})') { $state = $Matches[1]; $zip = $Matches[2] }
            }
            if ($parts.Count -ge 4) {
                $city = $parts[$parts.Count - 3]
                $street = ($parts[0..($parts.Count - 4)] -join ', ')
            } elseif ($parts.Count -ge 1) {
                $street = $parts[0]
            }

            $primaryType = if ($p.primaryTypeDisplayName -and $p.primaryTypeDisplayName.text) { $p.primaryTypeDisplayName.text } else { $null }

            $out.Add(@{
                id = "gp-$($p.id)"
                name = $p.displayName.text
                industry = (Resolve-Industry -PrimaryType $primaryType -SearchIndustry $cat.industry)
                address = $street
                city = $city
                state = $state
                zip = $zip
                phone = $p.nationalPhoneNumber
                rating = $p.rating
                reviews = $p.userRatingCount
                employees = $null
                owner = $null
                hours = if ($p.regularOpeningHours -and $p.regularOpeningHours.weekdayDescriptions) { @($p.regularOpeningHours.weekdayDescriptions) } else { $null }
                primaryType = $primaryType
                mapsUri = $p.googleMapsUri
                lat = if ($p.location) { $p.location.latitude } else { $null }
                lon = if ($p.location) { $p.location.longitude } else { $null }
                hasWebsite = $false
                websiteVerified = $true
                source = 'google'
            })
            $kept++
            $added++
        }

        Write-Host ("[{0,2}] {1,-45} {2,2} results, {3} new without a website" -f $searches, $query, $places.Count, $kept)
        Start-Sleep -Milliseconds 250
    }
}

$sorted = [object[]]($out | Sort-Object { $_.name })
Write-PlacesBusinesses -Businesses $sorted -Path $dest -HeaderNote 'api/fetch-places.ps1'

Write-Host ""
Write-Host ("DONE: {0} searches, {1} businesses scanned, {2} kept existing, {3} newly added, {4} total in places-data.js" -f $searches, $scanned, $mergedExisting, $added, $out.Count) -ForegroundColor Green
Show-UsageSummary
