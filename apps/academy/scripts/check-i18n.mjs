import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const academyRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(academyRoot, 'src');
const localeRoot = path.join(sourceRoot, 'i18n', 'locales');
const translatableAttributes = new Set(['aria-label', 'aria-description', 'placeholder', 'title', 'alt']);
const uiMetadataKeys = new Set([
  'label',
  'title',
  'description',
  'subtitle',
  'eyebrow',
  'helper',
  'caption',
  'queue',
  'badge',
  'empty',
  'emptyMessage',
  'headline',
  'subheadline',
]);
const runtimeKeys = [
  'The quiz attempt does not belong to this classroom.',
  'Your quiz answers cannot be saved in this browser tab. Keep the quiz open until you submit.',
  'Verification is temporarily unavailable. Try again later.',
  'Decision notes', 'Requested', 'Confirmed', 'In progress', 'Delivered', 'Cancelled',
  'Add marking guidance for every teacher-reviewed task.',
  // Assessment lane metadata, server validation, report fields, and action notices.
  "Placement & exams",
  "Placement, exam days, reviewed reports, and academic progress",
  "grammar",
  "vocabulary",
  "reading",
  "listening",
  "writing",
  "speaking",
  "Registered",
  "Taking assessment",
  "Needs review",
  "Ready to share",
  "Report shared",
  "Preparing",
  "Open",
  "Closed",
  "Placement",
  "Help each learner start in the right course.",
  "Assess skills",
  "Review the report",
  "Exam day",
  "Prepare the session, welcome candidates, and share reviewed results.",
  "Prepare the paper",
  "Register candidates",
  "Open the session",
  "Review and share",
  "Academic progress",
  "Understand learning progress and decide where support will help.",
  "Set a baseline",
  "Repeat the assessment",
  "Compare the evidence",
  "Plan support",
  "Assessment evidence",
  "Strengths",
  "Recommended course",
  "Next learning steps",
  "Learning plan",
  "Record interview evidence in review notes.",
  "Not assessed",
  "Assessment workspace refreshed.",
  "Assessment paper saved. You can now plan a session.",
  "Assessment session prepared. Register students, then open it.",
  "Session opened. Registered students can start at the scheduled time.",
  "Session closed. Saved answers remain available for submission.",
  "Students registered. Share the session instructions with them.",
  "Applicant registered for placement. Their lead stays open until enrollment.",
  "Report approved. Check it before sharing with the student.",
  "Report shared with the student.",
  "Student enrolled. Their assessment history remains available here.",
  "Unsaved changes",
  "View report",
  "Continue assessment",
  "Start assessment",
  "Awaiting teacher review",
  "Saved answers collected. You can now review the work.",
  "Wait until the assessment ends before collecting saved answers.",
  "This assessment is not open. Check the session time with your center.",
  "Time has ended. Submit your saved answers.",
  "This exam session has no remaining seats for this selection.",
  "Registration is closed.",
  "Add the learner email in Admissions before registering.",
  "This phone belongs to another student record. Resolve the duplicate in Contacts first.",
  "Name the paper and choose 5–240 minutes.",
  "Add 2–8 answer choices and select the correct answer.",
  "Check the title, session dates, and available seats.",
  "Enter a valid mark for every teacher-reviewed task.",
  "Add review notes and explain the evidence before approving.",
  "Explain the assessment evidence and any limitations before approving the report.",
  'Language',
  'English',
  'Uzbek',
  'Russian',
  'On',
  'Off',
  'Not shared',
  'Awaiting grade',
  'Not set',
  'Primary contact',
  'Authorized contact',
  'points',
  'mother',
  'father',
  'guardian',
  'sponsor',
  'emergency contact',
  'other',
  'invited',
  'active',
  'suspended',
  'Owner',
  'Admin',
  'Center admin',
  'Branch manager',
  'Manager',
  'Counselor',
  'Salesperson',
  'Cashier',
  'Accountant',
  'Payroll officer',
  'Parent liaison',
  'Receptionist',
  'Teacher',
  'Assistant',
  'Student',
  'Academy member',
  'Member',
  'Command Center',
  'Operations Center',
  'LMS Center',
  'Telegram link could not be created',
];
const files = [];

const collectFiles = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectFiles(absolutePath);
    else if (/\.tsx?$/.test(absolutePath)) files.push(absolutePath);
  }
};

const sourcePhrases = new Set(runtimeKeys);
const rawText = [];

collectFiles(sourceRoot);

