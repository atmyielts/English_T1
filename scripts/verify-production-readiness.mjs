import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { secretLabels } from './production-secret-rules.mjs';

const trackedFiles = [
  ...execSync('git ls-files', { encoding: 'utf8' }).split(/\r?\n/),
  ...execSync('git ls-files --others --exclude-standard', { encoding: 'utf8' }).split(/\r?\n/),
]
  .map((line) => line.trim())
  .filter(Boolean)
  .filter((file, index, files) => files.indexOf(file) === index);

const errors = [];

const migrationsDirectory = join('supabase', 'migrations');
const migrationFiles = readdirSync(migrationsDirectory)
  .filter((file) => file.endsWith('.sql'))
  .sort();
const migrationSql = migrationFiles
  .map((file) => readFileSync(join(migrationsDirectory, file), 'utf8'))
  .join('\n');
const collectSqlNames = (pattern) =>
  new Set([...migrationSql.matchAll(pattern)].map((match) => match[1].toLowerCase()));
const declaredPublicTables = collectSqlNames(
  /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-zA-Z0-9_]+)/gi,
);
const rlsEnabledPublicTables = collectSqlNames(
  /alter\s+table\s+(?:if\s+exists\s+)?public\.([a-zA-Z0-9_]+)\s+enable\s+row\s+level\s+security/gi,
);
// PL/pgSQL loops count only when the loop's unconditional first statement enables RLS on the loop variable.
for (const match of migrationSql.matchAll(
  /foreach\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+in\s+array\s+array\[\s*((?:'[a-zA-Z0-9_]+'\s*,\s*)*'[a-zA-Z0-9_]+')\s*\]\s+loop\s+execute\s+format\(\s*'alter\s+table\s+public\.%I\s+enable\s+row\s+level\s+security'\s*,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)\s*;/gi,
)) {
  if (match[1].toLowerCase() !== match[3].toLowerCase()) continue;
  for (const [, table] of match[2].matchAll(/'([a-zA-Z0-9_]+)'/g)) rlsEnabledPublicTables.add(table.toLowerCase());
}
for (const table of [...declaredPublicTables].sort()) {
  if (!rlsEnabledPublicTables.has(table)) {
    errors.push(`Public table is declared without enabling RLS: public.${table}`);
  }
}

const blockedEnvFiles = trackedFiles.filter((file) => {
  const normalized = file.replace(/\\/g, '/');
  if (/\.env\.example$/i.test(normalized) || /\.env\.local\.example$/i.test(normalized)) return false;
  return /(^|\/)\.env($|\.)/i.test(normalized);
});

if (blockedEnvFiles.length) {
  errors.push(`Tracked secret env files detected: ${blockedEnvFiles.join(', ')}`);
}

const textExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.sql',
  '.toml',
  '.yml',
  '.yaml',
  '.env',
  '.example',
  '.txt',
  '.css',
  '.html',
]);

for (const file of trackedFiles) {
  const extension = extname(file).toLowerCase();
  const basename = file.split('/').pop() ?? file.split('\\').pop() ?? file;
  const likelyText = textExtensions.has(extension) || basename.includes('.env');
  if (!likelyText) continue;

  let content = '';
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  for (const label of secretLabels(content)) errors.push(`${label} found in ${file}`);
}

const productionExampleFiles = trackedFiles.filter((file) =>
  file === '.env.example' || file.endsWith('.env.local.example') || file.endsWith('.env.example'),
);

for (const file of productionExampleFiles) {
  let content = '';
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (/(localhost|127\.0\.0\.1)/i.test(content)) {
    errors.push(`Localhost reference found in production example file: ${file}`);
  }
}

if (errors.length) {
  console.error('Production readiness checks failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Production readiness checks passed.');
