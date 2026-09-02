import { useEffect, useMemo, useState } from 'react';
import { assessmentGuides } from './assessmentGuides';

type Lang = 'en' | 'uz' | 'ru';

type Section = {
  id: string;
  title: string;
  intro: string;
  steps?: string[];
  tips?: string[];
};

type QuickStart = {
  audience: string;
  title: string;
  text: string;
  href: string;
  action: string;
};

type Copy = {
  langName: string;
  shortName: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  primaryCta: string;
  secondaryCta: string;
  updated: string;
  currentLabel: string;
  searchLabel: string;
  searchPlaceholder: string;
  noResults: string;
  quickStartEyebrow: string;
  quickStartTitle: string;
  quickStartSubtitle: string;
  quickStarts: QuickStart[];
  teacherSignalTitle: string;
  teacherSignalEyebrow: string;
  teacherSignalAria: string;
  teacherSignalMeta: string;
  teacherSignalSteps: string[];
  routesTitle: string;
  operatingTitle: string;
  operatingSubtitle: string;
  rolesTitle: string;
  checklistTitle: string;
  sectionEyebrow: string;
  rolesEyebrow: string;
  checklistEyebrow: string;
  navTitle: string;
  docsLabel: string;
  appLabel: string;
  canLabel: string;
  cannotLabel: string;
  routeRows: Array<{ route: string; label: string; text: string }>;
  flowRows: Array<{ layer: string; path: string; label: string; text: string }>;
  roleRows: Array<{ role: string; scope: string; can: string; cannot: string }>;
  sections: Section[];
  checklist: string[];
  footer: string;
};

const langOrder: Lang[] = ['en', 'uz', 'ru'];

