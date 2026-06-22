. "$PSScriptRoot\usage-tracker.ps1"
. "$PSScriptRoot\places-io.ps1"

function Set-BusinessField {
    param($Business, [string]$Name, $Value)
    if ($Business -is [System.Collections.IDictionary]) {
        $Business[$Name] = $Value
    } else {
        $Business.$Name = $Value
    }
}

function Invoke-VerifyPlacesBatch {
    param(
        [int]$Offset = 0,
        [int]$Limit = 25
    )

    if ($Limit -lt 1) { $Limit = 1 }
    if ($Limit -gt 50) { $Limit = 50 }

    $all = @(Read-PlacesCache)
    $total = $all.Count
    $end = [Math]::Min($Offset + $Limit, $total)
    $batchCount = [Math]::Max(0, $end - $Offset)

    if ($batchCount -eq 0) {
        return @{
            ok = $true
            checked = 0
            stillNoWebsite = 0
            nowHasWebsite = 0
            notOperational = 0
            errors = 0
            offset = $Offset
            nextOffset = $Offset
            total = $total
            done = ($Offset -ge $total)
            flagged = @()
        }
    }

    $mask = 'websiteUri,businessStatus,nationalPhoneNumber'
    $now = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    $stillNoWebsite = 0
    $nowHasWebsite = 0
    $notOperational = 0
    $errors = 0
    $flagged = New-Object System.Collections.Generic.List[object]

    for ($i = $Offset; $i -lt $end; $i++) {
        $b = $all[$i]
        $storedId = Get-BusinessId $b
        if (-not $storedId) { continue }
        $placeId = Get-PlaceKey $storedId

        try {
            $result = Invoke-TrackedPlacesRequest -Sku 'placeDetailsPro' `
                -Uri "https://places.googleapis.com/v1/places/$placeId" `
                -Method 'Get' -FieldMask $mask

            $website = if ($result.websiteUri) { [string]$result.websiteUri } else { $null }
            $status = if ($result.businessStatus) { [string]$result.businessStatus } else { 'OPERATIONAL' }

            Set-BusinessField $b 'websiteVerified' $true
            Set-BusinessField $b 'verifiedAt' $now
            Set-BusinessField $b 'googleStatus' $status

            if ($website) {
                Set-BusinessField $b 'hasWebsite' $true
                Set-BusinessField $b 'websiteUrl' $website
                $nowHasWebsite++
                [void]$flagged.Add(@{
                    id = $storedId
                    name = if ($b -is [System.Collections.IDictionary]) { [string]$b['name'] } else { [string]$b.name }
                    websiteUrl = $website
                })
            } else {
                Set-BusinessField $b 'hasWebsite' $false
                Set-BusinessField $b 'websiteUrl' $null
                $stillNoWebsite++
            }

            if ($status -ne 'OPERATIONAL') {
                $notOperational++
            }

            Start-Sleep -Milliseconds 150
        } catch {
            if ($_.Exception.Message -match 'LIMIT REACHED|BUDGET REACHED') {
                throw
            }
            $errors++
        }
    }

    Write-PlacesCache -Businesses $all -HeaderNote 'api/verify-places.ps1'

    return @{
        ok = $true
        checked = $batchCount
        stillNoWebsite = $stillNoWebsite
        nowHasWebsite = $nowHasWebsite
        notOperational = $notOperational
        errors = $errors
        offset = $Offset
        nextOffset = $end
        total = $total
        done = ($end -ge $total)
        flagged = @($flagged)
    }
}
