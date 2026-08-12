$ErrorActionPreference = 'Stop'
$docker = (Get-Command docker -ErrorAction Stop).Source
$container = 'supabase_db_English_T1'

function Invoke-LocalPsql([string]$Sql) {
  $output = & $docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d postgres -Atq -c $Sql 2>&1
  if ($LASTEXITCODE -ne 0) { throw ($output -join "`n") }
  return @($output | ForEach-Object { "$_".Trim() } | Where-Object { $_ })
}

function Start-LocalPsqlJob([string]$Sql) {
  Start-Job -ScriptBlock {
    param($Docker, $Container, $Query)
    $output = & $Docker exec $Container psql -v ON_ERROR_STOP=1 -U postgres -d postgres -Atq -c $Query 2>&1
    [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output -join "`n") }
  } -ArgumentList $docker, $container, $Sql
}

Invoke-LocalPsql "delete from public.telegram_update_receipts where bot_name='schoodonlinebot' and telegram_update_id=991001" | Out-Null
$claimSql = "select outcome from public.claim_telegram_update('schoodonlinebot',991001,'99101','message',120)"
$claimJobs = @(Start-LocalPsqlJob $claimSql; Start-LocalPsqlJob $claimSql)
$claimResults = $claimJobs | Wait-Job | Receive-Job
$claimJobs | Remove-Job
if (@($claimResults | Where-Object Output -eq 'claimed').Count -ne 1 -or @($claimResults | Where-Object Output -eq 'busy').Count -ne 1) {
  throw "Concurrent update claim failed: $($claimResults | ConvertTo-Json -Compress)"
}

Invoke-LocalPsql "delete from public.platform_notifications where dedupe_key like 'telegram-concurrency-test:%'; insert into public.platform_notifications(user_id,chat_id,channel,type,body,status,scheduled_at,dedupe_key) values ('11111111-1111-4111-8111-111111111111','99111','telegram','test','one','queued',now(),'telegram-concurrency-test:1'),('22222222-2222-4222-8222-222222222222','99112','telegram','test','two','queued',now(),'telegram-concurrency-test:2')" | Out-Null
$queueSql = 'select id::text from public.claim_telegram_notification_batch(1)'
$queueJobs = @(Start-LocalPsqlJob $queueSql; Start-LocalPsqlJob $queueSql)
$queueResults = $queueJobs | Wait-Job | Receive-Job
$queueJobs | Remove-Job
$queueIds = @($queueResults | Where-Object ExitCode -eq 0 | ForEach-Object Output)
if ($queueIds.Count -ne 2 -or ($queueIds | Select-Object -Unique).Count -ne 2) {
  throw "Concurrent notification claim failed: $($queueResults | ConvertTo-Json -Compress)"
}

Invoke-LocalPsql "update public.users set telegram_chat_id=null where id in ('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333')" | Out-Null
$token2 = @(Invoke-LocalPsql "select token from public.issue_telegram_link_token('22222222-2222-4222-8222-222222222222',null,null)")[0]
$token3 = @(Invoke-LocalPsql "select token from public.issue_telegram_link_token('33333333-3333-4333-8333-333333333333',null,null)")[0]
Invoke-LocalPsql "select confirmation_required from public.consume_telegram_link_token('$token2','99999')" | Out-Null
Invoke-LocalPsql "select confirmation_required from public.consume_telegram_link_token('$token3','99999')" | Out-Null
$linkJobs = @(
  Start-LocalPsqlJob "select user_id::text from public.confirm_telegram_link_token('$token2','22222222-2222-4222-8222-222222222222')"
  Start-LocalPsqlJob "select user_id::text from public.confirm_telegram_link_token('$token3','33333333-3333-4333-8333-333333333333')"
)
$linkResults = $linkJobs | Wait-Job | Receive-Job
$linkJobs | Remove-Job
if (@($linkResults | Where-Object ExitCode -eq 0).Count -ne 1 -or @($linkResults | Where-Object { $_.Output -like '*telegram_chat_already_linked*' }).Count -ne 1) {
  throw "Concurrent account link failed: $($linkResults | ConvertTo-Json -Compress)"
}

Write-Output 'Telegram concurrency verification passed'
