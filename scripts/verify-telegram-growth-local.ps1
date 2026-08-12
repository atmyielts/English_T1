$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$container = 'supabase_db_English_T1'

function Invoke-SqlFile([string]$RelativePath) {
  $path = Join-Path $repoRoot $RelativePath
  if (!(Test-Path -LiteralPath $path)) { throw "Missing SQL file: $RelativePath" }
  Get-Content -Raw -LiteralPath $path | docker exec -i $container psql -v ON_ERROR_STOP=1 -U postgres -d postgres
  if ($LASTEXITCODE -ne 0) { throw "SQL verification failed: $RelativePath" }
}

Push-Location $repoRoot
try {
  # This intentionally destroys and recreates only the named local Supabase DB.
  supabase db reset
  if ($LASTEXITCODE -ne 0) { throw 'Local Supabase reset failed' }
  Invoke-SqlFile 'scripts/telegram-growth-test-legacy-fixture.sql'
  Invoke-SqlFile 'supabase/migrations/20260812130000_telegram_growth_system.sql'
  Invoke-SqlFile 'scripts/verify-telegram-growth-db.sql'
  & (Join-Path $PSScriptRoot 'verify-telegram-growth-concurrency.ps1')
  if ($LASTEXITCODE -ne 0) { throw 'Telegram concurrency verification failed' }
  Invoke-SqlFile 'scripts/telegram-growth-validate-constraints.sql'
  supabase db lint --local --level error
  if ($LASTEXITCODE -ne 0) { throw 'Local database lint failed' }
  Write-Output 'Telegram local release verification passed'
} finally {
  Pop-Location
}
