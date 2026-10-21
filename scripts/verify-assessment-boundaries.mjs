import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const services = ['assessment-cloud', 'exam', 'proctor'];
const protectedApps = ['platform', 'academy'];
const violations = [];
const normalize = value => value.replaceAll('\\', '/');
const interchange = (ref, resolved) => resolved.startsWith('services/assessment-interchange/') || ref === 'schood-assessment-interchange' || ref === '@xmldom/xmldom';
const smtpRuntime=(ref,resolved)=>resolved.startsWith('services/assessment-mailer/')||ref==='schood-assessment-mailer'||ref==='nodemailer'||ref.startsWith('nodemailer/');
const documentRuntime=(ref,resolved)=>resolved.startsWith('services/assessment-documents/')||['schood-assessment-documents','pdf-lib','@pdf-lib/fontkit','qrcode-generator'].includes(ref);
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat();
}
function references(file, content) {
  if (file.endsWith('.css')) return [...content.matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]/g)].map(match => match[1]);
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const imports = [];
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.arguments.length && ts.isStringLiteral(node.arguments[0]) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) imports.push(node.arguments[0].text);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) imports.push(node.argument.literal.text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return imports;
}
const appEntries = await readdir(path.join(root, 'apps'), { withFileTypes: true });
const appNames = new Map();
for (const app of appEntries.filter(entry => entry.isDirectory())) {
  try { const metadata = JSON.parse(await readFile(path.join(root, 'apps', app.name, 'package.json'), 'utf8')); appNames.set(metadata.name, app.name); } catch { /* Not every directory is an npm application. */ }
}
async function inspect(directory, rule) {
  const sources = (await files(path.join(root, directory))).filter(file => /\.(?:[cm]?[jt]sx?|css)$/.test(file));
  for (const file of sources) {
    for (const reference of references(file, await readFile(file, 'utf8'))) {
      const resolved = reference.startsWith('.') ? normalize(path.relative(root, path.resolve(path.dirname(file), reference))) : reference;
      const targetApp = /^apps\/([^/]+)/.exec(resolved)?.[1] ?? appNames.get(reference);
      const reason = rule(reference, resolved, targetApp) ?? (directory!=='services/assessment-mailer/src'&&smtpRuntime(reference,resolved)?'The isolated SMTP runtime must not enter apps, shared libraries, Edge functions or Workers':null)??(directory!=='services/assessment-documents/src'&&documentRuntime(reference,resolved)?'The isolated PDF/font/QR runtime must not enter apps, shared libraries, Edge functions or Workers':null);
      if (reason) violations.push(`${normalize(path.relative(root, file))}: ${reference} — ${reason}`);
    }
  }
  return sources.length;
}
let checked = 0;
for (const app of services) checked += await inspect(`apps/${app}/src`, (ref, resolved, targetApp) => interchange(ref,resolved) ? 'The isolated XML/package runtime must not enter browser applications' : targetApp && targetApp !== app ? 'A service must not import another application' : null);
for (const app of protectedApps) checked += await inspect(`apps/${app}/src`, (ref, resolved, targetApp) => interchange(ref,resolved) || services.includes(targetApp) || /^packages\/(assessment|proctor)-/.test(resolved) || /^@schood\/(assessment|proctor)-/.test(ref) ? 'Assessment/Proctor feature code must not enter the mother platform or Academy' : null);
for(const library of ['assessment-core','assessment-web','proctor-web'])checked+=await inspect(`packages/${library}/src`,(ref,resolved,targetApp)=>interchange(ref,resolved)||targetApp||resolved.startsWith('supabase/functions/')||resolved.startsWith('workers/')?'Shared Assessment/Proctor libraries must not import an application or server implementation':null);
checked += await inspect('packages/service-design/src', (ref, resolved) => {
  const visualOnly = /^react(?:\/jsx(?:-dev)?-runtime)?$/.test(ref) || resolved.startsWith('packages/service-design/') || (resolved.startsWith('brand-materials/') && /\.(svg|png|jpg|webp|ttf|woff2?)$/.test(resolved));
  return visualOnly ? null : 'The shared design package may import only React, its own design primitives or brand assets, not service logic or APIs';
});
checked += await inspect('packages/service-i18n/src', (ref, resolved) => /^react(?:\/jsx(?:-dev)?-runtime)?$/.test(ref) || resolved.startsWith('packages/service-i18n/') ? null : 'The shared localization package may import only React and itself, not service logic, accounts or APIs');
for (const service of ['assessment-cloud','assessment-runtime','proctor']) checked += await inspect(`supabase/functions/${service}`, (ref, resolved) => interchange(ref,resolved) || /^supabase\/functions\//.test(resolved) && !resolved.startsWith(`supabase/functions/${service}/`) && !resolved.startsWith('supabase/functions/_shared/') ? 'APIs must not import another service implementation or isolated parser' : null);
for(const worker of ['assessment-coordinator','assessment-grading','assessment-webhooks','assessment-media','assessment-roster','assessment-qti','proctor-evidence','proctor-live'])checked += await inspect(`workers/${worker}/src`,(ref,resolved,targetApp)=>interchange(ref,resolved)||targetApp||resolved.startsWith('supabase/functions/')||(resolved.startsWith('workers/')&&!resolved.startsWith(`workers/${worker}/`))?'Workers must not import an application, Edge implementation, isolated parser or another Worker implementation':null);
checked += await inspect('packages/assessment-worker/src',(ref,resolved,targetApp)=>interchange(ref,resolved)||targetApp||resolved.startsWith('workers/')||resolved.startsWith('supabase/functions/')?'Shared Worker transport must remain independent of service implementations':null);
checked += await inspect('services/assessment-interchange/src',(ref,resolved)=>resolved.startsWith('services/assessment-interchange/')||resolved.startsWith('packages/assessment-core/src/')||['@xmldom/xmldom','fflate'].includes(ref)||ref.startsWith('node:')?null:'The isolated interchange runtime may import only its own code, provider-free assessment contracts and its locked parser dependencies');
checked += await inspect('services/assessment-mailer/src',(ref,resolved)=>resolved.startsWith('services/assessment-mailer/src/')||ref==='nodemailer'||ref.startsWith('node:')?null:'SMTP transport/control must remain isolated from apps, Edge authority and other services');
checked += await inspect('services/assessment-documents/src',(ref,resolved)=>resolved.startsWith('services/assessment-documents/src/')||resolved.startsWith('packages/assessment-core/src/')||['pdf-lib','@pdf-lib/fontkit','qrcode-generator'].includes(ref)||ref.startsWith('node:')?null:'Certificate rendering may import only its own runtime, provider-free contracts and locked document libraries');
if (violations.length) { process.stderr.write(violations.join('\n') + '\n'); process.exitCode = 1; }
else process.stdout.write(`Passed service boundaries across ${checked} source files. Mother platform and Academy import no Assessment/Proctor feature code; services import no foreign app; shared design contains no service logic.\n`);
