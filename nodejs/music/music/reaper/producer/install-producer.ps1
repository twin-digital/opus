# Installs the CS Studio producer scripts into REAPER on this machine and writes their config.
#
#   powershell -ExecutionPolicy Bypass -File install-producer.ps1 -Inbox "D:\...\Studio" -Projects "P:\"
#
# -Inbox      folder the Outbox is mirrored into (one folder per project, each with manifest.json)
# -Projects   the studio's REAPER projects share, mounted read-only
# -Ref        git ref to fetch from (default: main)
# -ResourcePath  REAPER's resource path (default: %APPDATA%\REAPER)
#
# Afterwards, once: REAPER > Actions > Show action list > New action > Load ReaScript,
# pick Scripts\Studio\cs-studio-import.lua. It then runs from the action list.

param(
  [Parameter(Mandatory = $true)][string]$Inbox,
  [Parameter(Mandatory = $true)][string]$Projects,
  [string]$Ref = 'main',
  [string]$ResourcePath = (Join-Path $env:APPDATA 'REAPER')
)

$ErrorActionPreference = 'Stop'
$raw = "https://raw.githubusercontent.com/twin-digital/opus/$Ref/nodejs/music/music/reaper/producer"
$dir = Join-Path $ResourcePath 'Scripts\Studio'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

foreach ($file in 'cs-studio-import.lua', 'reaper-probe.ps1') {
  Invoke-WebRequest "$raw/$file" -OutFile (Join-Path $dir $file)
  Write-Host "installed $file"
}

$escape = { param($s) $s -replace '\\', '\\' -replace '"', '\"' }
$config = @"
-- Paths for cs-studio-import.lua. Written by install-producer.ps1; edit freely.
return {
  inbox = "$(& $escape $Inbox)",
  projects = "$(& $escape $Projects)",
}
"@
Set-Content -Path (Join-Path $dir 'cs-studio-import-config.lua') -Value $config -Encoding ASCII
Write-Host "wrote cs-studio-import-config.lua (inbox=$Inbox, projects=$Projects)"
Write-Host ''
Write-Host "Scripts are in $dir."
Write-Host 'If this is the first install: REAPER > Actions > Show action list > New action > Load ReaScript > cs-studio-import.lua'
