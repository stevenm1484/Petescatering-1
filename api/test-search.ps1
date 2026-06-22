# One-off test: search a city for businesses and show ones with no website.
# Makes exactly ONE tracked API request.
. "$PSScriptRoot\usage-tracker.ps1"

$body = '{ "textQuery": "barber shop in Charlotte, NC", "pageSize": 20 }'
$mask = 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.businessStatus'

$result = Invoke-TrackedPlacesRequest -Sku 'textSearchPro' `
    -Uri 'https://places.googleapis.com/v1/places:searchText' `
    -Body $body -FieldMask $mask

$places = @($result.places)
Write-Host ("API returned {0} businesses total" -f $places.Count)
Write-Host ""

$noSite = @($places | Where-Object { -not $_.websiteUri -and $_.nationalPhoneNumber -and $_.businessStatus -eq 'OPERATIONAL' })
Write-Host ("{0} of them have NO website (and do have a phone):" -f $noSite.Count)
Write-Host ""

$noSite | Select-Object -First 3 | ForEach-Object {
    Write-Host ("  {0}" -f $_.displayName.text)
    Write-Host ("    {0}" -f $_.formattedAddress)
    Write-Host ("    Phone: {0}   Rating: {1} ({2} reviews)" -f $_.nationalPhoneNumber, $_.rating, $_.userRatingCount)
    Write-Host ""
}

Show-UsageSummary