const docs: Record<Lang, Copy> = {
  en: {
    langName: 'English',
    shortName: 'EN',
    eyebrow: 'Schood Academy operations guide',
    title: 'Run your center. Support every learner.',
    subtitle:
      'Practical help for center teams, teachers, learners, and families—from a first placement assessment to lessons, homework, exam days, payments, and progress reviews.',
    primaryCta: 'Open Academy',
    secondaryCta: 'Start with your role',
    updated: 'Updated September 2, 2026 · assessment walkthroughs and help in three languages',
    currentLabel: 'Current production guide',
    searchLabel: 'Find a workflow',
    searchPlaceholder: 'Teacher, attendance, Telegram…',
    noResults: 'No guide section matches this search.',
    quickStartEyebrow: 'Role-first guide',
    quickStartTitle: 'Start with the work you need to do',
    quickStartSubtitle: 'Choose your role. Each route keeps unrelated controls and student data out of the way.',
    quickStarts: [
      { audience: 'Owner or admin', title: 'Set up and govern an academy', text: 'Branding, staff access, classrooms, curriculum, finance, reports, and operating controls.', href: '#create', action: 'Open setup guide' },
      { audience: 'Center team', title: 'Run daily operations', text: 'Contacts, enrollment, schedules, service requests, payments, alerts, and family follow-up.', href: '#education-os', action: 'Open operations guide' },
      { audience: 'Teacher or assistant', title: 'Teach today', text: 'Open the assigned lesson, take attendance, follow curriculum, finish, and assign homework.', href: '#teacher-day', action: 'Open teacher guide' },
      { audience: 'Telegram staff app', title: 'Work from your phone', text: 'Use the Academy bot for today’s classes, attendance, homework, announcements, and requests.', href: '#telegram', action: 'Open Telegram guide' },
      { audience: 'Admissions or exam team', title: 'Run your first assessment', text: 'Prepare a paper, welcome candidates, review their work, and share useful next steps.', href: '#assessment-operations', action: 'Open assessment guide' },
      { audience: 'Learner or applicant', title: 'Take a test and find your report', text: 'Sign in, check in, save your answers, submit your work, and understand the reviewed result.', href: '#assessment-learner', action: 'Open learner guide' },
    ],
    teacherSignalTitle: 'IELTS 6.5 · Group A17',
    teacherSignalEyebrow: 'Teacher day',
    teacherSignalAria: 'Teacher lesson workflow',
    teacherSignalMeta: '18:00–19:30 · Room 12 · 17 students',
    teacherSignalSteps: ['Start lesson', 'Attendance', 'Cover curriculum', 'Finish & assign'],
    routesTitle: 'Workspace routes',
    operatingTitle: 'Operating model',
    operatingSubtitle:
      'Order the product from ownership to learning: Center Office is the business parent, Academy is the LMS tenant, and classrooms are where daily teaching happens.',
    rolesTitle: 'Role and access matrix',
    checklistTitle: 'Launch checklist',
    sectionEyebrow: 'Academy operations',
    rolesEyebrow: 'Access grants',
    checklistEyebrow: 'Go-live',
    navTitle: 'On this page',
    docsLabel: 'Academy docs',
    appLabel: 'academy.schood.online',
    canLabel: 'Can',
    cannotLabel: 'Cannot',
    routeRows: [
      { route: '/academies', label: 'Workspace selection', text: 'The safe entry point after sign-in. It shows only academies and roles linked to the account.' },
      { route: '/academy/admin', label: 'Owner and admin', text: 'Full academy control, staff grants, finance, offers, branding, reports, and Education OS.' },
      { route: '/academy/center', label: 'Center admin', text: 'Center-owned academy oversight, linked academies, staff grants, finance, schedule, and global operations.' },
      { route: '/academy/office', label: 'Manager or counselor', text: 'Contacts, roster, classrooms, schedule, messages, alerts, and operational follow-up.' },
      { route: '/academy/teacher', label: 'Teacher or assistant', text: 'A dedicated teaching office for assigned lessons, curriculum, attendance, homework, classrooms, and student follow-up.' },
      { route: '/academy/student', label: 'Student', text: 'Classroom feed, announcements, assignments, submissions, progress, alerts, and tuition items.' },
      { route: '/academy/parent', label: 'Parent or guardian', text: 'Consent-controlled access to the linked learner’s attendance, grades, homework, schedule, messages, reports, and permitted finance data.' },
      { route: '/telegram', label: 'Academy Telegram staff app', text: 'A role-scoped mobile workspace opened through @schoodacademybot. Telegram identity and Academy access are verified before data loads.' },
    ],
    flowRows: [
      { layer: '1', path: '/center-office', label: 'Center Office', text: 'Business parent for centers: center profile, staff, linked academies, partner controls, vouchers, wallet, and high-level reporting.' },
      { layer: '2', path: '/academy/admin or /academy/center', label: 'Academy control', text: 'One academy tenant: branding, roles, offers, Click tuition, staff grants, schedule, classrooms, and reports.' },
      { layer: '3', path: '/academy/office', label: 'Academy office', text: 'Daily operations for managers and counselors: contacts, roster, messages, alerts, schedule gaps, and student follow-up.' },
      { layer: '4', path: '/academy/teacher', label: 'Teacher workspace', text: 'Classroom delivery: assignments, resources, gradebook, attendance sessions, classroom messages, and progress feedback.' },
      { layer: '5', path: '/academy/student', label: 'Student workspace', text: 'Focused learning space: enrolled classrooms, announcements, assignments, submissions, progress, attendance, and tuition items.' },
    ],
    roleRows: [
      { role: 'Owner / admin', scope: 'Academy-wide', can: 'Manage staff, branding, finance, offers, schedule, LMS, reports, certificates, and automations.', cannot: 'Should not be used as a daily teacher account unless the same person truly teaches.' },
      { role: 'Center admin', scope: 'Center-owned academies', can: 'Operate linked academies, staff, finance, offers, contacts, schedule, and messages.', cannot: 'Does not enter teacher-only grading lanes unless also granted a teaching role.' },
      { role: 'Manager / counselor', scope: 'Academy operations', can: 'Manage contacts, classrooms, roster, schedule, messages, alerts, and Education OS actions.', cannot: 'Cannot manage finance, offers, staff grants, certificates, or teacher grading.' },
      { role: 'Teacher / assistant', scope: 'Assigned classrooms', can: 'Create assignments, grade submissions, mark attendance, manage resources, schedule, and messages.', cannot: 'Cannot see finance, offers, staff grants, global admin settings, or unrelated classrooms.' },
      { role: 'Student', scope: 'Own enrolled classrooms', can: 'View lessons, messages, announcements, assignments, progress, attendance, alerts, and payments.', cannot: 'Cannot access office, staff, roster, finance, or other students records.' },
    ],
    sections: [
      ...assessmentGuides.en,
      {
        id: 'model',
        title: '0. Organize the service model',
        intro:
          'Do not organize Academy as a collection of dashboards. Organize it as a chain of responsibility: center business ownership, academy operations, classroom delivery, and student learning.',
        steps: [
          'Use Center Office only for the center-level business container: profile, staff, linked academies, partner controls, wallet, vouchers, and cross-academy visibility.',
          'Use /academy/admin for a standalone academy owner and /academy/center when a center admin operates a linked academy.',
          'Use /academy/office for managers and counselors who run daily operations without finance or staff-grant power.',
          'Use /academy/teacher for assigned classroom work. Teachers should not need admin access to teach, grade, mark attendance, or publish class resources.',
          'Use /academy/student as the narrow learner workspace. Students should never see office, staff, roster administration, or finance controls.',
        ],
        tips: [
          'After sign-in, route people to the first workspace their grant actually supports instead of showing every possible product surface.',
          'If one person has multiple jobs, grant multiple roles deliberately and keep each job in its own route lane.',
        ],
      },
      {
        id: 'create',
        title: '1. Create the academy',
        intro:
          'An Academy is a tenant for one learning operation. Create one for each school, branch, or center-owned learning unit that needs its own students, classes, staff, offers, and reports.',
        steps: [
          'Sign in with an owner or admin account and open Academy.',
          'Choose Create academy, enter the public name, and use a readable slug such as atlas-ielts or t1-academy.',
          'Confirm the academy opens on the admin route. The creator becomes owner automatically.',
          'Set branding early: logo, display name, colors, custom footer, and public-facing academy text.',
          'Create at least one classroom before inviting teachers, because teacher and assistant grants need classroom scope.',
        ],
        tips: [
          'Use one academy per real operational unit. Do not split one class across multiple academies unless reporting and payments must be separate.',
          'If a partner center owns the academy, create it from Center Office so the center relationship is recorded correctly.',
        ],
      },
      {
        id: 'role-grants',
        title: '2. Grant roles deliberately',
        intro:
          'Access is granted through role grants. A grant has an email, role, scope, status, optional expiry, and audit history. This is the source of truth for who can enter each workspace.',
        steps: [
          'Open Role grants from the admin or center workspace.',
          'Enter the user email exactly as they use it for Schood sign-in.',
          'Choose a role. Use admin and center_admin sparingly; use manager/counselor for operations; use teacher/assistant for classroom LMS work.',
          'For teacher and assistant, select the exact classrooms they should work in.',
          'Set status to invited for a new person, active for a known internal user, or suspended when access should pause.',
          'Use Revoke when the relationship is over. Revoke keeps history; it is better than deleting access records.',
        ],
        tips: [
          'Invited grants become active when the matching user signs in.',
          'Expiry is useful for trial teachers, temporary assistants, seasonal counselors, or contractors.',
        ],
      },
      {
        id: 'classrooms',
        title: '3. Build classrooms and roster',
        intro:
          'Classrooms are the operational center of Academy. They connect students, staff, assignments, attendance, schedule, messages, and reports.',
        steps: [
          'Create classroom names that staff and students will recognize, for example IELTS B2 Morning or SAT Math Weekend.',
          'Add placement level, description, public status, and classroom settings if the class should be visible to learners.',
          'Create or import contacts, then add them to the classroom roster as students or observers.',
          'Keep inactive students in contacts, but remove them from active classroom rosters when they stop attending.',
          'Use bulk invite when a new cohort joins at once.',
        ],
        tips: [
          'Roster quality affects every LMS report. If a student is missing from gradebook or attendance, check classroom membership first.',
          'Managers can operate roster; teachers should normally work only inside assigned classroom lanes.',
        ],
      },
      {
        id: 'curriculum',
        title: '4. Build curriculum and assessments',
        intro:
          'Create the teaching plan before the timetable. Courses contain modules and sequenced lessons; lessons can carry objectives, resources, estimated time, homework guidance, and native assessments.',
        steps: [
          'Create a course, add modules, then add lessons in the order teachers should deliver them.',
          'Give each lesson a clear outcome, estimated duration, teaching notes, resources, and homework guidance.',
          'Publish the course to the right classrooms so the teacher day can attach the correct lesson automatically.',
          'Create native quizzes with passing score, attempt limit, time limit, and questions, or configure grade categories and rubrics for teacher-scored work.',
          'Use curriculum progress and assessment evidence in student, guardian, and operational reporting.',
        ],
        tips: [
          'A scheduled lesson without a published curriculum link can still run, but the teacher will not receive the complete ready-to-teach experience.',
          'Keep one source of truth for lesson order. Do not copy the same plan into chat messages and spreadsheets.',
        ],
      },
      {
        id: 'teacher-day',
        title: '5. Run the teacher lesson day',
        intro:
          'The dedicated Teacher Workspace turns an assigned session into one controlled flow: open the lesson, teach from the attached curriculum, save attendance, record coverage, finish, and assign the prepared homework.',
        steps: [
          'Open /academy/teacher. Today shows only sessions inside the teacher or assistant’s assigned scope.',
          'Select the session and confirm time, room or delivery mode, roster, curriculum lesson, objectives, resources, and homework draft.',
          'Choose Start lesson. The lesson run becomes active and can be continued after a reload or from the Telegram staff app.',
          'Mark every learner present, late, absent, or excused, then save attendance before finishing.',
          'Check the curriculum objectives actually covered, adjust the proposed homework and due date, add a teacher note when useful, then choose Finish lesson and assign.',
        ],
        tips: [
          'Starting, attendance, and finishing use idempotent actions, so retry after a network interruption instead of creating a second lesson record.',
          'If no lesson appears, check the dated session, primary teacher assignment, classroom scope, and published curriculum—not the teacher’s admin permissions.',
        ],
      },
      {
        id: 'lms',
        title: '6. Run assignments, grading, and resources',
        intro:
          'Academy is now a real LMS lane, not just an Education OS dashboard. Teachers and assistants should be able to run class work without admin access.',
        steps: [
          'Assignments: select a classroom, create a task, set due date, max score, score weight, status, and instructions.',
          'Student submissions: students open their classroom, submit text or a link, and track status.',
          'Gradebook: choose assignment and student, submit score, max score, and feedback notes.',
          'Attendance: choose session date, mark each roster member present, late, absent, or excused, then save the session.',
          'Resources: publish links or materials to the right classroom so students see them in context.',
        ],
        tips: [
          'Use score weights for serious programs. A mock exam can count more than homework without changing the max score.',
          'Grade and attendance data feed progress reporting, risk detection, certificates, and parent reports.',
        ],
      },
      {
        id: 'schedule',
        title: '7. Manage schedule',
        intro:
          'Schedule connects classroom rhythm to operational follow-up. It is available to admins, center admins, managers, counselors, teachers, and assistants according to their route scope.',
        steps: [
          'Open the classroom and add recurring weekly slots with day, start time, optional end time, timezone, and label.',
          'Use labels like Speaking lab, Mock review, or Grammar workshop so students understand the session purpose.',
          'Review schedule gaps in Education OS and close them before the cohort starts.',
          'Remove obsolete slots when a cohort ends or moves to a new timetable.',
        ],
        tips: [
          'Use the academy timezone consistently. Mixing local timezones inside one cohort creates attendance confusion.',
          'Teachers can manage schedule for their class, but finance and staff settings stay outside their lane.',
        ],
      },
      {
        id: 'payments',
        title: '8. Configure offers and Click payments',
        intro:
          'Academy payments use Click only. Do not configure TSPay for Academy. Offers describe what is sold, payments track settlement, and grants/entitlements describe what the student receives.',
        steps: [
          'Create offers for tuition, course packages, mock exams, or classroom access windows.',
          'Attach grants to offers so payment can create the right access or entitlement.',
          'Create payment records from the office when a student owes tuition or a package fee.',
          'Use Click pay-by-card or Click invoice flows where enabled.',
          'Mark manual settlement only when the money is confirmed outside the automated flow.',
        ],
        tips: [
          'Managers and teachers should not see finance. Keep payment work in owner/admin or center_admin lanes.',
          'If payment status looks wrong, check Click transaction status before changing the Academy payment record.',
        ],
      },
      {
        id: 'messages',
        title: '9. Communicate clearly',
        intro:
          'Academy communication has three levels: direct messages, announcements, and alerts. Use the smallest level that reaches the right people.',
        steps: [
          'Use direct messages for individual student follow-up.',
          'Use classroom announcements for lesson reminders, homework notes, or schedule changes.',
          'Use global announcements only for academy-wide operational notices.',
          'Create alerts for risks, payment follow-up, attendance issues, or urgent support needs.',
          'Resolve alerts when the action is actually complete, not merely seen.',
        ],
        tips: [
          'Teachers can message within their assigned class scope. Managers can coordinate across operational records.',
          'Keep announcements short and actionable. Students read them inside the learning flow.',
        ],
      },
      {
        id: 'telegram',
        title: '10. Use the Academy Telegram staff app',
        intro:
          'The Academy bot is a mobile doorway into the same role-scoped work—not a second database or an ungoverned group chat. Staff open @schoodacademybot, link their Schood account, and use the Mini App for approved Academy actions.',
        steps: [
          'Open @schoodacademybot and use the one-time staff link created from Academy. Telegram identity and the active Academy role are verified before any workspace data loads.',
          'Use /today to see the next assigned class. Teachers can start or continue the lesson, take attendance, review curriculum, and finish with homework from the Mini App.',
          'Use /announce, /homework, /attendance, /requests, /groups, or /settings to open the corresponding role-permitted action.',
          'An Academy administrator must enable Telegram operations and connect staff, classroom, or guardian groups with a ten-minute one-time link.',
          'Keep BotFather group privacy enabled. The bot responds to explicit commands and approved actions; it does not read ordinary group conversation.',
        ],
        tips: [
          'Personal warnings, grades, payments, and individual attendance concerns stay in private delivery. Group posts contain only group-safe information.',
          'If the Mini App says the Telegram session expired, close it and reopen it from the bot. If it asks for a link, create a new staff link from Academy.',
        ],
      },
      {
        id: 'education-os',
        title: '11. Use Education OS without turning it into the product',
        intro:
          'Education OS is the command layer: it helps surface queue items, risk, schedule gaps, lifecycle stage changes, reports, and automation. The LMS workflows remain the core daily product.',
        steps: [
          'Start the day in Today to see open actions and urgent class issues.',
          'Use Pipeline for lead, placement, enrolled, learning, attention, renewal, and completion stages.',
          'Use Intelligence to spot risk patterns, backlog, and operational gaps.',
          'Use Command only from roles that are allowed to act on finance, reports, notifications, or automation.',
          'Keep teacher work inside Learning and Attendance unless the teacher has another role.',
        ],
        tips: [
          'If a control appears in the wrong route, treat it as a role-lane bug and fix the matrix before adding more UI.',
          'Education OS should help people decide what to do next; it should not replace assignment, grading, attendance, and schedule workflows.',
        ],
      },
      {
        id: 'students',
        title: '12. Student experience',
        intro:
          'Students should feel they are entering one focused learning space, not the admin product. Their workspace is intentionally narrow.',
        steps: [
          'Students sign in and open /academy/student.',
          'They see their academies, classrooms, announcements, alerts, assignments, attendance, progress, and tuition items.',
          'For each assignment, they open the task, submit text or a link, and later read feedback or score.',
          'They can use classroom messages for learning questions or support follow-up.',
          'If a student cannot see a class, check contact email, linked user, classroom membership, and active grant/entitlement.',
        ],
        tips: [
          'Do not grant staff roles to students for troubleshooting. Fix the roster or linked user record instead.',
          'Student screens should not expose office routes, staff, payments administration, or other learners data.',
        ],
      },
      {
        id: 'guardians',
        title: '13. Give families controlled visibility',
        intro:
          'The Parent Portal is built on an explicit learner–guardian relationship. Academy staff decide what each guardian may see, record consent, and use secure Telegram linking before family data becomes available.',
        steps: [
          'Create the guardian relationship from the learner record with name, relationship type, contact details, language, and responsibility flags.',
          'Choose the permitted data: status, attendance, grades, homework, schedule, payments, debt, messages, progress reports, resources, and announcements.',
          'Record consent and activate the relationship before sending an invitation or Telegram link.',
          'The guardian opens /academy/parent and sees only the linked learner and permitted categories.',
          'Revoke or narrow the relationship when custody, sponsorship, consent, or communication responsibility changes.',
        ],
        tips: [
          'Do not give a parent a student or staff account as a shortcut. Use the guardian relationship so access remains consented, scoped, and auditable.',
          'Payment and debt visibility are separate permissions; they are not automatically included with academic progress.',
        ],
      },
      {
        id: 'operations',
        title: '14. Production operations and troubleshooting',
        intro:
          'Schood has production only. Changes must be careful, tested, and role-aware. The Academy operator should know where to look when something feels wrong.',
        steps: [
          'Before changing production behavior, confirm the affected route and role: admin, center, office, teacher, or student.',
          'For missing access, check role grant status, email spelling, expiry, classroom scope, and whether the user has signed in.',
          'For missing LMS data, check classroom ID, roster membership, assignment status, and whether the user route has permission.',
          'For payments, remember Academy uses Click only.',
          'For schema or Edge Function changes, deploy Supabase migrations and functions manually after the frontend PR is merged.',
        ],
        tips: [
          'Never push directly to main. Use a PR, wait for CI, merge, watch production deploy, then run manual Supabase follow-ups.',
          'When in doubt, reduce access. It is easier to add a scoped grant than to recover from broad admin access.',
        ],
      },
    ],
    checklist: [
      'Academy created with clear name and slug.',
      'Branding, logo, public copy, and colors checked.',
      'At least one classroom created and active.',
      'Owner/admin access confirmed.',
      'Managers/counselors granted academy operations access.',
      'Teachers/assistants granted only assigned classroom access.',
      'Students imported, linked, and added to roster.',
      'Course, modules, lessons, objectives, resources, and homework guidance published to a real classroom.',
      'Teacher day tested end to end: start, attendance, coverage, finish, and homework assignment.',
      'Assignments, gradebook, attendance, and schedule tested in a real classroom.',
      'Offers and Click payment flow checked.',
      'Messages, announcements, alerts, guardian permissions, and parent reports tested.',
      'Academy Telegram staff account linked and /today tested from @schoodacademybot.',
      'Student route smoke-tested with a real student account.',
    ],
    footer: 'Schood Academy docs are operational documentation. Keep them close to the product and update them whenever routes, roles, payments, or LMS workflows change.',
  },
  uz: {
    langName: 'O‘zbekcha',
    shortName: 'UZ',
    eyebrow: 'Schood Academy bo‘yicha amaliy qo‘llanma',
    title: 'Markazni boshqaring. Har bir o‘quvchini qo‘llab-quvvatlang.',
    subtitle:
      'Markaz jamoasi, ustoz, o‘quvchi va oilalar uchun amaliy yordam: ilk daraja aniqlashdan dars, uy vazifasi, imtihon, to‘lov va o‘quv rivojini ko‘rib chiqishgacha.',
    primaryCta: 'Academy ni ochish',
    secondaryCta: 'Rolingizdan boshlang',
    updated: '2026-yil 2-sentabrda yangilangan · uch tilda baholash yo‘riqnomasi va yordam',
    currentLabel: 'Amaldagi xizmat qo‘llanmasi',
    searchLabel: 'Jarayonni topish',
    searchPlaceholder: 'O‘qituvchi, davomat, Telegram…',
    noResults: 'Bu qidiruvga mos qo‘llanma bo‘limi topilmadi.',
    quickStartEyebrow: 'Rol bo‘yicha qo‘llanma',
    quickStartTitle: 'Bajarmoqchi bo‘lgan ishingizdan boshlang',
    quickStartSubtitle: 'Rolingizni tanlang. Har bir ish joyi keraksiz boshqaruv elementlari va begona talaba ma’lumotlarini yashiradi.',
    quickStarts: [
      { audience: 'Ega yoki admin', title: 'Academyni sozlash va boshqarish', text: 'Brend, xodimlar kirishi, sinflar, o‘quv dasturi, moliya, hisobot va boshqaruv.', href: '#create', action: 'Sozlash qo‘llanmasi' },
      { audience: 'Markaz jamoasi', title: 'Kundalik ishlarni yuritish', text: 'Kontaktlar, qabul, jadval, xizmat so‘rovlari, to‘lov, ogohlantirish va ota-onalar bilan aloqa.', href: '#education-os', action: 'Operatsiyalar qo‘llanmasi' },
      { audience: 'O‘qituvchi yoki assistent', title: 'Bugungi darsni o‘tish', text: 'Biriktirilgan darsni oching, davomat qiling, dastur bo‘yicha o‘ting, yakunlang va vazifa bering.', href: '#teacher-day', action: 'O‘qituvchi qo‘llanmasi' },
      { audience: 'Telegram xodimlar ilovasi', title: 'Telefondan ishlash', text: 'Bugungi darslar, davomat, uy vazifasi, e’lonlar va so‘rovlar uchun Academy botidan foydalaning.', href: '#telegram', action: 'Telegram qo‘llanmasi' },
      { audience: 'Qabul yoki imtihon jamoasi', title: 'Birinchi baholashni o‘tkazish', text: 'Topshiriq tayyorlang, ishtirokchilarni kutib oling, ishlarini tekshiring va foydali keyingi qadamlarni ulashing.', href: '#assessment-operations', action: 'Baholash qo‘llanmasi' },
      { audience: 'O‘quvchi yoki talabgor', title: 'Test topshirish va xulosani topish', text: 'Kiring, kelishingizni tasdiqlating, javoblarni saqlab topshiring va tekshirilgan natijani tushuning.', href: '#assessment-learner', action: 'O‘quvchi qo‘llanmasi' },
    ],
    teacherSignalTitle: 'IELTS 6.5 · A17 guruhi',
    teacherSignalEyebrow: 'O‘qituvchi kuni',
    teacherSignalAria: 'O‘qituvchining dars jarayoni',
    teacherSignalMeta: '18:00–19:30 · 12-xona · 17 talaba',
    teacherSignalSteps: ['Darsni boshlash', 'Davomat', 'Dastur bo‘yicha o‘tish', 'Yakunlash va berish'],
    routesTitle: 'Ish joylari yo‘nalishlari',
    operatingTitle: 'Ish modeli',
    operatingSubtitle:
      'Mahsulotni egalikdan o‘qishgacha tartiblang: Center Office biznes qatlami, Academy LMS tenant, classroom esa kundalik dars joyi.',
    rolesTitle: 'Rollar va ruxsatlar jadvali',
    checklistTitle: 'Ishga tushirish ro‘yxati',
    sectionEyebrow: 'Akademiya amaliyotlari',
    rolesEyebrow: 'Kirish huquqlari',
    checklistEyebrow: 'Ishga tushirish',
    navTitle: 'Sahifa bo‘limlari',
    docsLabel: 'Academy hujjatlari',
    appLabel: 'academy.schood.online',
    canLabel: 'Qila oladi',
    cannotLabel: 'Qila olmaydi',
    routeRows: [
      { route: '/academies', label: 'Ish joyini tanlash', text: 'Kirishdan keyingi xavfsiz boshlanish nuqtasi. Faqat akkauntga bog‘langan academiyalar va rollar ko‘rinadi.' },
      { route: '/academy/admin', label: 'Ega va admin', text: 'Academy sozlamalari, xodim grantlari, moliya, offerlar, branding, hisobotlar va Education OS.' },
      { route: '/academy/center', label: 'Markaz admini', text: 'Markazga tegishli academylarni kuzatish, xodimlar, moliya, jadval va umumiy operatsiyalar.' },
      { route: '/academy/office', label: 'Menejer yoki counselor', text: 'Kontaktlar, roster, sinflar, jadval, xabarlar, alertlar va operatsion kuzatuv.' },
      { route: '/academy/teacher', label: 'O‘qituvchi yoki assistent', text: 'Biriktirilgan darslar, o‘quv dasturi, davomat, uy vazifasi, sinflar va talabalar bilan ishlash uchun alohida o‘qituvchi ofisi.' },
      { route: '/academy/student', label: 'Talaba', text: 'Sinf lentasi, e’lonlar, topshiriqlar, topshirish, progress, alertlar va to‘lov elementlari.' },
      { route: '/academy/parent', label: 'Ota-ona yoki vasiy', text: 'Rozilik asosida bog‘langan talabaning davomati, baholari, vazifalari, jadvali, xabarlari, hisobotlari va ruxsat berilgan moliyaviy ma’lumotlari.' },
      { route: '/telegram', label: 'Academy Telegram xodimlar ilovasi', text: '@schoodacademybot orqali ochiladigan, rolga mos mobil ish joyi. Ma’lumot yuklanishidan oldin Telegram shaxsi va Academy ruxsati tekshiriladi.' },
    ],
    flowRows: [
      { layer: '1', path: '/center-office', label: 'Center Office', text: 'Markaz uchun biznes qatlami: profil, xodimlar, bog‘langan academylar, hamkorlik sozlamalari, voucher, wallet va umumiy hisobotlar.' },
      { layer: '2', path: '/academy/admin yoki /academy/center', label: 'Academy boshqaruvi', text: 'Bitta academy tenant: branding, rollar, offerlar, Click to‘lovlari, staff grantlar, jadval, sinflar va hisobotlar.' },
      { layer: '3', path: '/academy/office', label: 'Academy office', text: 'Menejer va counselor uchun kundalik operatsiya: kontaktlar, roster, xabarlar, alertlar, jadval bo‘shliqlari va student follow-up.' },
      { layer: '4', path: '/academy/teacher', label: 'Teacher workspace', text: 'Sinfdagi dars jarayoni: topshiriqlar, resurslar, gradebook, davomat sessiyalari, classroom xabarlari va feedback.' },
      { layer: '5', path: '/academy/student', label: 'Student workspace', text: 'Talaba uchun tor va aniq o‘quv joyi: sinflar, e’lonlar, topshiriqlar, topshirish, progress, davomat va to‘lovlar.' },
    ],
    roleRows: [
      { role: 'Owner / admin', scope: 'Butun academy', can: 'Xodimlar, branding, moliya, offerlar, jadval, LMS, hisobotlar, sertifikatlar va avtomatizatsiyalarni boshqaradi.', cannot: 'Agar o‘zi dars bermasa, kundalik o‘qituvchi akkaunti sifatida ishlatilmasligi kerak.' },
      { role: 'Center admin', scope: 'Markazga tegishli academies', can: 'Bog‘langan academylar, xodimlar, moliya, offerlar, kontaktlar, jadval va xabarlarni boshqaradi.', cannot: 'Alohida teaching role berilmasa, o‘qituvchiga xos baholash yo‘liga kirmaydi.' },
      { role: 'Manager / counselor', scope: 'Academy operatsiyasi', can: 'Kontaktlar, sinflar, roster, jadval, xabarlar, alertlar va Education OS actionlarini yuritadi.', cannot: 'Moliya, offerlar, xodim grantlari, sertifikatlar yoki o‘qituvchi baholashini boshqarmaydi.' },
      { role: 'Teacher / assistant', scope: 'Biriktirilgan sinflar', can: 'Topshiriq yaratadi, ishlarni baholaydi, davomat belgilaydi, resurslar, jadval va xabarlarni yuritadi.', cannot: 'Moliya, offerlar, staff grantlar, global admin sozlamalari yoki boshqa sinflarni ko‘rmaydi.' },
      { role: 'Student', scope: 'O‘z sinflari', can: 'Darslar, xabarlar, e’lonlar, topshiriqlar, progress, davomat, alertlar va to‘lovlarini ko‘radi.', cannot: 'Office, staff, roster, moliya yoki boshqa talabalarning ma’lumotlariga kira olmaydi.' },
    ],
    sections: [
      ...assessmentGuides.uz,
      {
        id: 'model',
        title: '0. Xizmat modelini tartibga solish',
        intro:
          'Academy ni bir nechta dashboard sifatida emas, mas’uliyat zanjiri sifatida tuzing: markaz biznes egaligi, academy operatsiyasi, classroom delivery va student learning.',
        steps: [
          'Center Office faqat markaz-level biznes konteyner uchun ishlatiladi: profil, xodimlar, bog‘langan academylar, hamkorlik sozlamalari, wallet, voucher va academylar bo‘yicha umumiy ko‘rinish.',
          'Mustaqil academy egasi uchun /academy/admin ishlating; markaz admini bog‘langan academyni yuritsa /academy/center ishlating.',
          'Kundalik operatsiyani yuritadigan, lekin finance yoki staff-grant huquqi bo‘lmagan menejer va counselorlar uchun /academy/office ishlating.',
          'Biriktirilgan sinf ishi uchun /academy/teacher ishlating. O‘qituvchi dars berish, baholash, davomat belgilash yoki resurs chiqarish uchun admin access olmasligi kerak.',
          'Talaba uchun /academy/student tor va xavfsiz workspace bo‘lib qoladi. Talaba office, staff, roster admin yoki finance control ko‘rmasligi kerak.',
        ],
        tips: [
          'Sign-in dan keyin foydalanuvchini uning granti qo‘llaydigan birinchi workspacega olib boring; barcha product surfacelarni birdan ko‘rsatmang.',
          'Bir odamda bir nechta vazifa bo‘lsa, rollarni aniq grant qiling va har bir ishni o‘z route lane ichida saqlang.',
        ],
      },
      {
        id: 'create',
        title: '1. Academy yaratish',
        intro:
          'Academy - bu alohida o‘quv operatsiyasi uchun tenant. Alohida talabalar, sinflar, xodimlar, offerlar va hisobotlar kerak bo‘lgan har bir maktab, filial yoki markaz bo‘limi uchun bitta academy yarating.',
        steps: [
          'Owner yoki admin akkaunti bilan kiring va Academy ni oching.',
          'Create academy ni tanlang, ko‘rinadigan nom kiriting va atlas-ielts yoki t1-academy kabi tushunarli slug yozing.',
          'Academy admin yo‘nalishida ochilganini tekshiring. Yaratgan foydalanuvchi avtomatik owner bo‘ladi.',
          'Brandingni erta sozlang: logo, ko‘rinadigan nom, ranglar, footer va ommaviy matn.',
          'O‘qituvchilarni taklif qilishdan oldin kamida bitta classroom yarating, chunki teacher va assistant grantlari sinf scope talab qiladi.',
        ],
        tips: [
          'Bitta real operatsion birlik uchun bitta academy ishlating. Hisobot va to‘lovlar alohida bo‘lishi shart bo‘lmasa, bitta sinfni bir nechta academyga bo‘lmang.',
          'Agar academy partner markazga tegishli bo‘lsa, uni Center Office orqali yarating.',
        ],
      },
      {
        id: 'role-grants',
        title: '2. Rollarni ehtiyotkorlik bilan bering',
        intro:
          'Kirish role grant orqali beriladi. Grantda email, rol, scope, status, ixtiyoriy expiry va audit tarixi bo‘ladi. Kim qaysi workspacega kirishini shu belgilaydi.',
        steps: [
          'Admin yoki center workspace ichida Role grants ni oching.',
          'Foydalanuvchi Schoodga kirishda ishlatadigan emailni aynan kiriting.',
          'Rol tanlang. Admin va center_adminni kam ishlating; operatsiya uchun manager/counselor, dars uchun teacher/assistant bering.',
          'Teacher va assistant uchun aniq qaysi sinflar biriktirilishini belgilang.',
          'Yangi odam uchun statusni invited qiling, ichki foydalanuvchi tayyor bo‘lsa active qiling, vaqtincha to‘xtatish uchun suspended qiling.',
          'Hamkorlik tugasa Revoke qiling. Revoke tarixni saqlaydi; access yozuvini o‘chirib yuborishdan yaxshiroq.',
        ],
        tips: [
          'Invited grant foydalanuvchi shu email bilan kirganda active bo‘ladi.',
          'Expiry vaqtinchalik o‘qituvchi, assistent, mavsumiy counselor yoki contractor uchun qulay.',
        ],
      },
      {
        id: 'classrooms',
        title: '3. Sinflar va roster',
        intro:
          'Classroom Academy ning asosiy ish nuqtasi. U talabalar, xodimlar, topshiriqlar, davomat, jadval, xabarlar va hisobotlarni bog‘laydi.',
        steps: [
          'Xodim va talaba darhol tushunadigan nom tanlang: IELTS B2 Morning yoki SAT Math Weekend kabi.',
          'Agar sinf talabaga ko‘rinishi kerak bo‘lsa placement level, tavsif, public status va sozlamalarni to‘ldiring.',
          'Kontaktlarni yarating yoki import qiling, keyin ularni sinf rosteriga student yoki observer sifatida qo‘shing.',
          'Ketgan talabani contact ichida saqlab qolish mumkin, lekin active classroom rosterdan olib tashlang.',
          'Yangi cohort birdan kirsa bulk invite ishlating.',
        ],
        tips: [
          'Roster sifati barcha LMS hisobotlariga ta’sir qiladi. Talaba gradebook yoki attendance ichida ko‘rinmasa, avval classroom membershipni tekshiring.',
          'Menejer roster bilan ishlaydi; o‘qituvchi odatda faqat biriktirilgan classroom doirasida ishlashi kerak.',
        ],
      },
      {
        id: 'curriculum',
        title: '4. O‘quv dasturi va baholashlarni yaratish',
        intro:
          'Avval dars rejasini, keyin jadvalni yarating. Kurs modullar va ketma-ket darslardan iborat; har bir darsda maqsadlar, resurslar, taxminiy vaqt, uy vazifasi va baholash bo‘lishi mumkin.',
        steps: [
          'Kurs yarating, modullarni qo‘shing va darslarni o‘qituvchi o‘tishi kerak bo‘lgan tartibda joylang.',
          'Har bir dars uchun aniq natija, davomiylik, o‘qituvchi izohi, resurs va uy vazifasi yo‘riqnomasini kiriting.',
          'O‘qituvchi kuni kerakli darsni avtomatik biriktirishi uchun kursni tegishli sinfga e’lon qiling.',
          'O‘tish bali, urinishlar soni, vaqt cheklovi va savollari bor ichki test yarating yoki o‘qituvchi baholaydigan ishlar uchun baho toifalari va mezonlarini sozlang.',
          'O‘quv dasturi va baholash dalillaridan talaba, ota-ona va operatsion hisobotlarda foydalaning.',
        ],
        tips: [
          'Jadvaldagi dars o‘quv dasturiga bog‘lanmasa ham o‘tadi, ammo o‘qituvchiga tayyor dars tajribasi to‘liq berilmaydi.',
          'Darslar ketma-ketligi uchun bitta manba saqlang; rejani chat va jadvallarga qayta ko‘chirmang.',
        ],
      },
      {
        id: 'teacher-day',
        title: '5. O‘qituvchining dars kunini yuritish',
        intro:
          'Alohida O‘qituvchi ish joyi biriktirilgan sessiyani bitta izchil jarayonga aylantiradi: darsni ochish, biriktirilgan dastur bo‘yicha o‘tish, davomatni saqlash, qamrovni belgilash, yakunlash va uy vazifasini berish.',
        steps: [
          '/academy/teacher ni oching. Bugun bo‘limida faqat o‘qituvchi yoki assistent doirasidagi sessiyalar ko‘rinadi.',
          'Sessiyani tanlab vaqt, xona yoki format, ro‘yxat, dars mavzusi, maqsadlar, resurslar va tayyor uy vazifasini tekshiring.',
          'Darsni boshlashni tanlang. Jarayon faol holatga o‘tadi va sahifa yangilangandan yoki Telegram ilovasidan ochilganda davom etadi.',
          'Har bir talabani keldi, kechikdi, kelmadi yoki sababli deb belgilang va darsni tugatishdan oldin davomatni saqlang.',
          'O‘tilgan maqsadlarni belgilang, uy vazifasi va muddatini tahrirlang, kerak bo‘lsa izoh yozing, so‘ng Darsni yakunlash va vazifa berishni tanlang.',
        ],
        tips: [
          'Darsni boshlash, davomat va yakunlash takroriy yuborishdan himoyalangan. Tarmoq uzilsa yangi yozuv yaratish o‘rniga qayta urinib ko‘ring.',
          'Dars ko‘rinmasa admin huquqini emas, sanali sessiya, asosiy o‘qituvchi, sinf doirasi va e’lon qilingan dastur bog‘lanishini tekshiring.',
        ],
      },
      {
        id: 'lms',
        title: '6. Topshiriq, baholash va resurslar',
        intro:
          'Academy endi faqat Education OS dashboard emas, haqiqiy LMS yo‘lagi. O‘qituvchi va assistent admin accesssiz ham class ishini yurita olishi kerak.',
        steps: [
          'Assignments: classroom tanlang, topshiriq yarating, due date, max score, weight, status va instruktsiyani kiriting.',
          'Student submissions: talaba o‘z classroomiga kiradi, matn yoki link topshiradi va statusni kuzatadi.',
          'Gradebook: assignment va talabani tanlang, score, max score va feedback yozing.',
          'Attendance: session date tanlang, har bir talabani present, late, absent yoki excused qilib belgilang.',
          'Resources: link yoki materiallarni to‘g‘ri classroomga publish qiling.',
        ],
        tips: [
          'Jiddiy programmalarda score weight ishlating. Mock exam uy vazifasidan ko‘proq ta’sir qilishi mumkin.',
          'Baholar va davomat progress report, risk detection, certificate va parent reportlarga kiradi.',
        ],
      },
      {
        id: 'schedule',
        title: '7. Jadvalni boshqarish',
        intro:
          'Schedule classroom ritmini operatsion kuzatuv bilan bog‘laydi. Admin, center admin, manager, counselor, teacher va assistant uni o‘z scope doirasida ishlatadi.',
        steps: [
          'Classroomni oching va haftalik slot qo‘shing: kun, start time, optional end time, timezone va label.',
          'Labelni aniq yozing: Speaking lab, Mock review yoki Grammar workshop.',
          'Cohort boshlanishidan oldin Education OS ichidagi schedule gaplarni tekshiring.',
          'Cohort tugasa yoki vaqt o‘zgarsa eski slotlarni olib tashlang.',
        ],
        tips: [
          'Bitta cohort ichida bitta timezone ishlating. Turli timezone aralashsa davomat chalkashadi.',
          'Teacher o‘z sinfi jadvalini boshqarishi mumkin, lekin finance va staff sozlamalari uning yo‘lagi emas.',
        ],
      },
      {
        id: 'payments',
        title: '8. Offerlar va Click to‘lovlari',
        intro:
          'Academy to‘lovlari faqat Click orqali ishlaydi. Academy uchun TSPay sozlamang. Offer nima sotilishini, payment settlementni, grant/entitlement esa talaba nimaga access olishini bildiradi.',
        steps: [
          'Tuition, course package, mock exam yoki classroom access uchun offer yarating.',
          'To‘lovdan keyin kerakli access yaratilishi uchun offerga grant bog‘lang.',
          'Talaba qarzdor bo‘lsa office ichida payment record yarating.',
          'Yoqilgan joyda Click pay-by-card yoki Click invoice flowdan foydalaning.',
          'Manual settlementni faqat pul tashqi kanal orqali tasdiqlanganda belgilang.',
        ],
        tips: [
          'Manager va teacher finance ko‘rmasligi kerak. To‘lov ishlarini owner/admin yoki center_admin yo‘lagida qoldiring.',
          'Payment status noto‘g‘ri ko‘rinsa, Academy recordni o‘zgartirishdan oldin Click transaction statusni tekshiring.',
        ],
      },
      {
        id: 'messages',
        title: '9. Xabarlarni aniq yuborish',
        intro:
          'Academy kommunikatsiyasi uch darajada: direct messages, announcements va alerts. Kerakli odamga yetadigan eng kichik darajani tanlang.',
        steps: [
          'Individual follow-up uchun direct message ishlating.',
          'Dars eslatmasi, homework yoki schedule o‘zgarishi uchun classroom announcement yuboring.',
          'Butun academy uchun muhim operatsion xabar bo‘lsa global announcement ishlating.',
          'Risk, payment follow-up, attendance muammosi yoki urgent support uchun alert yarating.',
          'Alertni faqat ish haqiqatdan yakunlanganda resolve qiling.',
        ],
        tips: [
          'Teacher o‘z sinfi scope ichida xabar yuboradi. Manager esa operatsion yozuvlar bo‘yicha koordinatsiya qiladi.',
          'Announcement qisqa va actionga yo‘naltirilgan bo‘lsin. Talaba uni learning flow ichida o‘qiydi.',
        ],
      },
      {
        id: 'telegram',
        title: '10. Academy Telegram xodimlar ilovasidan foydalanish',
        intro:
          'Academy boti alohida ma’lumotlar bazasi yoki nazoratsiz guruh chat emas. U shu rolga mos ishlarni telefonda ochadi. Xodim @schoodacademybot orqali kiradi, Schood akkauntini bog‘laydi va ruxsat berilgan amallarni Mini App ichida bajaradi.',
        steps: [
          '@schoodacademybot ni oching va Academy yaratgan bir martalik xodim havolasidan foydalaning. Ish joyi ochilishidan oldin Telegram shaxsi va faol Academy roli tekshiriladi.',
          '/today buyrug‘i keyingi biriktirilgan darsni ko‘rsatadi. O‘qituvchi Mini App ichida darsni boshlaydi yoki davom ettiradi, davomat qiladi, dasturga qaraydi va uy vazifasi bilan yakunlaydi.',
          'Mos ruxsatdagi amalni ochish uchun /announce, /homework, /attendance, /requests, /groups yoki /settings buyruqlaridan foydalaning.',
          'Academy admini Telegram operatsiyalarini yoqishi va xodim, sinf yoki ota-onalar guruhini o‘n daqiqalik bir martalik havola bilan ulashi kerak.',
          'BotFather ichida guruh maxfiyligi yoqilgan bo‘lsin. Bot faqat aniq buyruq va tasdiqlangan amallarga javob beradi; oddiy guruh suhbatlarini o‘qimaydi.',
        ],
        tips: [
          'Shaxsiy ogohlantirish, baho, to‘lov va individual davomat muammosi faqat shaxsiy kanalda yuboriladi. Guruh xabari faqat guruh uchun xavfsiz ma’lumotni oladi.',
          'Mini App Telegram sessiyasi tugaganini aytsa, uni yoping va botdan qayta oching. Bog‘lash so‘ralsa, Academy ichidan yangi xodim havolasi yarating.',
        ],
      },
      {
        id: 'education-os',
        title: '11. Education OS ni to‘g‘ri ishlatish',
        intro:
          'Education OS - command layer. U queue, risk, schedule gap, lifecycle, report va automationni ko‘rsatadi. Lekin kundalik mahsulotning yadrosi assignment, grading, attendance va schedule.',
        steps: [
          'Kunni Today bo‘limidan boshlang: ochiq actionlar va urgent class muammolarini ko‘ring.',
          'Pipeline orqali lead, placement, enrolled, learning, attention, renewal va completion bosqichlarini kuzating.',
          'Intelligence ichida risk, backlog va operatsion gaplarni tekshiring.',
          'Commandni faqat finance, report, notification yoki automation ruxsati bor rollar ishlatsin.',
          'Teacher ishini Learning va Attendance ichida saqlang, agar unga boshqa rol berilmagan bo‘lsa.',
        ],
        tips: [
          'Control noto‘g‘ri route ichida ko‘rinsa, bu role-lane bug. Yangi UI qo‘shishdan oldin matrixni tuzating.',
          'Education OS odamga keyingi qadamni tanlashga yordam beradi; LMS jarayonlarini almashtirmaydi.',
        ],
      },
      {
        id: 'students',
        title: '12. Talaba tajribasi',
        intro:
          'Talaba admin productga emas, aniq learning spacega kirayotganini his qilishi kerak. Student workspace ataylab tor va xavfsiz qilingan.',
        steps: [
          'Talaba sign in qiladi va /academy/student ni ochadi.',
          'U academies, classrooms, announcements, alerts, assignments, attendance, progress va tuition itemsni ko‘radi.',
          'Assignment ichida taskni ochadi, matn yoki link topshiradi, keyin feedback yoki score ko‘radi.',
          'Learning savollari yoki support uchun classroom messages ishlatadi.',
          'Agar class ko‘rinmasa, contact email, linked user, classroom membership va active grant/entitlementni tekshiring.',
        ],
        tips: [
          'Troubleshooting uchun talabaga staff role bermang. Roster yoki linked user yozuvini tuzating.',
          'Student screen office routes, staff, payment admin yoki boshqa talabalar ma’lumotini ko‘rsatmasligi kerak.',
        ],
      },
      {
        id: 'guardians',
        title: '13. Oilaga boshqariladigan ko‘rinish berish',
        intro:
          'Ota-ona portali aniq talaba–vasiy munosabatiga tayanadi. Oila ma’lumotni ko‘rishidan oldin Academy xodimi ruxsat toifalarini tanlaydi, rozilikni qayd etadi va xavfsiz Telegram bog‘lanishini ishlatadi.',
        steps: [
          'Talaba yozuvidan vasiyning ismi, qarindoshlik turi, aloqa ma’lumoti, tili va mas’uliyat belgilarini kiriting.',
          'Ko‘rishga ruxsat etiladigan toifalarni tanlang: holat, davomat, baho, uy vazifasi, jadval, to‘lov, qarz, xabar, taraqqiyot hisoboti, resurs va e’lon.',
          'Taklif yoki Telegram havolasi yuborishdan oldin rozilikni qayd eting va munosabatni faollashtiring.',
          'Vasiy /academy/parent ni ochadi va faqat bog‘langan talaba hamda ruxsat berilgan bo‘limlarni ko‘radi.',
          'Vasiylik, homiylik, rozilik yoki aloqa mas’uliyati o‘zgarsa ruxsatni toraytiring yoki bekor qiling.',
        ],
        tips: [
          'Qisqa yo‘l sifatida ota-onaga talaba yoki xodim akkaunti bermang. Vasiy munosabati kirishni rozilikli, cheklangan va tekshiriladigan qiladi.',
          'To‘lov va qarz alohida ruxsatdir; ular akademik taraqqiyot bilan avtomatik ochilmaydi.',
        ],
      },
      {
        id: 'operations',
        title: '14. Production operatsiyasi va muammoni aniqlash',
        intro:
          'Schoodda production yagona muhit. O‘zgarishlar ehtiyotkor, testdan o‘tgan va role-aware bo‘lishi kerak. Academy operator muammo bo‘lsa qayerdan qarashni bilishi muhim.',
        steps: [
          'Production behavior o‘zgarishidan oldin qaysi route va rol ta’sirlanishini aniqlang: admin, center, office, teacher yoki student.',
          'Access yo‘qolsa grant status, email imlosi, expiry, classroom scope va foydalanuvchi sign in qilganini tekshiring.',
          'LMS data ko‘rinmasa classroom ID, roster membership, assignment status va route permissionni tekshiring.',
          'To‘lovlarda esda tuting: Academy faqat Click ishlatadi.',
          'Schema yoki Edge Function o‘zgarsa, frontend PR merge bo‘lgandan keyin Supabase migration va functionni qo‘lda deploy qiling.',
        ],
        tips: [
          'Main ga to‘g‘ridan-to‘g‘ri push qilmang. PR oching, CI kuting, merge qiling, production deployni kuzating, keyin Supabase follow-up bajaring.',
          'Shubha bo‘lsa, accessni kamaytiring. Keng admin accessdan ko‘ra scoped grant berish xavfsizroq.',
        ],
      },
    ],
    checklist: [
      'Academy nomi va slug aniq yaratilgan.',
      'Branding, logo, public copy va ranglar tekshirilgan.',
      'Kamida bitta classroom active.',
      'Owner/admin access tasdiqlangan.',
      'Manager/counselor operatsion access olgan.',
      'Teacher/assistant faqat o‘z classroomlariga grant olgan.',
      'Talabalar import qilingan, linked va rosterga qo‘shilgan.',
      'Kurs, modul, dars, maqsad, resurs va uy vazifasi yo‘riqnomasi real sinfga e’lon qilingan.',
      'O‘qituvchi kuni boshidan oxirigacha tekshirilgan: boshlash, davomat, qamrov, yakunlash va uy vazifasi.',
      'Assignments, gradebook, attendance va schedule real classroomda test qilingan.',
      'Offerlar va Click payment flow tekshirilgan.',
      'Xabarlar, e’lonlar, ogohlantirishlar, vasiy ruxsatlari va ota-ona hisobotlari tekshirilgan.',
      'Academy Telegram xodim akkaunti bog‘langan va @schoodacademybot ichida /today tekshirilgan.',
      'Student route real student akkaunt bilan smoke-test qilingan.',
    ],
    footer: 'Schood Academy hujjatlari amaliy operatsion hujjatdir. Route, rol, to‘lov yoki LMS jarayoni o‘zgarsa, uni ham yangilang.',
  },
  ru: {
    langName: 'Русский',
    shortName: 'RU',
    eyebrow: 'Практическая документация Schood Academy',
    title: 'Управляйте центром. Поддерживайте каждого ученика.',
    subtitle:
      'Практическая помощь команде центра, преподавателям, ученикам и семьям: от первого определения уровня до уроков, домашних заданий, экзаменов, платежей и обсуждения прогресса.',
    primaryCta: 'Открыть Academy',
    secondaryCta: 'Начать со своей роли',
    updated: 'Обновлено 2 сентября 2026 года · инструкции и помощь по тестированию на трёх языках',
    currentLabel: 'Руководство по действующему сервису',
    searchLabel: 'Найти рабочий процесс',
    searchPlaceholder: 'Преподаватель, посещаемость, Telegram…',
    noResults: 'Разделов, соответствующих этому запросу, не найдено.',
    quickStartEyebrow: 'Руководство по ролям',
    quickStartTitle: 'Начните с задачи, которую нужно выполнить',
    quickStartSubtitle: 'Выберите свою роль. Каждый маршрут скрывает лишние элементы управления и данные других студентов.',
    quickStarts: [
      { audience: 'Владелец или администратор', title: 'Настроить Academy и управление', text: 'Бренд, доступ сотрудников, классы, учебная программа, финансы, отчеты и контроль операций.', href: '#create', action: 'Открыть настройку' },
      { audience: 'Команда центра', title: 'Вести ежедневные операции', text: 'Контакты, зачисление, расписание, сервисные запросы, платежи, риски и работа с семьями.', href: '#education-os', action: 'Открыть операции' },
      { audience: 'Преподаватель или ассистент', title: 'Провести сегодняшний урок', text: 'Открыть назначенное занятие, отметить посещаемость, пройти программу, завершить и выдать домашнюю работу.', href: '#teacher-day', action: 'Открыть руководство' },
      { audience: 'Telegram-приложение для сотрудников', title: 'Работать с телефона', text: 'Использовать Academy-бота для занятий, посещаемости, домашней работы, объявлений и запросов.', href: '#telegram', action: 'Открыть Telegram' },
      { audience: 'Команда приёма или экзамена', title: 'Провести первое тестирование', text: 'Подготовить задания, встретить участников, проверить работы и поделиться следующими шагами.', href: '#assessment-operations', action: 'Открыть тестирование' },
      { audience: 'Ученик или поступающий', title: 'Пройти тест и найти отчёт', text: 'Войти, подтвердить прибытие, сохранить и отправить ответы, разобраться в проверенном результате.', href: '#assessment-learner', action: 'Руководство ученика' },
    ],
    teacherSignalTitle: 'IELTS 6.5 · Группа A17',
    teacherSignalEyebrow: 'День преподавателя',
    teacherSignalAria: 'Рабочий процесс урока преподавателя',
    teacherSignalMeta: '18:00–19:30 · Кабинет 12 · 17 студентов',
    teacherSignalSteps: ['Начать урок', 'Посещаемость', 'Пройти программу', 'Завершить и выдать'],
    routesTitle: 'Рабочие маршруты',
    operatingTitle: 'Операционная модель',
    operatingSubtitle:
      'Выстраивайте продукт от владения к обучению: Center Office - бизнес-уровень, Academy - LMS tenant, classroom - место ежедневного обучения.',
    rolesTitle: 'Матрица ролей и доступа',
    checklistTitle: 'Чек-лист запуска',
    sectionEyebrow: 'Работа академии',
    rolesEyebrow: 'Права доступа',
    checklistEyebrow: 'Запуск',
    navTitle: 'На этой странице',
    docsLabel: 'Документация Academy',
    appLabel: 'academy.schood.online',
    canLabel: 'Может',
    cannotLabel: 'Не может',
    routeRows: [
      { route: '/academies', label: 'Выбор рабочего пространства', text: 'Безопасная точка входа после авторизации. Показывает только связанные с аккаунтом academies и роли.' },
      { route: '/academy/admin', label: 'Владелец и администратор', text: 'Полное управление academy: staff grants, финансы, offers, branding, отчеты и Education OS.' },
      { route: '/academy/center', label: 'Администратор центра', text: 'Контроль academy, принадлежащих центру: сотрудники, финансы, расписание и общие операции.' },
      { route: '/academy/office', label: 'Менеджер или counselor', text: 'Контакты, roster, классы, расписание, сообщения, alerts и операционное сопровождение.' },
      { route: '/academy/teacher', label: 'Преподаватель или ассистент', text: 'Отдельный кабинет преподавателя: назначенные занятия, учебная программа, посещаемость, домашняя работа, классы и сопровождение студентов.' },
      { route: '/academy/student', label: 'Студент', text: 'Лента класса, объявления, задания, отправка работ, прогресс, alerts и элементы оплаты.' },
      { route: '/academy/parent', label: 'Родитель или опекун', text: 'Доступ по согласию к посещаемости, оценкам, домашним заданиям, расписанию, сообщениям, отчетам и разрешенным финансовым данным связанного студента.' },
      { route: '/telegram', label: 'Telegram-приложение Academy для сотрудников', text: 'Мобильное рабочее пространство по роли, открываемое через @schoodacademybot. Перед загрузкой проверяются личность Telegram и доступ к Academy.' },
    ],
    flowRows: [
      { layer: '1', path: '/center-office', label: 'Center Office', text: 'Бизнес-уровень центра: профиль, сотрудники, связанные academies, партнерские настройки, vouchers, wallet и общая отчетность.' },
      { layer: '2', path: '/academy/admin или /academy/center', label: 'Управление Academy', text: 'Один academy tenant: branding, роли, offers, платежи Click, staff grants, расписание, классы и отчеты.' },
      { layer: '3', path: '/academy/office', label: 'Academy office', text: 'Ежедневные операции для менеджеров и counselors: контакты, roster, сообщения, alerts, пробелы в расписании и follow-up студентов.' },
      { layer: '4', path: '/academy/teacher', label: 'Teacher workspace', text: 'Проведение занятий: assignments, ресурсы, gradebook, attendance sessions, classroom messages и feedback.' },
      { layer: '5', path: '/academy/student', label: 'Student workspace', text: 'Узкое учебное пространство: свои классы, объявления, задания, отправка работ, прогресс, посещаемость и платежи.' },
    ],
    roleRows: [
      { role: 'Owner / admin', scope: 'Вся academy', can: 'Управляет сотрудниками, branding, финансами, offers, расписанием, LMS, отчетами, сертификатами и automation.', cannot: 'Не должен использоваться как ежедневный аккаунт преподавателя, если человек реально не ведет занятия.' },
      { role: 'Center admin', scope: 'Academies центра', can: 'Управляет связанными academies, сотрудниками, финансами, offers, контактами, расписанием и сообщениями.', cannot: 'Не входит в преподавательские зоны оценивания без отдельной teaching role.' },
      { role: 'Manager / counselor', scope: 'Операции academy', can: 'Ведет контакты, классы, roster, расписание, сообщения, alerts и действия Education OS.', cannot: 'Не управляет финансами, offers, staff grants, сертификатами и оцениванием преподавателя.' },
      { role: 'Teacher / assistant', scope: 'Назначенные классы', can: 'Создает задания, оценивает работы, отмечает посещаемость, ведет ресурсы, расписание и сообщения.', cannot: 'Не видит финансы, offers, staff grants, глобальные настройки и чужие классы.' },
      { role: 'Student', scope: 'Свои классы', can: 'Видит уроки, сообщения, объявления, задания, прогресс, посещаемость, alerts и платежи.', cannot: 'Не имеет доступа к office, staff, roster, финансам и данным других студентов.' },
    ],
    sections: [
      ...assessmentGuides.ru,
      {
        id: 'model',
        title: '0. Организация модели сервиса',
        intro:
          'Не организуйте Academy как набор dashboards. Организуйте ее как цепочку ответственности: бизнес-владение центра, операции academy, проведение занятий и обучение студента.',
        steps: [
          'Используйте Center Office только как бизнес-контейнер центра: профиль, сотрудники, связанные academies, партнерские настройки, wallet, vouchers и обзор по academies.',
          'Для владельца отдельной academy используйте /academy/admin; для администратора центра, который управляет связанной academy, используйте /academy/center.',
          'Для менеджеров и counselors, которые ведут ежедневные операции без доступа к finance и staff grants, используйте /academy/office.',
          'Для работы по назначенным классам используйте /academy/teacher. Преподавателю не нужен admin access, чтобы вести занятия, оценивать, отмечать посещаемость или публиковать ресурсы.',
          'Для студента оставляйте /academy/student как узкий и безопасный workspace. Студент не должен видеть office, staff, roster admin или finance controls.',
        ],
        tips: [
          'После sign-in ведите пользователя в первый workspace, который поддерживается его grant, а не показывайте все product surfaces сразу.',
          'Если один человек выполняет несколько задач, выдавайте несколько ролей осознанно и держите каждую работу в своем route lane.',
        ],
      },
      {
        id: 'create',
        title: '1. Создание academy',
        intro:
          'Academy - это tenant для одной учебной операции. Создавайте отдельную academy для школы, филиала или учебного подразделения центра, если им нужны свои студенты, классы, сотрудники, offers и отчеты.',
        steps: [
          'Войдите под owner или admin и откройте Academy.',
          'Выберите Create academy, укажите публичное имя и понятный slug, например atlas-ielts или t1-academy.',
          'Проверьте, что academy открывается через admin-маршрут. Создатель автоматически становится owner.',
          'Сразу настройте branding: логотип, отображаемое имя, цвета, footer и публичный текст.',
          'До приглашения преподавателей создайте хотя бы один classroom: роли teacher и assistant требуют classroom scope.',
        ],
        tips: [
          'Используйте одну academy для одной реальной операционной единицы. Не делите один класс на несколько academies, если отчеты и платежи не должны быть раздельными.',
          'Если academy принадлежит партнерскому центру, создавайте ее из Center Office, чтобы связь с центром записалась корректно.',
        ],
      },
      {
        id: 'role-grants',
        title: '2. Выдавайте роли осознанно',
        intro:
          'Доступ выдается через role grants. В гранте есть email, роль, scope, статус, необязательный срок действия и audit history. Это главный источник прав доступа.',
        steps: [
          'Откройте Role grants в admin или center workspace.',
          'Введите email так, как человек использует его для входа в Schood.',
          'Выберите роль. Admin и center_admin выдавайте редко; для операций используйте manager/counselor; для занятий - teacher/assistant.',
          'Для teacher и assistant выберите конкретные классы.',
          'Для нового человека поставьте invited, для уже известного внутреннего пользователя - active, для паузы доступа - suspended.',
          'Когда доступ больше не нужен, используйте Revoke. Revoke сохраняет историю и лучше удаления записей.',
        ],
        tips: [
          'Invited grant становится active, когда пользователь входит с тем же email.',
          'Expiry удобен для временных преподавателей, ассистентов, сезонных counselor и подрядчиков.',
        ],
      },
      {
        id: 'classrooms',
        title: '3. Классы и roster',
        intro:
          'Classroom - центр операционной работы Academy. Он связывает студентов, сотрудников, задания, посещаемость, расписание, сообщения и отчеты.',
        steps: [
          'Дайте классу понятное имя: IELTS B2 Morning или SAT Math Weekend.',
          'Если класс должен быть виден студентам, заполните placement level, описание, public status и настройки.',
          'Создайте или импортируйте контакты, затем добавьте их в roster класса как students или observers.',
          'Неактивных студентов можно оставить в contacts, но убрать из active classroom roster.',
          'Для нового cohort используйте bulk invite.',
        ],
        tips: [
          'Качество roster влияет на все LMS-отчеты. Если студент не виден в gradebook или attendance, сначала проверьте classroom membership.',
          'Менеджер работает с roster; преподаватель обычно работает только в назначенном classroom scope.',
        ],
      },
      {
        id: 'curriculum',
        title: '4. Учебная программа и оценивание',
        intro:
          'Сначала создайте учебный план, затем расписание. Курс состоит из модулей и последовательных уроков; урок может содержать цели, ресурсы, расчетное время, рекомендации по домашней работе и встроенное оценивание.',
        steps: [
          'Создайте курс, добавьте модули и расположите уроки в порядке, в котором преподаватель должен их проводить.',
          'Для каждого урока укажите четкий результат, продолжительность, заметки преподавателя, ресурсы и рекомендации по домашней работе.',
          'Опубликуйте курс для нужных классов, чтобы Teacher Day автоматически прикреплял правильный урок.',
          'Создайте встроенный тест с проходным баллом, числом попыток, ограничением времени и вопросами либо настройте категории оценок и рубрики для работ, проверяемых преподавателем.',
          'Используйте данные программы и оценивания в отчетах для студента, семьи и операционной команды.',
        ],
        tips: [
          'Занятие можно провести без привязанной опубликованной программы, но преподаватель не получит полный готовый комплект урока.',
          'Храните порядок уроков в одном источнике. Не копируйте один и тот же план в чаты и таблицы.',
        ],
      },
      {
        id: 'teacher-day',
        title: '5. Рабочий день преподавателя',
        intro:
          'Отдельный кабинет преподавателя превращает назначенное занятие в единый процесс: открыть урок, преподавать по прикрепленной программе, сохранить посещаемость, отметить пройденное, завершить и выдать домашнюю работу.',
        steps: [
          'Откройте /academy/teacher. Раздел Сегодня показывает только занятия в назначенной области преподавателя или ассистента.',
          'Выберите занятие и проверьте время, кабинет или формат, список студентов, урок программы, цели, ресурсы и черновик домашней работы.',
          'Нажмите Начать урок. Запуск станет активным и продолжится после обновления страницы или открытия из Telegram-приложения.',
          'Отметьте каждого студента как присутствующего, опоздавшего, отсутствующего или отсутствующего по уважительной причине и сохраните посещаемость до завершения.',
          'Отметьте пройденные цели, измените домашнюю работу и срок, при необходимости добавьте заметку, затем выберите Завершить урок и выдать.',
        ],
        tips: [
          'Запуск, посещаемость и завершение защищены от повторного создания. После сетевого сбоя повторите действие вместо создания новой записи.',
          'Если урок не виден, проверьте датированное занятие, основного преподавателя, область класса и опубликованную программу, а не права администратора.',
        ],
      },
      {
        id: 'lms',
        title: '6. Задания, оценивание и ресурсы',
        intro:
          'Academy теперь полноценная LMS-зона, а не только Education OS dashboard. Преподаватель и ассистент должны вести класс без admin access.',
        steps: [
          'Assignments: выберите classroom, создайте task, задайте due date, max score, score weight, status и инструкции.',
          'Student submissions: студент открывает свой classroom, отправляет текст или ссылку и следит за статусом.',
          'Gradebook: выберите assignment и студента, внесите score, max score и feedback notes.',
          'Attendance: выберите session date и отметьте каждого студента как present, late, absent или excused.',
          'Resources: публикуйте ссылки и материалы в правильный classroom.',
        ],
        tips: [
          'Для серьезных программ используйте score weights. Mock exam может весить больше, чем homework.',
          'Оценки и посещаемость питают progress reports, risk detection, certificates и parent reports.',
        ],
      },
      {
        id: 'schedule',
        title: '7. Управление расписанием',
        intro:
          'Schedule связывает ритм класса с операционным контролем. Admin, center admin, manager, counselor, teacher и assistant видят его в рамках своего scope.',
        steps: [
          'Откройте classroom и добавьте еженедельные слоты: день, start time, optional end time, timezone и label.',
          'Используйте понятные labels: Speaking lab, Mock review или Grammar workshop.',
          'До старта cohort проверьте schedule gaps в Education OS.',
          'Удаляйте устаревшие слоты, когда cohort завершился или перешел на новое расписание.',
        ],
        tips: [
          'Внутри одного cohort держите единый timezone. Смешанные timezone почти всегда ломают посещаемость.',
          'Teacher может вести расписание своего класса, но финансы и staff settings остаются вне его зоны.',
        ],
      },
      {
        id: 'payments',
        title: '8. Offers и платежи Click',
        intro:
          'Платежи Academy работают только через Click. Не настраивайте TSPay для Academy. Offers описывают, что продается; payments отслеживают settlement; grants/entitlements показывают, какой доступ получает студент.',
        steps: [
          'Создайте offers для tuition, course packages, mock exams или classroom access windows.',
          'Привяжите grants к offers, чтобы после оплаты создавался правильный доступ.',
          'Создавайте payment records из office, когда студент должен оплатить обучение или пакет.',
          'Используйте Click pay-by-card или Click invoice flows, где они включены.',
          'Manual settlement ставьте только после подтверждения денег вне автоматического flow.',
        ],
        tips: [
          'Managers и teachers не должны видеть finance. Платежи держите в owner/admin или center_admin зонах.',
          'Если payment status выглядит неверно, сначала проверьте Click transaction status.',
        ],
      },
      {
        id: 'messages',
        title: '9. Коммуникация',
        intro:
          'В Academy есть три уровня коммуникации: direct messages, announcements и alerts. Используйте самый узкий уровень, который достигает нужных людей.',
        steps: [
          'Direct messages подходят для индивидуального follow-up.',
          'Classroom announcements используйте для напоминаний, домашней работы и изменений расписания.',
          'Global announcements оставляйте для важных сообщений всей academy.',
          'Alerts создавайте для рисков, оплаты, посещаемости или срочной поддержки.',
          'Resolve ставьте только когда действие действительно завершено.',
        ],
        tips: [
          'Teacher пишет в рамках назначенного класса. Manager координирует по операционным записям.',
          'Announcements должны быть короткими и практичными. Студенты читают их внутри learning flow.',
        ],
      },
      {
        id: 'telegram',
        title: '10. Telegram-приложение Academy для сотрудников',
        intro:
          'Academy-бот — это мобильный вход в ту же работу с учетом роли, а не вторая база данных и не неконтролируемый групповой чат. Сотрудник открывает @schoodacademybot, связывает аккаунт Schood и выполняет разрешенные действия в Mini App.',
        steps: [
          'Откройте @schoodacademybot и используйте одноразовую ссылку сотрудника, созданную в Academy. До загрузки данных проверяются личность Telegram и активная роль Academy.',
          'Команда /today показывает следующее назначенное занятие. Преподаватель может начать или продолжить урок, отметить посещаемость, проверить программу и завершить урок с домашней работой.',
          'Используйте /announce, /homework, /attendance, /requests, /groups или /settings, чтобы открыть соответствующее разрешенное действие.',
          'Администратор Academy должен включить Telegram-операции и подключить группу сотрудников, класса или родителей одноразовой ссылкой сроком на десять минут.',
          'Оставьте включенным режим конфиденциальности групп в BotFather. Бот отвечает на явные команды и одобренные действия и не читает обычную переписку группы.',
        ],
        tips: [
          'Личные предупреждения, оценки, платежи и индивидуальные проблемы посещаемости доставляются только приватно. В группы отправляется только безопасная для группы информация.',
          'Если Mini App сообщает об истекшей Telegram-сессии, закройте его и откройте снова из бота. Если требуется привязка, создайте новую ссылку сотрудника в Academy.',
        ],
      },
      {
        id: 'education-os',
        title: '11. Как правильно использовать Education OS',
        intro:
          'Education OS - это command layer: очередь, риски, gaps в расписании, lifecycle, отчеты и automation. Но ежедневное ядро продукта - assignments, grading, attendance и schedule.',
        steps: [
          'Начинайте день с Today: открытые actions и срочные проблемы класса.',
          'Pipeline используйте для lead, placement, enrolled, learning, attention, renewal и completion.',
          'В Intelligence смотрите risk patterns, backlog и операционные gaps.',
          'Command используйте только из ролей с правами на finance, reports, notifications или automation.',
          'Работу teacher держите в Learning и Attendance, если ему не выдана другая роль.',
        ],
        tips: [
          'Если control появился в неправильном route, это role-lane bug. Сначала исправьте matrix, потом добавляйте UI.',
          'Education OS помогает выбрать следующий шаг, но не заменяет LMS-процессы.',
        ],
      },
      {
        id: 'students',
        title: '12. Опыт студента',
        intro:
          'Студент должен попадать в понятное учебное пространство, а не в admin product. Student workspace специально узкий и безопасный.',
        steps: [
          'Студент входит и открывает /academy/student.',
          'Он видит свои academies, classrooms, announcements, alerts, assignments, attendance, progress и tuition items.',
          'В assignment он открывает task, отправляет текст или ссылку, затем видит feedback или score.',
          'Для вопросов по учебе и поддержки он использует classroom messages.',
          'Если класс не виден, проверьте contact email, linked user, classroom membership и active grant/entitlement.',
        ],
        tips: [
          'Не выдавайте студенту staff role для troubleshooting. Исправьте roster или linked user record.',
          'Student screens не должны показывать office routes, staff, payment admin или данные других студентов.',
        ],
      },
      {
        id: 'guardians',
        title: '13. Управляемый доступ для семьи',
        intro:
          'Родительский портал основан на явной связи студент–опекун. Сотрудник Academy выбирает доступные категории, фиксирует согласие и использует безопасную привязку Telegram до открытия семейных данных.',
        steps: [
          'В карточке студента создайте связь с опекуном: имя, тип родства, контакты, язык и признаки ответственности.',
          'Выберите разрешенные данные: статус, посещаемость, оценки, домашняя работа, расписание, платежи, задолженность, сообщения, отчеты о прогрессе, ресурсы и объявления.',
          'Зафиксируйте согласие и активируйте связь до отправки приглашения или Telegram-ссылки.',
          'Опекун открывает /academy/parent и видит только связанного студента и разрешенные категории.',
          'Отзовите или сузьте связь, если изменились опека, спонсорство, согласие или ответственность за коммуникацию.',
        ],
        tips: [
          'Не выдавайте родителю аккаунт студента или сотрудника как обходной путь. Связь опекуна сохраняет согласие, область доступа и аудит.',
          'Видимость платежей и задолженности — отдельные разрешения; они не включаются автоматически вместе с учебным прогрессом.',
        ],
      },
      {
        id: 'operations',
        title: '14. Production-операции и диагностика',
        intro:
          'У Schood только production. Любые изменения должны быть аккуратными, проверенными и role-aware. Оператор Academy должен понимать, где искать проблему.',
        steps: [
          'Перед изменением production behavior определите затронутый route и роль: admin, center, office, teacher или student.',
          'Если нет доступа, проверьте grant status, email, expiry, classroom scope и факт входа пользователя.',
          'Если нет LMS-данных, проверьте classroom ID, roster membership, assignment status и route permission.',
          'Для платежей помните: Academy использует только Click.',
          'При schema или Edge Function изменениях после merge frontend PR вручную deploy Supabase migrations и functions.',
        ],
        tips: [
          'Никогда не push прямо в main. Откройте PR, дождитесь CI, merge, проверьте production deploy и выполните Supabase follow-ups.',
          'Если сомневаетесь, уменьшайте доступ. Scoped grant безопаснее широкого admin access.',
        ],
      },
    ],
    checklist: [
      'Academy создана с понятным именем и slug.',
      'Branding, logo, public copy и цвета проверены.',
      'Есть хотя бы один active classroom.',
      'Owner/admin access подтвержден.',
      'Managers/counselors получили операционный доступ.',
      'Teachers/assistants получили доступ только к назначенным classroom.',
      'Студенты импортированы, linked и добавлены в roster.',
      'Курс, модули, уроки, цели, ресурсы и рекомендации по домашней работе опубликованы для реального класса.',
      'Teacher Day проверен полностью: запуск, посещаемость, пройденные цели, завершение и выдача домашней работы.',
      'Assignments, gradebook, attendance и schedule протестированы на реальном classroom.',
      'Offers и Click payment flow проверены.',
      'Сообщения, объявления, alerts, разрешения опекуна и родительские отчеты протестированы.',
      'Telegram-аккаунт сотрудника Academy связан, команда /today проверена в @schoodacademybot.',
      'Student route проверен реальным student account.',
    ],
    footer: 'Документация Schood Academy - это рабочая операционная документация. Обновляйте ее каждый раз, когда меняются routes, roles, payments или LMS workflows.',
  },
};

