import { readFile } from 'node:fs/promises';
import { resolve4 } from 'node:dns/promises';
import { spawnSync } from 'node:child_process';

const projectRef = 'bbjawctnqrufvnesdsel';
const callbackUrl = 'https://click.schood.online/click';
const expectedIp = '89.168.67.25';
const expectedServiceId = '104316';
const requiredSecrets = ['CLICK_SERVICE_ID', 'CLICK_MERCHANT_ID', 'CLICK_MERCHANT_USER_ID', 'CLICK_SECRET_KEY'];
const offline = process.argv.includes('--offline');
const results = [];
const npmCli = process.env.npm_execpath;

const gate = (name, ok, detail) => {
  results.push({ name, ok, detail });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}\n`);
};

const run = (name, command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, ...options });
  gate(name, result.status === 0, result.status === 0 ? 'completed' : `exit ${result.status ?? 'unknown'}`);
  if (result.status !== 0) {
    const safe = String(result.stderr || result.stdout || '').split(/\r?\n/).filter(Boolean).slice(-8).join('\n');
    if (safe) process.stderr.write(`${safe}\n`);
  }
  return result;
};

const config = await readFile('supabase/config.toml', 'utf8');
gate('click config', /\[functions\.click\]\s*verify_jwt\s*=\s*false/.test(config), 'click has config-controlled verify_jwt=false');

const source = await readFile('supabase/functions/click/handler.ts', 'utf8');
gate('callback route', source.includes('url.pathname.endsWith("/webhook")'), '/functions/v1/click/webhook is intentional');
gate('signature boundary', source.includes('verifyClickWebhookSignature') && source.includes('sanitizeClickCallbackPayload(params)'), 'signature validation precedes payment mutation and signatures are not persisted');

const buildEnv = { ...process.env };
if (!buildEnv.VITE_SUPABASE_URL) buildEnv.VITE_SUPABASE_URL = `https://${projectRef}.supabase.co`;
if (!buildEnv.VITE_SUPABASE_ANON_KEY && !offline) {
  const keyResult = spawnSync('supabase', ['projects', 'api-keys', '--project-ref', projectRef, '--output', 'json'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (keyResult.status === 0) {
    try {
      const keys = JSON.parse(keyResult.stdout);
      buildEnv.VITE_SUPABASE_ANON_KEY = keys.find((key) => key.name === 'anon' && key.type === 'legacy')?.api_key ?? '';
    } catch {
      // The build gate below reports the missing public key without exposing it.
    }
  }
}

run('CLICK tests', 'deno', ['test', '--allow-read',
  'supabase/functions/click/webhook-security.test.ts',
  'supabase/functions/click/payment-safety.test.ts',
  'supabase/functions/click/payment-flow-simulation.test.ts',
  'supabase/functions/click/launch-contract.test.ts',
]);
const dockerList = spawnSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8', windowsHide: true });
if (dockerList.status === 0 && String(dockerList.stdout).split(/\r?\n/).includes('supabase_db_English_T1')) {
  const dbVerification = await readFile('scripts/verify-click-db-guardrails.sql', 'utf8');
  run('CLICK database guardrails', 'docker', ['exec', '-i', 'supabase_db_English_T1', 'psql', '-U', 'postgres', '-d', 'postgres'], { input: dbVerification });
} else {
  gate('CLICK database guardrails', false, 'local Supabase database is not running');
}
const npmCommand = npmCli ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const npmPrefix = npmCli ? [npmCli] : [];
run('platform checkout build', npmCommand, [...npmPrefix, '--workspace', 'apps/platform', 'run', 'build'], { env: buildEnv });
run('Academy billing build', npmCommand, [...npmPrefix, '--workspace', 'apps/academy', 'run', 'build'], { env: buildEnv });

if (!offline) {
  try {
    const addresses = await resolve4('click.schood.online');
    gate('callback DNS', addresses.length === 1 && addresses[0] === expectedIp, addresses.join(', ') || 'no A record');
  } catch (error) {
    const lookup = spawnSync('nslookup', ['click.schood.online'], { encoding: 'utf8', windowsHide: true });
    const addresses = String(lookup.stdout || '').match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? [];
    gate('callback DNS', lookup.status === 0 && addresses.includes(expectedIp), addresses.includes(expectedIp) ? expectedIp : (error instanceof Error ? error.message : String(error)));
  }

  try {
    const response = await fetch(callbackUrl, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    const body = await response.text();
    gate(
      'callback HTTPS',
      response.status === 405 && body.includes('CLICK webhook requires POST') && !body.includes('Unauthorized'),
      `HTTP ${response.status}; handler=${body.includes('CLICK webhook requires POST')}`,
    );
  } catch (error) {
    gate('callback HTTPS', false, error instanceof Error ? error.message : String(error));
  }

  const functionList = run('Supabase function inventory', 'supabase', ['functions', 'list', '--project-ref', projectRef]);
  const functionOutput = String(functionList.stdout || '');
  gate('click function ACTIVE', /\bclick\s+\|\s+click\s+\|\s+ACTIVE\b/.test(functionOutput), 'function name/status found without inspecting secret values');

  const secretList = spawnSync('supabase', ['secrets', 'list', '--project-ref', projectRef], { encoding: 'utf8', windowsHide: true });
  const secretOutput = String(secretList.stdout || '');
  const missing = requiredSecrets.filter((name) => !new RegExp(`\\b${name}\\b`).test(secretOutput));
  gate('production CLICK secret names', secretList.status === 0 && missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : 'all required names installed');

  try {
    const envText = await readFile('.click-production.env', 'utf8');
    const serviceLine = envText.split(/\r?\n/).find((line) => line.startsWith('CLICK_SERVICE_ID='));
    const serviceId = serviceLine?.slice('CLICK_SERVICE_ID='.length).trim();
    gate('production service ID value', serviceId === expectedServiceId, serviceId === expectedServiceId ? '104316' : 'local production env file missing or mismatched');
  } catch {
    gate('production service ID value', false, '.click-production.env not present for value verification');
  }
} else {
  process.stdout.write('SKIP live DNS, HTTPS, Supabase inventory, and production secret checks (--offline)\n');
}

const failures = results.filter((result) => !result.ok);
process.stdout.write(`\n${results.length - failures.length}/${results.length} checks passed.\n`);
if (failures.length > 0) process.exitCode = 1;
