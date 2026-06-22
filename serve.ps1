# Local web server for Webnara (/) and the Webnara admin (/admin).
# Run:  powershell -ExecutionPolicy Bypass -File serve.ps1
# Then open http://localhost:8080  (public site)  and  http://localhost:8080/admin
#
# To share with someone else on your Wi-Fi, run once as Administrator:
#   powershell -ExecutionPolicy Bypass -File enable-share.ps1
# Then start with:
#   powershell -ExecutionPolicy Bypass -File serve.ps1 -Share

param(
    [int]$Port = 8080,
    [switch]$Share
)

$root = $PSScriptRoot
$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.png'  = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'
    '.svg'  = 'image/svg+xml'; '.ico' = 'image/x-icon'; '.webp' = 'image/webp'
}

function Get-LanIp {
    $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike '127.*' -and
            $_.IPAddress -notlike '169.254.*' -and
            $_.PrefixOrigin -ne 'WellKnown'
        } |
        Select-Object -First 1 -ExpandProperty IPAddress
    if ($ip) { return $ip }
    return ($env:COMPUTERNAME)
}

$listener = New-Object System.Net.HttpListener
if ($Share) {
    $listener.Prefixes.Add("http://+:$Port/")
} else {
    $listener.Prefixes.Add("http://localhost:$Port/")
}
try {
    $listener.Start()
} catch {
    if ($Share) {
        Write-Error @"
Could not start shared server on port $Port.
Run this once as Administrator, then try again:
  powershell -ExecutionPolicy Bypass -File enable-share.ps1
"@
    } else {
        Write-Error "Could not start server on port $Port. Another process may already be using it."
    }
    exit 1
}

Write-Host "Webnara running:"
Write-Host "  Public site (you):  http://localhost:$Port/"
Write-Host "  Admin (you):        http://localhost:$Port/admin"
if ($Share) {
    $lanIp = Get-LanIp
    Write-Host ""
    Write-Host "Share these links with your partner on the same Wi-Fi:"
    Write-Host "  Public site:  http://${lanIp}:$Port/"
    Write-Host "  Admin:        http://${lanIp}:$Port/admin"
} else {
    Write-Host ""
    Write-Host "Note: localhost links only work on this computer."
    Write-Host "To share with your partner, run enable-share.ps1 once, then serve.ps1 -Share"
}
Write-Host ""
Write-Host "Press Ctrl+C to stop."

