import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const approvedAdvisory = 'https://github.com/advisories/GHSA-qwww-vcr4-c8h2';
const approvedRouterVersion = '7.18.1';

const fail = (message, details = '') => {
  console.error(`Runtime dependency audit failed: ${message}`);
  if (details) console.error(details.trim());
  process.exit(1);
};

const audit = process.platform === 'win32'
  ? spawnSync(
      process.env.ComSpec ?? 'cmd.exe',
      ['/d', '/s', '/c', 'npm audit --omit=dev --audit-level=high --json'],
      { encoding: 'utf8' },
    )
  : spawnSync('npm', ['audit', '--omit=dev', '--audit-level=high', '--json'], { encoding: 'utf8' });

if (audit.error) fail('npm audit could not be started.', audit.error.message);
if (audit.status === 0) {
  console.log('Runtime dependency audit passed with no high or critical findings.');
  process.exit(0);
}
if (audit.status !== 1) fail(`npm audit exited unexpectedly with status ${audit.status}.`, audit.stderr);

let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  fail('npm audit did not return valid JSON.', `${audit.stdout}\n${audit.stderr}`);
}

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const routerVersion = lock.packages?.['node_modules/react-router']?.version;
const routerDomVersion = lock.packages?.['node_modules/react-router-dom']?.version;
if (routerVersion !== approvedRouterVersion || routerDomVersion !== approvedRouterVersion) {
  fail(`The approved exception requires react-router and react-router-dom ${approvedRouterVersion}.`);
}

const vulnerabilities = report.vulnerabilities ?? {};
const names = Object.keys(vulnerabilities).sort();
if (names.join(',') !== 'react-router,react-router-dom') {
  fail(`Findings outside the approved exception were reported: ${names.join(', ') || 'unknown'}.`);
}

const routerFinding = vulnerabilities['react-router'];
const routerDomFinding = vulnerabilities['react-router-dom'];
const advisoryUrls = (routerFinding.via ?? [])
  .filter((entry) => typeof entry === 'object' && entry !== null)
  .map((entry) => entry.url);
const routerDomCauses = (routerDomFinding.via ?? []).filter((entry) => typeof entry === 'string');

if (
  routerFinding.severity !== 'high' ||
  routerDomFinding.severity !== 'high' ||
  advisoryUrls.length !== 1 ||
  advisoryUrls[0] !== approvedAdvisory ||
  routerDomCauses.length !== 1 ||
  routerDomCauses[0] !== 'react-router'
) {
  fail('The audit result does not exactly match the approved React Router RSC exception.');
}

const counts = report.metadata?.vulnerabilities ?? {};
if (counts.total !== 2 || counts.high !== 2 || counts.critical !== 0) {
  fail('The audit severity counts exceed the approved exception.');
}

const rscUsage = spawnSync(
  'git',
  [
    'grep',
    '-n',
    '-E',
    'unstable_.*RSC|unstable_createCallServer|react-server-dom',
    '--',
    'apps',
    'packages',
    'workers',
    'supabase',
  ],
  { encoding: 'utf8' },
);
if (rscUsage.error) fail('The RSC usage check could not be started.', rscUsage.error.message);
if (rscUsage.status === 0) {
  fail('Unstable RSC API usage invalidates the approved exception.', rscUsage.stdout);
}
if (rscUsage.status !== 1) fail(`The RSC usage check exited unexpectedly with status ${rscUsage.status}.`, rscUsage.stderr);

console.log('Runtime dependency audit passed with approved GHSA-qwww-vcr4-c8h2 exception only.');
