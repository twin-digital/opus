# Probes REAPER's web remote the way the studio app uses it, and prints PASS/FAIL per check.
# Windows PowerShell 5.1 or PowerShell 7. Run next to a REAPER with the web interface enabled:
#
#   powershell -ExecutionPolicy Bypass -File reaper-probe.ps1 [-BaseUrl http://localhost:8080]
#
# Checks: connectivity, status parsing, project ext-state round trips (spaces, punctuation,
# unicode, separators, long values), and, with the studio watcher loaded, that a rename
# request written to ext state renames a "Clip N" region within a few seconds.

param([string]$BaseUrl = 'http://localhost:8080')

$BaseUrl = $BaseUrl.TrimEnd('/')
$Section = 'StudioProbe'
$script:Failures = 0

function Send-Reaper([string[]]$Commands) {
  $url = "$BaseUrl/_/" + ($Commands -join ';')
  $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
  # REAPER replies in UTF-8 without saying so; Windows PowerShell would otherwise decode it as Latin-1
  $bytes = [System.Text.Encoding]::GetEncoding('ISO-8859-1').GetBytes([string]$response.Content)
  return [System.Text.Encoding]::UTF8.GetString($bytes)
}

# info checks map the edges (what the app avoids or never sends); they never fail the run
function Report([bool]$Ok, [string]$Name, [string]$Detail = '', [switch]$Info) {
  if (-not $Ok -and -not $Info) { $script:Failures += 1 }
  $tag = if ($Ok) { 'PASS' } elseif ($Info) { 'INFO' } else { 'FAIL' }
  $suffix = if ($Detail) { "  ($Detail)" } else { '' }
  Write-Host "$tag  $Name$suffix"
}

function Read-Ext([string]$Sec, [string]$Key) {
  $text = Send-Reaper @("GET/PROJEXTSTATE/$Sec/$Key")
  foreach ($raw in $text -split "`n") {
    $line = $raw.TrimEnd("`r")
    if ($line.StartsWith('PROJEXTSTATE')) {
      $fields = $line -split "`t"
      if ($fields.Count -le 3) { return '' }
      return ($fields[3..($fields.Count - 1)] -join "`t")
    }
  }
  return $null
}

function Write-Ext([string]$Sec, [string]$Key, [string]$Value) {
  $encoded = [System.Uri]::EscapeDataString($Value)
  [void](Send-Reaper @("SET/PROJEXTSTATE/$Sec/$Key/$encoded"))
}

function Test-RoundTrip([string]$Name, [string]$Value, [switch]$Info) {
  $key = 'rt_' + ($Name -replace '\W+', '_')
  try {
    Write-Ext $Section $key $Value
    $back = Read-Ext $Section $key
    if ($back -eq $Value) {
      Report $true "ext state round trip: $Name" "$($Value.Length) chars" -Info:$Info
    } else {
      $shown = if ($null -eq $back) { 'undefined' } elseif ($back.Length -gt 60) { $back.Substring(0, 57) + '...' } else { $back }
      $lengths = if ($null -ne $back) { "sent $($Value.Length), got $($back.Length) chars: " } else { '' }
      Report $false "ext state round trip: $Name" "$lengths$shown" -Info:$Info
    }
  } catch {
    Report $false "ext state round trip: $Name" "$($_.Exception.Message)" -Info:$Info
  } finally {
    try { Write-Ext $Section $key '' } catch {}
  }
}

function Get-Regions {
  $text = Send-Reaper @('REGION')
  $list = @()
  foreach ($raw in $text -split "`n") {
    $line = $raw.TrimEnd("`r")
    if ($line.StartsWith('REGION')) {
      $f = $line -split "`t"
      $list += [pscustomobject]@{ Name = $f[1]; Id = $f[2]; Start = [double]$f[3]; End = [double]$f[4] }
    }
  }
  return $list
}

