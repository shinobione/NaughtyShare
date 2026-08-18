[CmdletBinding()]
param(
  [switch] $NativeCaptureSelfTest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Invoke-NativeCapture {
  param(
    [Parameter(Mandatory = $true)]
    [string] $FilePath,
    [Parameter(Mandatory = $true)]
    [string[]] $Arguments
  )

  # Windows PowerShell 5.1 turns redirected native stderr into ErrorRecord objects.
  # With the script-wide ErrorActionPreference=Stop that would terminate here before
  # we can inspect LASTEXITCODE. Temporarily downgrade only this capture operation.
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = & $FilePath @Arguments 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }

  return [pscustomobject]@{
    ExitCode = $exitCode
    Output = ($output -join "`n")
  }
}

function Invoke-Wrangler {
  param(
    [Parameter(Mandatory = $true)]
    [string[]] $Arguments,
    [switch] $Capture
  )

  if ($Capture) {
    return Invoke-NativeCapture -FilePath 'npx.cmd' -Arguments (@('wrangler') + $Arguments)
  }

  & npx.cmd wrangler @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Wrangler command failed: npx wrangler $($Arguments -join ' ')"
  }
}

function Get-NaughtyShareD1 {
  $list = Invoke-Wrangler -Arguments @('d1', 'list', '--json') -Capture
  if ($list.ExitCode -ne 0) {
    Write-Host $list.Output
    throw 'Unable to list D1 databases in the authenticated Cloudflare account.'
  }

  $jsonStart = $list.Output.IndexOf('[')
  if ($jsonStart -lt 0) {
    throw 'Wrangler d1 list did not return a JSON array.'
  }

  $jsonText = $list.Output.Substring($jsonStart)
  try {
    $databases = @($jsonText | ConvertFrom-Json)
  } catch {
    throw "Unable to parse Wrangler D1 list JSON: $($_.Exception.Message)"
  }

  $database = $databases |
    Where-Object {
      $_.name -eq 'naughtyshare' -or
      $_.database_name -eq 'naughtyshare'
    } |
    Select-Object -First 1

  if (-not $database) {
    return $null
  }

  foreach ($property in @('uuid', 'database_id', 'id')) {
    $value = $database.$property
    if ($value -and $value -match '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') {
      return $value.ToLowerInvariant()
    }
  }

  throw 'Found D1 database naughtyshare, but its UUID was missing from Wrangler JSON output.'
}

if ($NativeCaptureSelfTest) {
  $probe = Invoke-NativeCapture -FilePath 'cmd.exe' -Arguments @('/d', '/c', 'echo naughtyshare-native-stderr-probe 1>&2 & exit /b 7')
  if ($probe.ExitCode -ne 7 -or $probe.Output -notmatch 'naughtyshare-native-stderr-probe') {
    throw "Native stderr capture self-test failed. ExitCode=$($probe.ExitCode) Output=$($probe.Output)"
  }
  Write-Host 'Native stderr capture self-test PASS.' -ForegroundColor Green
  exit 0
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js is required. Install Node.js before running this script.'
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw 'npm is required. Install Node.js/npm before running this script.'
}

Write-Host '== NaughtyShare Cloudflare bootstrap ==' -ForegroundColor Cyan
Write-Host 'No media or application secrets are created by this script.'
Write-Host ''

Write-Host '[1/7] Installing project dependencies...'
& npm.cmd install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }

Write-Host '[2/7] Checking Cloudflare login...'
$whoami = Invoke-Wrangler -Arguments @('whoami') -Capture
if ($whoami.ExitCode -ne 0) {
  Write-Host $whoami.Output
  throw 'Wrangler is not authenticated. Run: npx wrangler login ; then re-run this script.'
}
Write-Host $whoami.Output

Write-Host '[3/7] Ensuring private R2 bucket naughtyshare-media exists...'
$r2Info = Invoke-Wrangler -Arguments @('r2', 'bucket', 'info', 'naughtyshare-media') -Capture
if ($r2Info.ExitCode -ne 0) {
  Write-Host 'R2 bucket not found; creating it.'
  Invoke-Wrangler -Arguments @('r2', 'bucket', 'create', 'naughtyshare-media', '--update-config=false')
} else {
  Write-Host 'R2 bucket already exists.' -ForegroundColor Green
}

Write-Host '[4/7] Ensuring D1 database naughtyshare exists...'
$d1Id = Get-NaughtyShareD1
if (-not $d1Id) {
  Write-Host 'D1 database not found; creating it.'
  Invoke-Wrangler -Arguments @('d1', 'create', 'naughtyshare', '--update-config=false')
  $d1Id = Get-NaughtyShareD1
}

if (-not $d1Id) {
  throw 'Unable to find the NaughtyShare D1 database after creation.'
}
Write-Host "D1 database ID: $d1Id" -ForegroundColor Green

Write-Host '[5/7] Wiring the D1 database ID into wrangler.jsonc...'
$configPath = Join-Path $repoRoot 'wrangler.jsonc'
$config = Get-Content -Raw -LiteralPath $configPath
$currentMatch = [regex]::Match($config, '"database_id"\s*:\s*"([^"]+)"')
if (-not $currentMatch.Success) {
  throw 'Could not find d1_databases.database_id in wrangler.jsonc.'
}

$currentId = $currentMatch.Groups[1].Value
$placeholder = '00000000-0000-0000-0000-000000000000'
if ($currentId -eq $placeholder) {
  $config = $config.Substring(0, $currentMatch.Groups[1].Index) + $d1Id + $config.Substring($currentMatch.Groups[1].Index + $currentMatch.Groups[1].Length)
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($configPath, $config, $utf8NoBom)
  Write-Host 'wrangler.jsonc updated.' -ForegroundColor Green
} elseif ($currentId -eq $d1Id) {
  Write-Host 'wrangler.jsonc already points to this D1 database.' -ForegroundColor Green
} else {
  throw "wrangler.jsonc already contains a different D1 ID ($currentId). Refusing to overwrite it with $d1Id."
}

Write-Host '[6/7] Applying D1 migrations to the remote database...'
Invoke-Wrangler -Arguments @('d1', 'migrations', 'apply', 'naughtyshare', '--remote')

Write-Host '[7/7] Running build and production preflight...'
& npm.cmd run check
if ($LASTEXITCODE -ne 0) { throw 'npm run check failed.' }
& npm.cmd run 'preflight:production'
if ($LASTEXITCODE -ne 0) { throw 'Production preflight failed.' }

Write-Host ''
Write-Host 'Cloudflare storage bootstrap PASS.' -ForegroundColor Green
Write-Host ''
Write-Host 'The only repository change expected is the real D1 database_id in wrangler.jsonc.'
Write-Host 'Commit/push that change, then configure the GitHub production environment secrets:'
Write-Host '  CLOUDFLARE_ACCOUNT_ID'
Write-Host '  CLOUDFLARE_API_TOKEN'
Write-Host ''
Write-Host 'Do NOT paste the API token into chat, an issue, a commit, or a screenshot.' -ForegroundColor Yellow
Write-Host 'After those two GitHub secrets exist, run Actions > Deploy Production in bootstrap mode with confirm=DEPLOY.'
