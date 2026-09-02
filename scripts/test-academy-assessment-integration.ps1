$ErrorActionPreference = 'Stop'
$assessmentQaWorkdir = Join-Path $PSScriptRoot '../output/supabase-assessment'
$assessmentConfig = Join-Path $assessmentQaWorkdir 'supabase/config.toml'
if (-not (Test-Path -LiteralPath $assessmentConfig)) {
  throw 'Start the isolated assessment QA Supabase project first. See ACADEMY_ASSESSMENT_SERVICES.md.'
}
if ((Get-Content -Raw -LiteralPath $assessmentConfig) -notmatch 'project_id = "English_T1_assessment_qa_20260902"') {
  throw 'Refusing an unrecognized Supabase project.'
}
$assessmentStatus = supabase status --workdir $assessmentQaWorkdir --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $assessmentStatus.API_URL -ne 'http://127.0.0.1:56321') {
  throw 'Only the isolated local assessment API on port 56321 is allowed.'
}
$assessmentPrevious = @{}
foreach ($assessmentName in @('SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY')) {
  $assessmentPrevious[$assessmentName] = [Environment]::GetEnvironmentVariable($assessmentName, 'Process')
}
try {
  $env:SUPABASE_URL = $assessmentStatus.API_URL
  $env:SUPABASE_ANON_KEY = $assessmentStatus.ANON_KEY
  $env:SUPABASE_SERVICE_ROLE_KEY = $assessmentStatus.SERVICE_ROLE_KEY
  deno test --allow-env --allow-net (Join-Path $PSScriptRoot '../supabase/functions/academy/assessment-integration.test.ts')
  if ($LASTEXITCODE -ne 0) { throw 'The local assessment integration test failed.' }
} finally {
  foreach ($assessmentName in $assessmentPrevious.Keys) {
    [Environment]::SetEnvironmentVariable($assessmentName, $assessmentPrevious[$assessmentName], 'Process')
  }
}