# --- 1. connectivity and status -------------------------------------------------------
try {
  $text = Send-Reaper @('TRANSPORT', 'REGION', 'TRACK')
  $lines = ($text -split "`n") | ForEach-Object { $_.TrimEnd("`r") }
  $transport = $lines | Where-Object { $_.StartsWith('TRANSPORT') } | Select-Object -First 1
  Report ($null -ne $transport) 'web remote reachable' $BaseUrl
  $fields = if ($transport) { $transport -split "`t" } else { @() }
  $posOk = $fields.Count -ge 3 -and ($fields[2] -as [double]) -ne $null
  Report $posOk 'TRANSPORT parses' "playstate=$($fields[1]) pos=$($fields[2])"
  $tracks = @($lines | Where-Object { $_.StartsWith('TRACK') })
  Report ($tracks.Count -gt 0) 'TRACK lines present' "$($tracks.Count) tracks incl. master"
  $peak = if ($tracks.Count -gt 1) { ($tracks[1] -split "`t")[6] } else { $null }
  Report ($null -ne $peak) 'track peak field present' "raw=$peak (tenths of dB expected)"
} catch {
  Report $false 'web remote reachable' "$($_.Exception.Message)"
  Write-Host ''
  Write-Host 'Enable it in REAPER: Preferences > Control/OSC/web > Add > Web browser interface (port 8080).'
  exit 1
}

# --- 2. ext state round trips --------------------------------------------------------
$unicode = 'F' + [char]0xFC + 'r Elise ' + [char]0x2728 + ' ' + [char]::ConvertFromUtf32(0x1F3B9)
Test-RoundTrip 'plain' 'Twinkle'
Test-RoundTrip 'spaces' 'Twinkle Little Star'
Test-RoundTrip 'punctuation' "Ode to Joy! (rough) - v2, it's #1?"
Test-RoundTrip 'unicode' $unicode
Test-RoundTrip 'percent' '100% done'
Test-RoundTrip 'plus' 'A+B'
Test-RoundTrip 'ampersand' 'Tom & Jerry'
Test-RoundTrip 'semicolon (app strips these)' 'a;b' -Info
Test-RoundTrip 'slash (app strips these)' 'a/b' -Info
Test-RoundTrip 'json' '{"v":1,"clips":{"12":{"label":"Twinkle","starred":true}}}'
Test-RoundTrip 'long 200' ('x' * 200)
foreach ($size in 300, 400, 500, 600, 800, 1000, 2000, 4000) {
  Test-RoundTrip "long $size (size ceiling)" ('x' * $size) -Info
}

# --- 3. rename round trip through the watcher ----------------------------------------
$clips = @(Get-Regions | Where-Object { $_.Name -match '^(Clip|Take) \d+' })
if ($clips.Count -eq 0) {
  Write-Host ''
  Write-Host 'SKIP  rename via watcher: no "Clip N" region in the project. Record a clip with the watcher running, or add a region named "Clip 1 - test".'
} else {
  $target = $clips[0]
  $label = 'Probe ' + (Get-Date -Format 'HHmmss')
  Write-Ext 'Studio' "rename_$($target.Id)" $label
  $deadline = (Get-Date).AddSeconds(5)
  $renamed = $null
  while ((Get-Date) -lt $deadline) {
    $renamed = Get-Regions | Where-Object { $_.Id -eq $target.Id } | Select-Object -First 1
    if ($renamed -and $renamed.Name.EndsWith($label)) { break }
    Start-Sleep -Milliseconds 250
  }
  $ok = $renamed -and $renamed.Name.EndsWith($label)
  if ($ok) {
    Report $true 'rename via watcher' "`"$($target.Name)`" -> `"$($renamed.Name)`""
  } else {
    $pending = Read-Ext 'Studio' "rename_$($target.Id)"
    $state = if ([string]::IsNullOrEmpty($pending)) { 'consumed' } else { 'still pending' }
    Report $false 'rename via watcher' "still `"$($renamed.Name)`"; request key $state"
    Write-Host '      Is cs-studio-watcher.lua running in this REAPER? (Actions > Load ReaScript reports "already running" if so.)'
  }
}

Write-Host ''
if ($script:Failures -eq 0) { Write-Host 'All checks passed.' } else { Write-Host "$($script:Failures) check(s) failed." }
exit $(if ($script:Failures -eq 0) { 0 } else { 1 })
