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
  "If you are under 18, a parent or guardian turns this on from the parent page.",
  "You are not a learner at this centre.",
  "Your parent access does not include homework.",
  "Refresh the workspace before saving this lesson.",
  "Review attendance and its retry key.",
  "Review the lesson and retry key.",
  "We could not confirm this booking. Retry the same lesson.",
  "Your current access does not cover this lesson booking.",
  "The room, teacher or class is already booked, or the retry belongs to another change. Review the timetable.",
  "Review the lesson, branch, room, teacher and availability.",
  "Review the collection amount, method and retry key.",
  "Student payment and cashier receipt recorded.",
  "Collect a student payment",
  "Record cash or a completed card-terminal receipt in your own open shift. Click payments must use their verified provider flow.",
  "Open your cashier shift before collecting a payment.",
  "Loading financial records…",
  "Cashier shift",
  "Choose an open shift",
  "Add to prepaid wallet",
  "Card terminal receipt",
  "Receipt note",
  "Record collection",
  "Choose student",
  "Teacher retention",
  "Starting cohorts, teacher transfers and academy departures",
  "Compare the starting student cohort with the end of the selected period. Teacher transfers and academy departures are reported separately.",
  "Period start",
  "Period end",
  "All permitted branches",
  "Load report",
  "Loading report…",
  "Recorded history begins: {date}",
  "This period begins before recorded teacher history. Historical retention cannot be reconstructed from current assignments.",
  "Use recorded history",
  "Recording has just started. Refresh in a moment.",
  "No teacher cohort in this period.",
  "Teacher retention report",
  "Starting cohort",
  "Retained with teacher",
  "Teacher transfers",
  "Academy departures",
  "Unresolved",
  "Import corrections excluded",
  "Teacher retention rate",
  "Academy retention rate",
  "Showing the first 500 teachers. Select a branch for a smaller report.",
  "Pauses remain retained. Completed courses and corrected imports are excluded from the rate denominator. Unresolved changes or an empty denominator show no rate. These figures describe cohorts and do not rank teachers.",
  "Choose a recorded period of at most 366 days.",
  "Your current access does not cover this retention report.",
  "Unable to load teacher retention. Try again.",
  "Unable to confirm this retention report. Try again.",
  "Refresh the gradebook and review the current submission attempt.",
  "We could not confirm this grade. Retry the same grading change.",
  "Your current access does not cover this assignment and learner.",
  "The assignment or submission attempt changed. Refresh and review it.",
  "Review the current score, maximum and rubric criteria.",
  "Review a smaller grading change.",
  "Choose a valid grading action.",
  "Your current access does not cover this operational workspace.",
  "Unable to load this operational workspace. Try again.",
  "Unable to confirm current operational access. Try again.",
  "Learning is unavailable with your current enrollment or prepaid balance. Ask your academy to review access.",
  "Unable to check learning access. Try again.",
  "Your current access does not cover this recording.",
  "The assignment or recording changed. Review its current status.",
  "Review the recording and its written response.",
  "This recording is not confirmed. Retry the same recording.",
  "The recording upload is not confirmed. Retry the same recording.",
  "Unable to confirm the saved recording. Try again.",
  "Confirm the pending recording before starting another.",
  "The saved recording changed. Reopen the recording panel.",
  "Recordings are temporarily unavailable. Try again.",
  // Parent portal feedback and signed linking.
  "An invitation is needed",
  "Ask your academy for an invitation",
  "Connect family updates",
  "Connect with your child’s academy",
  "I agree to connect this account to my child’s academy updates.",
  "Invitation code",
  "No balance recorded",
  "Open the parent invitation link sent by your academy. Sign in using the email they invited.",
  "Showing recent records. Ask the academy for earlier history.",
  "Updating student information...",
  "View your child’s charges and payments here.",
  "Your family dashboard",
  "Loading your parent portal...",
  "We could not load your parent portal. Try again.",
  "Parent access changed or expired. Ask the academy to review it.",
  "Choose a student from your parent portal.",
  "Choose a valid parent portal page.",
  "Review and confirm the parent invitation.",
  "Open the parent invitation inside Telegram.",
  "Telegram linking is temporarily unavailable. Ask the academy for a parent invitation.",
  // Student and parent invitation feedback.
  "Accept invitation",
  "Accept your invitation",
  "Confirm family access",
  "I agree to link my account for the student and access shown above.",
  "Review invitation again",
  "Staff access",
  "This access has been stopped. Ask the academy to review it.",
  "This group is paused. Your account can be linked without restarting lessons.",
  "You can view",
  "Your account is linked",
  "Sign in again to continue.",
  "Your account changed. Reopen this page.",
  "We could not confirm your account link. Open the invitation again.",
  "We could not confirm this change. Try the same change again.",
  "There is too much information to save at once. Save fewer changes.",
  "This service is temporarily unavailable. Try again.",
  "Your changes could not be saved. Try again.",
  "We could not confirm this invitation. Try the same invitation again.",
  "You do not have permission to use this invitation with your current account.",
  "The invitation details or linked account changed. Refresh and review the invitation.",
  "Invitation has expired. Ask the academy for a new link.",
  "Invitation or student record is no longer available.",
  "Check the student, parent and email before continuing.",
  "We could not load the invitation details. Open the link again.",
  "Try this invitation again.",
  "Choose a valid invitation.",
  "Choose a valid student, group and parent.",
  "We could not confirm email delivery. Try the same invitation again.",
  "Open the invitation again and review its details before accepting.",
  "We could not confirm your account link. Check the invitation again.",
  "Choose a valid invitation list.",
  "The invitation list did not finish loading. Refresh it.",
  // Staff invitation transport and gateway feedback.
  "Invitation is saved, but email delivery is unconfirmed. Retry the same invitation.",
  "Staff controls are temporarily unavailable. Try again.",
  "Your current account or access does not cover this invitation.",
  "This invitation conflicts with the current staff identity or access. Refresh and review the staff grant.",
  "Invitation or staff grant is no longer available.",
  "Review the invitation role, resources and recipient.",
  "We could not confirm this invitation request. Retry the same request.",
  "The invitation service returned an incomplete response. Retry the same request.",
  "Choose a valid invitation delivery identity.",
  "We could not confirm this delivery attempt. Retry the same request.",
  "We could not confirm staff activation. Refresh and try again.",
  "The invitation directory returned an incomplete response.",

  'Your current access does not cover these records.',
  'The directory is temporarily unavailable. Try again.',
  'The directory returned an incomplete response. Try again.',
  'Choose a valid directory page.', 'Search is limited to 120 characters.', 'Choose a valid classroom.',
  'Contact verification is temporarily unavailable. Try again.',
  'The email and phone belong to different contacts. Ask an administrator to resolve them.',
  'This contact changed while you were saving. Refresh it before trying again.',
  // Import and scheduling errors arrive dynamically from the API/helpers.
  'The timetable could not be created. Refresh the preview and try again.',
  'Choose a valid date and time.',
  'This local time does not exist because the clock changes. Choose another time.',
  'This local time occurs twice because the clock changes. Choose an unambiguous time.',
  'Active status must be yes or no.', 'Use exact integer text for an opening balance.',
  'Opening balances must be non-zero whole units.', 'Opening balance is outside the supported range.',
  'Group capacity must be a non-negative integer.', 'Mapped import columns are required.',
  'Import row number must be an integer from 1 to 5,000.',
  'Map columns','Review & import','Receipt','New students','Needs correction','Skipped',
  'uploading','sealed','validated','committing','completed','failed','cancelled','reversing','reversed','recovery review',
  'To resume this upload, select the same original file.', 'The original upload row count does not match.',
  'Choose a CSV or XLSX file.', 'Choose the original file to upload.', 'Choose a branch.',
  'Map student name and phone before uploading.', 'Map each source column to only one field.',
  'A source row is too large to upload.',
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
  "Same photo as another student",
  "Very similar to another answer",
  "Typed in Telegram (not timed)",
  "Large pasted text",
  "Unusually fast typing",
  "Voice answers are marked by the teacher.",
  "This file type is marked by the teacher.",
  "The AI could not read the photos.",
  "Already graded.",
  "The AI did not mark this one.",
  "Assigned",
  "Opened in Telegram",
  "Returned",
  "Corrected",
  "Mastered",
  "Teacher Pro",
  "Telegram homework hand-in",
  "Publish courses",
  "Everything in Teacher",
  "Mistake bank",
  "Trusted-homework signals",
  "Review queue",
  "Homework funnel",
  "Weekly parent summary",
  "AI pre-marking",
  "Handed in",
  "On time",
  "Reviewed",
  "Median review time",
  "Headline",
  "City",
  "Level",
  "Price (as you want it shown)",
  "Schedule",
  "Start date",
  "Seats",
  "Teacher",
  "month",
  "year",
  "Teacher (yearly)",
  "Teacher Pro (yearly)",
  "Everything in Teacher Pro",
  "Two months free"
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
  if (process.argv.includes('--report')) console.log(JSON.stringify({locale,missing,extras}));
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
