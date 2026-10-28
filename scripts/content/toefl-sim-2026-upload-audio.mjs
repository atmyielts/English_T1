#!/usr/bin/env node
// OPTIONAL: move TOEFL 2026 Listening audio from public Pages hosting to the
// private S3 media store used by admin-assets (signed URLs via exam-state).
//
// Default hosting needs no upload: the simulator build copies
// content/toefl-2026/audio/*.mp3 to https://toefl.schood.online/media/toefl-2026/.
// Use this only if the audio must not be publicly downloadable.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<anon> \
//   TOEFL_ADMIN_ACCESS_TOKEN=<access token of an admin with admin.assets.manage> \
//   node scripts/content/toefl-sim-2026-upload-audio.mjs --out <dir> [--apply]
//
// Without --apply it only lists what it would upload. With --apply it uploads
// each Listening MP3 through POST /functions/v1/admin-assets/upload and writes
// <dir>/toefl-2026-audio-storage.sql, which switches the matching `audio`
// content units from `data.url` to `data.storage` (exam-state then signs them).
// Speaking prompts keep their Pages URL: exam-state only signs `audio` units.
// Review the SQL, then run it with `supabase db query --linked -f <file>` or in
// the SQL editor.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const audioDir = path.join(root, 'content', 'toefl-2026', 'audio');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const outIndex = args.indexOf('--out');
const outDir = outIndex >= 0 ? path.resolve(args[outIndex + 1]) : null;

const durations = JSON.parse(fs.readFileSync(path.join(audioDir, 'durations.json'), 'utf8'));
const listening = fs.readdirSync(audioDir).filter((f) => /^(lcr|conv|ann|talk)-.*\.mp3$/.test(f)).sort();
console.log(`${listening.length} Listening files (${(listening.reduce((n, f) => n + fs.statSync(path.join(audioDir, f)).size, 0) / 1e6).toFixed(1)} MB)`);
if (!apply) {
  console.log('Dry run. Re-run with --apply --out <dir> to upload and write the SQL.');
  process.exit(0);
}

const base = String(process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const anon = process.env.SUPABASE_ANON_KEY ?? '';
const token = process.env.TOEFL_ADMIN_ACCESS_TOKEN ?? '';
if (!base || !anon || !token || !outDir) {
  console.error('SUPABASE_URL, SUPABASE_ANON_KEY, TOEFL_ADMIN_ACCESS_TOKEN and --out are required with --apply.');
  process.exit(1);
}

const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const statements = ['begin;', "set local lock_timeout='5s';"];
for (const file of listening) {
  const form = new FormData();
  form.set('file', new Blob([fs.readFileSync(path.join(audioDir, file))], { type: 'audio/mpeg' }), file);
  form.set('kind', 'audio');
  if (durations[file]) form.set('duration_seconds', String(durations[file]));
  const res = await fetch(`${base}/functions/v1/admin-assets/upload`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    console.error(`${file}: upload failed (${res.status}) ${await res.text()}`);
    process.exit(1);
  }
  const { bucket, path: key } = await res.json();
  statements.push(
    `update public.content_units set data = (data - 'url') || jsonb_build_object('storage', jsonb_build_object('provider', 's3', 'bucket', ${lit(bucket)}, 'path', ${lit(key)})) where type = 'audio' and data->>'url' = ${lit(`/media/toefl-2026/${file}`)};`,
  );
  console.log(`uploaded ${file} -> ${bucket}/${key}`);
}
statements.push('commit;', '');
fs.mkdirSync(outDir, { recursive: true });
const sqlPath = path.join(outDir, 'toefl-2026-audio-storage.sql');
fs.writeFileSync(sqlPath, statements.join('\n'));
console.log(`wrote ${sqlPath}`);
