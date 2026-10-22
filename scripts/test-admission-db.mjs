// Applies the admission learner-state migration to an isolated, throwaway
// Postgres (no host port, no production credentials) and runs its integration test.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const container = `schood-admission-test-${randomUUID().slice(0, 8)}`;
const migration = 'supabase/migrations/20261024200000_admission_learner_state.sql';
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 120000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  return result.stdout;
}
const psql = (sql) => docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], sql);
try {
  docker(['run', '--detach', '--rm', '--name', container, '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16-alpine']);
  let ready = false;
  for (let i = 0; i < 30 && !ready; i++) {
    ready = spawnSync('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']).status === 0;
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Isolated admission database did not become ready');
  // The Assessment Cloud core supplies the item versions answers point at.
  psql(readFileSync('supabase/tests/assessment-cloud.fixture.sql', 'utf8'));
  psql(readFileSync('supabase/migrations/20261013100000_assessment_cloud_core.sql', 'utf8'));
  docker(['exec', container, 'mkdir', '-p', '/work']);
  docker(['exec', '-i', container, 'sh', '-c', 'cat > /work/migration.sql'], readFileSync(migration, 'utf8'));
  const output = psql(readFileSync('supabase/tests/admission-learner-state.integration.sql', 'utf8'));
  if (!output.includes('admission learner state: ok')) throw new Error(output);
  // Applying the migration twice must be harmless.
  psql(readFileSync(migration, 'utf8'));
  console.log('Admission learner state: replay, lost-update protection, mistake kinds and browser isolation passed.');
} finally {
  spawnSync('docker', ['rm', '--force', container]);
}