try {
    $statePath = Join-Path $root 'api\webgap-state.json'
    $leadsPath = Join-Path $root 'api\leads.json'

    function Get-LeadsList {
        param($Path)
        if (-not (Test-Path $Path)) { return @() }
        $raw = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8).Trim()
        if (-not $raw) { return @() }
        $parsed = ConvertFrom-Json $raw
        if ($null -eq $parsed) { return @() }
        if ($parsed -is [System.Array]) { return $parsed }
        return @($parsed)
    }

    function Save-LeadsList {
        param($Path, $Leads)
        $json = ConvertTo-Json -InputObject @($Leads) -Depth 6 -Compress
        [System.IO.File]::WriteAllText($Path, $json, (New-Object System.Text.UTF8Encoding($false)))
    }

    function Convert-ToApiJson {
        param($Payload)
        if ($null -eq $Payload) { return 'null' }
        if ($Payload -is [System.Array]) {
            if ($Payload.Count -eq 0) { return '[]' }
            return (ConvertTo-Json -InputObject @(,$Payload) -Compress -Depth 6)
        }
        $json = ConvertTo-Json $Payload -Compress -Depth 6
        if ($json) { return $json }
        return 'null'
    }

    function Write-ApiJson {
        param($Ctx, $Payload, [int]$Status = 200)
        $Ctx.Response.StatusCode = $Status
        $Ctx.Response.ContentType = 'application/json; charset=utf-8'
        $bytes = [Text.Encoding]::UTF8.GetBytes((Convert-ToApiJson $Payload))
        $Ctx.Response.ContentLength64 = $bytes.Length
        $Ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        $Ctx.Response.Close()
    }

    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $reqPath = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
        $method = $ctx.Request.HttpMethod

        # API: contact form quote requests
        if ($reqPath -eq '/api/leads') {
            if ($method -eq 'GET') {
                Write-ApiJson $ctx (Get-LeadsList $leadsPath)
                continue
            }
            if ($method -eq 'POST') {
                $reader = New-Object System.IO.StreamReader($ctx.Request.InputStream, $ctx.Request.ContentEncoding)
                $bodyText = $reader.ReadToEnd()
                try {
                    $parsed = ConvertFrom-Json $bodyText
                    $lead = [ordered]@{
                        id = [guid]::NewGuid().ToString()
                        timestamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
                        name = [string]$parsed.name
                        business = [string]$parsed.business
                        phone = [string]$parsed.phone
                        email = [string]$parsed.email
                        type = [string]$parsed.type
                        message = [string]$parsed.message
                        read = $false
                    }
                    $leads = @(Get-LeadsList $leadsPath)
                    $leads = @($lead) + @($leads)
                    Save-LeadsList $leadsPath $leads
                    Write-ApiJson $ctx @{ ok = $true; id = $lead.id }
                } catch {
                    Write-ApiJson $ctx @{ ok = $false } 400
                }
                continue
            }
            if ($method -eq 'DELETE') {
                $id = $ctx.Request.QueryString['id']
                if (-not $id) {
                    Write-ApiJson $ctx @{ ok = $false; error = 'missing id' } 400
                    continue
                }
                $leads = @(Get-LeadsList $leadsPath | Where-Object { $_.id -ne $id })
                Save-LeadsList $leadsPath $leads
                Write-ApiJson $ctx @{ ok = $true }
                continue
            }
            $ctx.Response.StatusCode = 405
            $ctx.Response.Close()
            continue
        }

        # API: persistent deleted / in-progress business ids
        if ($reqPath -eq '/api/state') {
            $ctx.Response.ContentType = 'application/json; charset=utf-8'
            if ($ctx.Request.HttpMethod -eq 'POST') {
                $reader = New-Object System.IO.StreamReader($ctx.Request.InputStream, $ctx.Request.ContentEncoding)
                $bodyText = $reader.ReadToEnd()
                try {
                    $parsed = ConvertFrom-Json $bodyText
                    $sites = if ($parsed.sites) { $parsed.sites } else { @{} }
                    $notes = if ($parsed.notes) { $parsed.notes } else { @{} }
                    $clean = @{ deleted = @($parsed.deleted); inprogress = @($parsed.inprogress); finished = @($parsed.finished); sites = $sites; notes = $notes }
                    [System.IO.File]::WriteAllText($statePath, (ConvertTo-Json $clean -Compress), (New-Object System.Text.UTF8Encoding($false)))
                    $out = [Text.Encoding]::UTF8.GetBytes('{"ok":true}')
                } catch {
                    $ctx.Response.StatusCode = 400
                    $out = [Text.Encoding]::UTF8.GetBytes('{"ok":false}')
                }
            } else {
                $json = if (Test-Path $statePath) { [System.IO.File]::ReadAllText($statePath) } else { '{"deleted":[],"inprogress":[],"finished":[],"sites":{},"notes":{}}' }
                $out = [Text.Encoding]::UTF8.GetBytes($json)
            }
            $ctx.Response.ContentLength64 = $out.Length
            $ctx.Response.OutputStream.Write($out, 0, $out.Length)
            $ctx.Response.Close()
            continue
        }

        # API: re-check Google website field for a batch of businesses
        if ($reqPath -eq '/api/verify') {
            if ($method -ne 'POST') {
                $ctx.Response.StatusCode = 405
                $ctx.Response.Close()
                continue
            }
            $offset = 0
            $limit = 25
            $reader = New-Object System.IO.StreamReader($ctx.Request.InputStream, $ctx.Request.ContentEncoding)
            $bodyText = $reader.ReadToEnd()
            if ($bodyText) {
                try {
                    $parsed = ConvertFrom-Json $bodyText
                    if ($null -ne $parsed.offset) { $offset = [int]$parsed.offset }
                    if ($null -ne $parsed.limit) { $limit = [int]$parsed.limit }
                } catch {}
            }
            try {
                . (Join-Path $root 'api\verify-places-lib.ps1')
                $result = Invoke-VerifyPlacesBatch -Offset $offset -Limit $limit
                Write-ApiJson $ctx $result
            } catch {
                if ($_.Exception.Message -match 'LIMIT REACHED|BUDGET REACHED') {
                    Write-ApiJson $ctx @{ ok = $false; error = $_.Exception.Message; limitReached = $true } 429
                } else {
                    Write-ApiJson $ctx @{ ok = $false; error = $_.Exception.Message } 500
                }
            }
            continue
        }

        $relative = $reqPath.TrimStart('/') -replace '/', '\'
        $file = if ($relative) { Join-Path $root $relative } else { Join-Path $root 'index.html' }

        # Directory URLs must end with / so relative asset paths resolve correctly
        if ((Test-Path $file -PathType Container) -and -not $reqPath.EndsWith('/')) {
            $ctx.Response.StatusCode = 301
            $ctx.Response.RedirectLocation = "$reqPath/"
            $ctx.Response.Close()
            continue
        }
        if (Test-Path $file -PathType Container) { $file = Join-Path $file 'index.html' }

        # Block path traversal and the .env file
        $resolved = try { (Resolve-Path $file -ErrorAction Stop).Path } catch { $null }
        $blocked = (-not $resolved) -or (-not $resolved.StartsWith($root)) -or ($resolved -like '*\.env')

        if (-not $blocked -and (Test-Path $resolved -PathType Leaf)) {
            $bytes = [System.IO.File]::ReadAllBytes($resolved)
            $ext = [System.IO.Path]::GetExtension($resolved).ToLower()
            $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
            $ctx.Response.ContentLength64 = $bytes.Length
            $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $ctx.Response.StatusCode = 404
            $msg = [Text.Encoding]::UTF8.GetBytes('404 - Not Found')
            $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
        }
        $ctx.Response.Close()
    }
} finally {
    $listener.Stop()
}
