import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

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

const secretRules = [
  { label: 'Supabase service role literal', regex: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g },
  { label: 'Supabase publishable literal', regex: /\bsb_publishable_[A-Za-z0-9_-]{20,}\b/g },
  { label: 'OpenRouter key literal', regex: /\bsk-or-v1-[A-Za-z0-9_-]{20,}\b/g },
  { label: 'OpenAI key literal', regex: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { label: 'AWS access key id literal', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { label: 'Private key block', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
];

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

  for (const rule of secretRules) {
    if (rule.regex.test(content)) {
      errors.push(`${rule.label} found in ${file}`);
      break;
    }
  }
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
