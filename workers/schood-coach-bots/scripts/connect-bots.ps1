# Connects the six coach bots in one go, after the worker is deployed. Run it from any folder:
#   powershell -ExecutionPolicy Bypass -File workers/schood-coach-bots/scripts/connect-bots.ps1
# It asks for each BotFather token with hidden input and checks it belongs to the right bot (getMe).
# Then it stores the tokens and fresh webhook secrets as Worker secrets (wrangler secret bulk), points
# each bot at coach-bots.schood.online and sets its names, commands and menu button (setup-webhooks.ts
# --apply), and tells schood-ai which bot is which (SCHOOD_AI_COACH_BOTS). Tokens are never printed or kept.
$ErrorActionPreference = 'Stop'
$worker = Split-Path -Parent $PSScriptRoot
$projectRef = 'bbjawctnqrufvnesdsel'
$bots = @(
  @{ Pack = 'ielts'; Id = '9179678621' },
  @{ Pack = 'speaking'; Id = '9047642281' },
  @{ Pack = 'maths'; Id = '9182890383' },
  @{ Pack = 'sales'; Id = '8788807188' },
  @{ Pack = 'career'; Id = '9090547765' },
  @{ Pack = 'speech'; Id = '9248058054' }
)

function Read-Hidden([string]$prompt) {
  $secure = Read-Host -AsSecureString $prompt
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr).Trim() } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
function New-Secret {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

$secrets = @{}
$entries = @()
foreach ($bot in $bots) {
  $key = $bot.Pack.ToUpper()
  while ($true) {
    $token = Read-Hidden "Token for the $($bot.Pack) bot (id $($bot.Id))"
    if ($token -notmatch '^\d+:[A-Za-z0-9_-]{30,}$') { Write-Host '  That is not a BotFather token. Try again.'; continue }
    try { $me = Invoke-RestMethod -Method Get -Uri "https://api.telegram.org/bot$token/getMe" } catch { Write-Host '  Telegram refused this token. Try again.'; continue }
    if ([string]$me.result.id -ne $bot.Id) { Write-Host "  This token is for @$($me.result.username), not the $($bot.Pack) bot. Try again."; continue }
    break
  }
  Write-Host "  ok: @$($me.result.username)"
  $secrets["COACH_BOT_TOKEN_$key"] = $token
  $secrets["COACH_WEBHOOK_SECRET_$key"] = New-Secret
  $entries += "$($bot.Pack):$($bot.Id):$($me.result.username)"
}

$file = Join-Path $env:TEMP ("coach-secrets-" + [guid]::NewGuid().ToString('N') + '.json')
Push-Location $worker
try {
  [IO.File]::WriteAllText($file, ($secrets | ConvertTo-Json -Compress))
  Write-Host 'Storing the Worker secrets...'
  npx wrangler secret bulk $file
  if ($LASTEXITCODE -ne 0) { throw 'wrangler secret bulk failed' }
  Remove-Item $file -Force

  Write-Host 'Connecting the bots to Telegram...'
  foreach ($name in $secrets.Keys) { Set-Item -Path "env:$name" -Value $secrets[$name] }
  deno run --no-lock --allow-read --allow-net --allow-env scripts/setup-webhooks.ts ($bots | ForEach-Object { $_.Pack }) --apply
  if ($LASTEXITCODE -ne 0) { throw 'setup-webhooks failed' }

  Write-Host 'Telling schood-ai which bot is which...'
  supabase secrets set "SCHOOD_AI_COACH_BOTS=$($entries -join ',')" --project-ref $projectRef
  if ($LASTEXITCODE -ne 0) { throw 'supabase secrets set failed' }
  Write-Host 'Done. All six coach bots are connected.'
} finally {
  if (Test-Path $file) { Remove-Item $file -Force }
  foreach ($name in @($secrets.Keys)) { Remove-Item -Path "env:$name" -ErrorAction SilentlyContinue }
  $secrets.Clear()
  Pop-Location
}