const getInitialLang = (): Lang => {
  const queryLang = new URLSearchParams(window.location.search).get('lang') as Lang | null;
  if (queryLang && langOrder.includes(queryLang)) return queryLang;
  const hashLang = window.location.hash.replace('#', '') as Lang;
  if (langOrder.includes(hashLang)) return hashLang;
  const stored = window.localStorage.getItem('academy-docs-lang') as Lang | null;
  if (stored && langOrder.includes(stored)) return stored;
  const browser = navigator.language.toLowerCase();
  if (browser.startsWith('ru')) return 'ru';
  if (browser.startsWith('uz')) return 'uz';
  return 'en';
};

const setPageLang = (lang: Lang): void => {
  document.documentElement.lang = lang;
  window.localStorage.setItem('academy-docs-lang', lang);
  const url = new URL(window.location.href);
  url.searchParams.set('lang', lang);
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
};

const App = () => {
  const [lang, setLang] = useState<Lang>(getInitialLang);
  const [query, setQuery] = useState('');
  const copy = docs[lang];
  const filteredSections = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return copy.sections;
    return copy.sections.filter((section) => [section.title, section.intro, ...(section.steps ?? []), ...(section.tips ?? [])]
      .join(' ')
      .toLocaleLowerCase()
      .includes(normalized));
  }, [copy.sections, query]);
  const sectionLinks = useMemo(() => filteredSections.map((section) => ({ id: section.id, title: section.title })), [filteredSections]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const changeLang = (next: Lang) => {
    setLang(next);
    setPageLang(next);
  };

  return (
    <main>
      <header className="hero">
        <nav className="topbar" aria-label="Primary">
          <a className="brand" href="#top" aria-label="Schood Academy Docs home">
            <img src="/schood-logo.png" alt="" />
            <span>{copy.docsLabel}</span>
          </a>
          <div className="topbar-actions">
            <span className="current-badge"><i />{copy.currentLabel}</span>
            <a className="topbar-app-link" href="https://academy.schood.online">{copy.primaryCta} <span aria-hidden="true">↗</span></a>
            <div className="lang-switcher" aria-label="Language">
              {langOrder.map((item) => (
                <button key={item} type="button" className={lang === item ? 'active' : ''} onClick={() => changeLang(item)} aria-pressed={lang === item}>
                  {docs[item].shortName}
                </button>
              ))}
            </div>
          </div>
        </nav>

        <section id="top" className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
            <p className="subtitle">{copy.subtitle}</p>
            <div className="hero-actions">
              <a className="primary-link" href="https://academy.schood.online">{copy.primaryCta}</a>
              <a className="secondary-link" href="#quick-start">{copy.secondaryCta}</a>
            </div>
            <p className="updated">{copy.updated}</p>
          </div>

          <aside className="lesson-signal" aria-label={copy.teacherSignalAria}>
            <div className="lesson-signal__top">
              <span>{copy.teacherSignalEyebrow}</span>
              <strong>18:00</strong>
            </div>
            <div className="lesson-signal__title">
              <p>{copy.teacherSignalTitle}</p>
              <span>{copy.teacherSignalMeta}</span>
            </div>
            <div className="lesson-signal__steps">
              {copy.teacherSignalSteps.map((step, index) => (
                <div key={step} className={index === 0 ? 'is-active' : ''}>
                  <i>{index + 1}</i>
                  <span>{step}</span>
                </div>
              ))}
            </div>
            <a href="#teacher-day">{copy.quickStarts[2].action} <span aria-hidden="true">→</span></a>
          </aside>
        </section>
      </header>

      <div className="layout">
        <aside className="toc">
          <p>{copy.navTitle}</p>
          <label className="docs-search">
            <span>{copy.searchLabel}</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} type="search" />
          </label>
          <nav className="toc-links" aria-label={copy.navTitle}>
            {!query ? <a href="#quick-start">{copy.quickStartTitle}</a> : null}
            {!query ? <a href="#routes">{copy.routesTitle}</a> : null}
            {!query ? <a href="#operating-model">{copy.operatingTitle}</a> : null}
            {!query ? <a href="#roles">{copy.rolesTitle}</a> : null}
            {sectionLinks.map((section) => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}
            {!query ? <a href="#checklist">{copy.checklistTitle}</a> : null}
          </nav>
          {query && !sectionLinks.length ? <span className="toc-empty">{copy.noResults}</span> : null}
        </aside>

        <div className="content">
          <section id="quick-start" className="doc-section quick-start">
            <div className="section-heading">
              <p className="eyebrow">{copy.quickStartEyebrow}</p>
              <h2>{copy.quickStartTitle}</h2>
            </div>
            <p className="lead">{copy.quickStartSubtitle}</p>
            <div className="quick-start-grid">
              {copy.quickStarts.map((item, index) => (
                <a href={item.href} className={`quick-start-card quick-start-card--${index + 1}`} key={item.title}>
                  <span>{item.audience}</span>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                  <strong>{item.action} <span aria-hidden="true">→</span></strong>
                </a>
              ))}
            </div>
          </section>
          <section id="routes" className="doc-section">
            <div className="section-heading">
              <p className="eyebrow">{copy.appLabel}</p>
              <h2>{copy.routesTitle}</h2>
            </div>
            <div className="route-list">
              {copy.routeRows.map((row) => (
                <article key={row.route} className="route-row">
                  <code>{row.route}</code>
                  <div>
                    <h3>{row.label}</h3>
                    <p>{row.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section id="operating-model" className="doc-section">
            <div className="section-heading">
              <p className="eyebrow">Center Office &rarr; Academy &rarr; Classroom</p>
              <h2>{copy.operatingTitle}</h2>
            </div>
            <p className="lead">{copy.operatingSubtitle}</p>
            <div className="flow-list">
              {copy.flowRows.map((row) => (
                <article key={`${row.layer}-${row.path}`} className="flow-row">
                  <span>{row.layer}</span>
                  <div>
                    <code>{row.path}</code>
                    <h3>{row.label}</h3>
                    <p>{row.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section id="roles" className="doc-section">
            <div className="section-heading">
              <p className="eyebrow">{copy.rolesEyebrow}</p>
              <h2>{copy.rolesTitle}</h2>
            </div>
            <div className="role-table">
              {copy.roleRows.map((row) => (
                <article key={row.role} className="role-row">
                  <div>
                    <h3>{row.role}</h3>
                    <span>{row.scope}</span>
                  </div>
                  <p><strong>{copy.canLabel}:</strong> {row.can}</p>
                  <p><strong>{copy.cannotLabel}:</strong> {row.cannot}</p>
                </article>
              ))}
            </div>
          </section>

          {filteredSections.map((section) => (
            <section key={section.id} id={section.id} className="doc-section">
              <div className="section-heading">
                <p className="eyebrow">{copy.sectionEyebrow}</p>
                <h2>{section.title}</h2>
              </div>
              <p className="lead">{section.intro}</p>
              {section.steps ? (
                <ol className="steps">
                  {section.steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
              ) : null}
              {section.tips ? (
                <div className="tips">
                  {section.tips.map((tip) => <p key={tip}>{tip}</p>)}
                </div>
              ) : null}
            </section>
          ))}

          {query && !filteredSections.length ? (
            <section className="doc-section empty-search" role="status">
              <h2>{copy.noResults}</h2>
              <button type="button" onClick={() => setQuery('')}>{copy.quickStartTitle}</button>
            </section>
          ) : null}

          <section id="checklist" className="doc-section checklist">
            <div className="section-heading">
              <p className="eyebrow">{copy.checklistEyebrow}</p>
              <h2>{copy.checklistTitle}</h2>
            </div>
            <ul>
              {copy.checklist.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>

          <footer className="footer">
            <p>{copy.footer}</p>
            <div>
              <a href="https://academy.schood.online">{copy.appLabel}</a>
              <a href="https://t.me/schoodacademybot">@schoodacademybot</a>
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
};

export default App;
