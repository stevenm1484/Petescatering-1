# Re-label industries in admin/places-data.js using Google primaryType + search category.
# No API calls — run after fetch-places or anytime you want cleaner industry filters.

. "$PSScriptRoot\industry-resolver.ps1"
. "$PSScriptRoot\places-io.ps1"

$businesses = @(Read-PlacesBusinesses)
Write-Host "Loaded $($businesses.Count) businesses"

$changed = 0
$updated = foreach ($b in $businesses) {
    if ($b -is [System.Collections.IDictionary]) {
        $searchIndustry = [string]$b['industry']
        $primaryType = if ($b.Contains('primaryType') -and $b['primaryType']) { [string]$b['primaryType'] } else { $null }
    } else {
        $searchIndustry = [string]$b.industry
        $primaryType = if ($b.primaryType) { [string]$b.primaryType } else { $null }
    }

    $resolved = Resolve-Industry -PrimaryType $primaryType -SearchIndustry $searchIndustry
    if ($resolved -ne $searchIndustry) { $changed++ }

    $row = @{}
    if ($b -is [System.Collections.IDictionary]) {
        foreach ($key in $b.Keys) { $row[$key] = $b[$key] }
    } else {
        $b.PSObject.Properties | ForEach-Object { $row[$_.Name] = $_.Value }
    }
    $row['industry'] = $resolved
    $row
}

Write-PlacesBusinesses -Businesses $updated -HeaderNote 'api/reclassify-industries.ps1'

Write-Host "Updated $changed businesses. Industries now:"
$updated | Group-Object { $_.industry } | Sort-Object Name | ForEach-Object { Write-Host ("  {0}: {1}" -f $_.Name, $_.Count) }
