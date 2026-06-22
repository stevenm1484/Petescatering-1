param(
    [int]$Offset = 0,
    [int]$Limit = 25
)

. "$PSScriptRoot\verify-places-lib.ps1"

$result = Invoke-VerifyPlacesBatch -Offset $Offset -Limit $Limit
Write-Host ("Checked {0}/{1}. Still no website: {2}. Now has website: {3}. Errors: {4}." -f `
    $result.nextOffset, $result.total, $result.stillNoWebsite, $result.nowHasWebsite, $result.errors)
if ($result.flagged.Count -gt 0) {
    Write-Host 'Newly flagged:'
    foreach ($f in $result.flagged) {
        Write-Host ("  {0} -> {1}" -f $f.name, $f.websiteUrl)
    }
}