const collectLiteralPhrases = (node) => {
  if (!node) return;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    if (/[A-Za-z]/.test(node.text)) sourcePhrases.add(node.text);
    return;
  }
  if (ts.isConditionalExpression(node)) {
    collectLiteralPhrases(node.whenTrue);
    collectLiteralPhrases(node.whenFalse);
  }
};

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const visit = (node) => {
    if (
      ts.isCallExpression(node)
      && ['translate','t'].includes(node.expression.getText(sourceFile))
      && node.arguments[0]
    ) {
      collectLiteralPhrases(node.arguments[0]);
    }

    if (
      ts.isPropertyAssignment(node)
      && uiMetadataKeys.has(node.name.getText(sourceFile).replace(/^['\"]|['\"]$/g, ''))
    ) {
      collectLiteralPhrases(node.initializer);
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
      && node.name.text === 'OFFICE_LABELS' && node.initializer
      && ts.isObjectLiteralExpression(node.initializer)) {
      for (const property of node.initializer.properties) {
        if (ts.isPropertyAssignment(property)) collectLiteralPhrases(property.initializer);
      }
    }

    if (ts.isCallExpression(node)) {
      const callName = node.expression.getText(sourceFile);
      if (['setError', 'setNotice', 'setLocalError', 'setLocalNotice'].includes(callName)) {
        collectLiteralPhrases(node.arguments[0]);
      }
      if (callName === 'run') collectLiteralPhrases(node.arguments[1]);
      if (file.includes('assessments') && callName === 'command') collectLiteralPhrases(node.arguments[2]);
      if (callName === 'officeNavItem') collectLiteralPhrases(node.arguments[1]);
    }

    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && /(Label|Title|Description)$/.test(node.name.text)
    ) {
      collectLiteralPhrases(node.initializer);
    }

    if (
      ts.isReturnStatement(node)
      && node.expression
      && (ts.isStringLiteral(node.expression) || ts.isNoSubstitutionTemplateLiteral(node.expression))
      && /^[A-Z]/.test(node.expression.text)
    ) {
      sourcePhrases.add(node.expression.text);
    }

    if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) {
        if (!ts.isArrayLiteralExpression(element) || element.elements.length < 2) continue;
        const candidate = element.elements[element.elements.length - 1];
        if (
          (ts.isStringLiteral(candidate) || ts.isNoSubstitutionTemplateLiteral(candidate))
          && /^[A-Z]/.test(candidate.text)
        ) {
          sourcePhrases.add(candidate.text);
        }
      }
    }

    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && /(STATUSES|TYPES|FILTERS)$/.test(node.name.text)
      && node.initializer
      && ts.isArrayLiteralExpression(node.initializer)
    ) {
      for (const element of node.initializer.elements) collectLiteralPhrases(element);
    }

    if (
      file.includes('assessments') && ts.isJsxAttribute(node) && node.initializer &&
      ts.isStringLiteral(node.initializer) && ['label','title'].includes(node.name.text)
    ) collectLiteralPhrases(node.initializer);

    if (ts.isJsxText(node)) {
      const normalized = node.getText(sourceFile).replace(/\s+/g, ' ').trim();
      if (/[A-Za-z]/.test(normalized)) rawText.push(`${path.relative(sourceRoot, file)}: ${normalized}`);
    }

    if (
      ts.isJsxAttribute(node)
      && node.initializer
      && ts.isStringLiteral(node.initializer)
      && translatableAttributes.has(node.name.text)
      && !(file.includes('assessments') && node.parent.parent.tagName?.getText(sourceFile)==='Section')
      && /[A-Za-z]/.test(node.initializer.text)
    ) {
      rawText.push(`${path.relative(sourceRoot, file)}: ${node.name.text}="${node.initializer.text}"`);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

const sortedPhrases = [...sourcePhrases].sort((left, right) => left.localeCompare(right));
const sourceDictionary = Object.fromEntries(sortedPhrases.map((phrase) => [phrase, phrase]));

if (process.argv.includes('--write-source')) {
  fs.writeFileSync(path.join(localeRoot, 'en.json'), `${JSON.stringify(sourceDictionary, null, 2)}\n`, 'utf8');
}

const placeholderNames = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
const failures = [];
const untranslatedAllowlist = new Set([
  '{academy} ({role})',
  'Academy',
  'Audit',
  'Bonus',
  'Chat',
  'Email',
  'Excel',
  'Favicon URL',
  'Logo URL',
  'Model',
  'Payload SHA-256',
  'SMS',
  'Schood',
  'Telegram',
  'Telegram chat ID',
  'UZS',
  'URL',
  'O‘zbekcha',
]);

for (const locale of ['uz', 'ru']) {
  const dictionary = JSON.parse(fs.readFileSync(path.join(localeRoot, `${locale}.json`), 'utf8'));
  const missing = sortedPhrases.filter((phrase) => !dictionary[phrase]);
  const extras = Object.keys(dictionary).filter((phrase) => !sourcePhrases.has(phrase));
  const badPlaceholders = sortedPhrases.filter((phrase) => {
    if (!dictionary[phrase]) return false;
    return placeholderNames(phrase).join('|') !== placeholderNames(dictionary[phrase]).join('|');
  });
  const untranslated = sortedPhrases.filter((phrase) => (
    dictionary[phrase] === phrase
    && /[A-Za-z]{4}/.test(phrase)
    && !untranslatedAllowlist.has(phrase)
  ));

  if (missing.length) failures.push(`${locale}: ${missing.length} missing translations`);
  if (extras.length) failures.push(`${locale}: ${extras.length} unused translations`);
  if (badPlaceholders.length) failures.push(`${locale}: ${badPlaceholders.length} placeholder mismatches`);
  if (untranslated.length) failures.push(`${locale}: ${untranslated.length} untranslated phrases`);
}

if (rawText.length) failures.push(`${rawText.length} raw JSX strings remain: ${rawText.join('; ')}`);

if (failures.length) {
  console.error(`Academy localization check failed:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`Academy localization check passed: ${sortedPhrases.length} phrases covered in Uzbek and Russian.`);
}
