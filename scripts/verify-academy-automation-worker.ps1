$ErrorActionPreference = 'Stop'

$fixture = Join-Path $PSScriptRoot 'verify-academy-automation-worker-fixture.sql'
Get-Content -Raw -LiteralPath $fixture |
  docker exec -i supabase_db_English_T1 psql -v ON_ERROR_STOP=1 -U postgres -d postgres

$statusLines = supabase status -o env
$environmentMap = @{
  'API_URL' = 'SUPABASE_URL'
  'ANON_KEY' = 'SUPABASE_ANON_KEY'
  'SERVICE_ROLE_KEY' = 'SUPABASE_SERVICE_ROLE_KEY'
}
foreach ($line in $statusLines) {
  if ($line -match '^([A-Z_]+)="?(.*?)"?$' -and $environmentMap.ContainsKey($Matches[1])) {
    $value = $Matches[2].TrimEnd('"')
    $targetName = $environmentMap[$Matches[1]]
    Set-Item -Path "Env:$targetName" -Value $value
  }
}
if (-not $env:SUPABASE_URL -or -not $env:SUPABASE_ANON_KEY -or -not $env:SUPABASE_SERVICE_ROLE_KEY) {
  throw 'Unable to read local Supabase URL, anon key, and service-role key'
}

$env:ACADEMY_AUTOMATION_FIXTURE_ID = 'a0000000-0000-4000-8000-000000000001'
deno run --allow-env --allow-net --allow-read scripts/verify-academy-automation-worker.ts
if ($LASTEXITCODE -ne 0) { throw 'First automation worker cycle failed' }
deno run --allow-env --allow-net --allow-read scripts/verify-academy-automation-worker.ts
if ($LASTEXITCODE -ne 0) { throw 'Automation worker replay cycle failed' }
