# Security Runbook

## Scope
- AWS media bucket: `schood-project` (`us-east-1`)
- Runtime IAM user for media: `schood-media-runtime`
- Supabase Edge secrets used by media functions:
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
  - `S3_BUCKET`
  - `S3_REGION`
  - optional `MEDIA_ALERT_WEBHOOK_URL`

## 1) Verify current AWS caller
```powershell
aws sts get-caller-identity
aws s3 ls
```

## 2) Verify bucket safety controls
```powershell
aws s3api get-public-access-block --bucket schood-project
aws s3api get-bucket-encryption --bucket schood-project
aws s3api get-bucket-versioning --bucket schood-project
aws s3api get-bucket-lifecycle-configuration --bucket schood-project
```

Expected:
- Public access block: all `true`
- Encryption: `AES256` (or KMS if migrated)
- Versioning: `Enabled`
- Lifecycle rules present

## 3) Rotate runtime IAM key (safe sequence)
1. List keys:
```powershell
aws iam list-access-keys --user-name schood-media-runtime
```
2. If already 2 keys, delete oldest:
```powershell
aws iam delete-access-key --user-name schood-media-runtime --access-key-id <old_key_id>
```
3. Create new key:
```powershell
aws iam create-access-key --user-name schood-media-runtime
```
4. Smoke test with the new key:
```powershell
$env:AWS_ACCESS_KEY_ID="<new_key_id>"
$env:AWS_SECRET_ACCESS_KEY="<new_secret>"
$env:AWS_DEFAULT_REGION="us-east-1"
Set-Content .tmp-media-check.txt "ok" -Encoding ascii
aws s3api put-object --bucket schood-project --key healthcheck/media-key-check.txt --body .tmp-media-check.txt
aws s3api head-object --bucket schood-project --key healthcheck/media-key-check.txt
```
5. Update Supabase secrets:
```powershell
supabase secrets set AWS_ACCESS_KEY_ID=<new_key_id> AWS_SECRET_ACCESS_KEY=<new_secret> S3_BUCKET=schood-project S3_REGION=us-east-1
```
6. Delete previous key:
```powershell
aws iam delete-access-key --user-name schood-media-runtime --access-key-id <previous_key_id>
```
7. Cleanup smoke object:
```powershell
aws s3api delete-object --bucket schood-project --key healthcheck/media-key-check.txt
Remove-Item .tmp-media-check.txt
```

## 4) Deploy Edge functions after secret rotation
```powershell
supabase functions deploy admin-assets exam-state review-session grade-writing
```

## 5) Configure media alert webhook (optional but recommended)
If you have Slack/Discord/Pager webhook receiver:
```powershell
supabase secrets set MEDIA_ALERT_WEBHOOK_URL=https://<your-webhook-endpoint>
```

The media layer emits structured error logs and sends alert payloads on upload/sign failures.

## 6) Verify runtime behavior
1. Upload audio/image in Admin Builder asset picker.
2. Confirm signed URL preview works.
3. Start/review a session with media and verify playback/image loads.
