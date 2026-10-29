// Applies the Company English migrations to an isolated, throwaway Postgres (no
// host port, no production credentials) and runs their integration tests.
// Each area owns one migration and one integration test with fixed names, picked
// up here when they exist: hiring 110000, training 120000, insights 130000, people 140000.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const areas = [['core', '100000'], ['hiring', '110000'], ['training', '120000'], ['insights', '130000'], ['people', '140000']];
const migrations = areas.map(([area, time]) => `supabase/migrations/20261031${time}_company_${area}.sql`).filter((file) => existsSync(file));
// Each test prints "company <area>: ok" when every assertion held.
const tests = areas.map(([area]) => [`supabase/tests/company-${area}.integration.sql`, `company ${area}: ok`]).filter(([file]) => existsSync(file));

const container = `schood-company-test-${randomUUID().slice(0, 8)}`;
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 120000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  return result.stdout;
}
const psql = (sql, database = 'postgres') => docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database, '-At', '-v', 'ON_ERROR_STOP=1'], sql);
try {
  docker(['run', '--detach', '--rm', '--name', container, '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16-alpine']);
  let ready = false;
  for (let i = 0; i < 30 && !ready; i++) {
    ready = spawnSync('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']).status === 0;
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Isolated company database did not become ready');
  docker(['exec', container, 'mkdir', '-p', '/work']);
  // The tests include /work/migration.sql: every migration in order, as one file.
  const all = migrations.map((file) => readFileSync(file, 'utf8')).join('\n;\n');
  docker(['exec', '-i', container, 'sh', '-c', 'cat > /work/migration.sql'], all);
  // Every test gets its own fresh database with the fixture.
  for (const [index, [file, marker]] of tests.entries()) {
    const database = `company_${index}`;
    psql(`create database ${database};`);
    psql(readFileSync('supabase/tests/company.fixture.sql', 'utf8'), database);
    const output = psql(readFileSync(file, 'utf8'), database);
    if (!output.includes(marker)) throw new Error(`${file}\n${output}`);
    // Re-applying every migration must be harmless.
    psql(all, database);
  }
  console.log(`Company English database: ${migrations.length} migrations, ${tests.length} integration tests, re-apply safe.`);
} finally {
  spawnSync('docker', ['rm', '--force', container]);
}
