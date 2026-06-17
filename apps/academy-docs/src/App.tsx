import { useEffect, useMemo, useState } from 'react';

type Lang = 'en' | 'uz' | 'ru';

type Section = {
  id: string;
  title: string;
  intro: string;
  steps?: string[];
  tips?: string[];
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
  routesTitle: string;
  operatingTitle: string;
  operatingSubtitle: string;
  rolesTitle: string;
  checklistTitle: string;
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
    title: 'Create and manage an Academy service with confidence',
    subtitle:
      'A practical guide for owners, center teams, teachers, assistants, and students. It explains the routes, role grants, LMS workflows, Click payments, and daily operating rhythm of Academy.',
    primaryCta: 'Open Academy',
    secondaryCta: 'Start with launch checklist',
    updated: 'Production guide for the current role-based Academy LMS',
    routesTitle: 'Workspace routes',
    operatingTitle: 'Operating model',
    operatingSubtitle:
      'Order the product from ownership to learning: Center Office is the business parent, Academy is the LMS tenant, and classrooms are where daily teaching happens.',
    rolesTitle: 'Role and access matrix',
    checklistTitle: 'Launch checklist',
    navTitle: 'On this page',
    docsLabel: 'Academy docs',
    appLabel: 'academy.schood.online',
    canLabel: 'Can',
    cannotLabel: 'Cannot',
    routeRows: [
      { route: '/academy/admin', label: 'Owner and admin', text: 'Full academy control, staff grants, finance, offers, branding, reports, and Education OS.' },
      { route: '/academy/center', label: 'Center admin', text: 'Center-owned academy oversight, linked academies, staff grants, finance, schedule, and global operations.' },
      { route: '/academy/office', label: 'Manager or counselor', text: 'Contacts, roster, classrooms, schedule, messages, alerts, and operational follow-up.' },
      { route: '/academy/teacher', label: 'Teacher or assistant', text: 'Assigned classroom LMS: assignments, gradebook, attendance, resources, schedule, and student messages.' },
      { route: '/academy/student', label: 'Student', text: 'Classroom feed, announcements, assignments, submissions, progress, alerts, and tuition items.' },
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
        id: 'roles',
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
        id: 'lms',
        title: '4. Run LMS workflows',
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
        title: '5. Manage schedule',
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
        title: '6. Configure offers and Click payments',
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
        title: '7. Communicate clearly',
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
        id: 'education-os',
        title: '8. Use Education OS without turning it into the product',
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
        title: '9. Student experience',
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
        id: 'operations',
        title: '10. Production operations and troubleshooting',
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
      'Assignments, gradebook, attendance, and schedule tested in a real classroom.',
      'Offers and Click payment flow checked.',
      'Messages, announcements, alerts, and parent reports tested.',
      'Student route smoke-tested with a real student account.',
    ],
    footer: 'Schood Academy docs are operational documentation. Keep them close to the product and update them whenever routes, roles, payments, or LMS workflows change.',
  },
  uz: {
    langName: 'O‘zbekcha',
    shortName: 'UZ',
    eyebrow: 'Schood Academy bo‘yicha amaliy qo‘llanma',
    title: 'Academy xizmatini ishonch bilan yaratish va boshqarish',
    subtitle:
      'Bu qo‘llanma egalar, markaz jamoasi, menejerlar, o‘qituvchilar, assistentlar va talabalar uchun. Unda yo‘nalishlar, rollar, grantlar, LMS jarayonlari, Click to‘lovlari va kunlik ish tartibi tushuntiriladi.',
    primaryCta: 'Academy ni ochish',
    secondaryCta: 'Ishga tushirish ro‘yxati',
    updated: 'Hozirgi role-based Academy LMS uchun production qo‘llanma',
    routesTitle: 'Ish joylari yo‘nalishlari',
    operatingTitle: 'Ish modeli',
    operatingSubtitle:
      'Mahsulotni egalikdan o‘qishgacha tartiblang: Center Office biznes qatlami, Academy LMS tenant, classroom esa kundalik dars joyi.',
    rolesTitle: 'Rollar va ruxsatlar jadvali',
    checklistTitle: 'Ishga tushirish ro‘yxati',
    navTitle: 'Sahifa bo‘limlari',
    docsLabel: 'Academy hujjatlari',
    appLabel: 'academy.schood.online',
    canLabel: 'Qila oladi',
    cannotLabel: 'Qila olmaydi',
    routeRows: [
      { route: '/academy/admin', label: 'Ega va admin', text: 'Academy sozlamalari, xodim grantlari, moliya, offerlar, branding, hisobotlar va Education OS.' },
      { route: '/academy/center', label: 'Markaz admini', text: 'Markazga tegishli academylarni kuzatish, xodimlar, moliya, jadval va umumiy operatsiyalar.' },
      { route: '/academy/office', label: 'Menejer yoki counselor', text: 'Kontaktlar, roster, sinflar, jadval, xabarlar, alertlar va operatsion kuzatuv.' },
      { route: '/academy/teacher', label: 'O‘qituvchi yoki assistent', text: 'Biriktirilgan sinflar uchun LMS: topshiriqlar, baholar, davomat, resurslar, jadval va xabarlar.' },
      { route: '/academy/student', label: 'Talaba', text: 'Sinf lentasi, e’lonlar, topshiriqlar, topshirish, progress, alertlar va to‘lov elementlari.' },
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
        id: 'roles',
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
        id: 'lms',
        title: '4. LMS jarayonlarini yuritish',
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
        title: '5. Jadvalni boshqarish',
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
        title: '6. Offerlar va Click to‘lovlari',
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
        title: '7. Xabarlarni aniq yuborish',
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
        id: 'education-os',
        title: '8. Education OS ni to‘g‘ri ishlatish',
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
        title: '9. Talaba tajribasi',
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
        id: 'operations',
        title: '10. Production operatsiyasi va troubleshooting',
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
      'Assignments, gradebook, attendance va schedule real classroomda test qilingan.',
      'Offerlar va Click payment flow tekshirilgan.',
      'Messages, announcements, alerts va parent reports test qilingan.',
      'Student route real student akkaunt bilan smoke-test qilingan.',
    ],
    footer: 'Schood Academy hujjatlari amaliy operatsion hujjatdir. Route, rol, to‘lov yoki LMS jarayoni o‘zgarsa, uni ham yangilang.',
  },
  ru: {
    langName: 'Русский',
    shortName: 'RU',
    eyebrow: 'Практическая документация Schood Academy',
    title: 'Как создать и уверенно управлять сервисом Academy',
    subtitle:
      'Руководство для владельцев, администраторов центров, менеджеров, преподавателей, ассистентов и студентов. Здесь описаны маршруты, роли, гранты доступа, LMS-процессы, платежи Click и ежедневная операционная работа.',
    primaryCta: 'Открыть Academy',
    secondaryCta: 'Перейти к чек-листу',
    updated: 'Production-документация для текущей role-based Academy LMS',
    routesTitle: 'Рабочие маршруты',
    operatingTitle: 'Операционная модель',
    operatingSubtitle:
      'Выстраивайте продукт от владения к обучению: Center Office - бизнес-уровень, Academy - LMS tenant, classroom - место ежедневного обучения.',
    rolesTitle: 'Матрица ролей и доступа',
    checklistTitle: 'Чек-лист запуска',
    navTitle: 'На этой странице',
    docsLabel: 'Документация Academy',
    appLabel: 'academy.schood.online',
    canLabel: 'Может',
    cannotLabel: 'Не может',
    routeRows: [
      { route: '/academy/admin', label: 'Владелец и администратор', text: 'Полное управление academy: staff grants, финансы, offers, branding, отчеты и Education OS.' },
      { route: '/academy/center', label: 'Администратор центра', text: 'Контроль academy, принадлежащих центру: сотрудники, финансы, расписание и общие операции.' },
      { route: '/academy/office', label: 'Менеджер или counselor', text: 'Контакты, roster, классы, расписание, сообщения, alerts и операционное сопровождение.' },
      { route: '/academy/teacher', label: 'Преподаватель или ассистент', text: 'LMS по назначенным классам: задания, журнал оценок, посещаемость, ресурсы, расписание и сообщения.' },
      { route: '/academy/student', label: 'Студент', text: 'Лента класса, объявления, задания, отправка работ, прогресс, alerts и элементы оплаты.' },
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
        id: 'roles',
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
        id: 'lms',
        title: '4. LMS-процессы',
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
        title: '5. Управление расписанием',
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
        title: '6. Offers и платежи Click',
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
        title: '7. Коммуникация',
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
        id: 'education-os',
        title: '8. Как правильно использовать Education OS',
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
        title: '9. Опыт студента',
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
        id: 'operations',
        title: '10. Production-операции и troubleshooting',
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
      'Assignments, gradebook, attendance и schedule протестированы на реальном classroom.',
      'Offers и Click payment flow проверены.',
      'Messages, announcements, alerts и parent reports протестированы.',
      'Student route проверен реальным student account.',
    ],
    footer: 'Документация Schood Academy - это рабочая операционная документация. Обновляйте ее каждый раз, когда меняются routes, roles, payments или LMS workflows.',
  },
};

const getInitialLang = (): Lang => {
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
  history.replaceState(null, '', `#${lang}`);
};

const App = () => {
  const [lang, setLang] = useState<Lang>(getInitialLang);
  const copy = docs[lang];
  const sectionLinks = useMemo(() => copy.sections.map((section) => ({ id: section.id, title: section.title })), [copy.sections]);

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
          <div className="lang-switcher" aria-label="Language">
            {langOrder.map((item) => (
              <button key={item} type="button" className={lang === item ? 'active' : ''} onClick={() => changeLang(item)}>
                {docs[item].shortName}
              </button>
            ))}
          </div>
        </nav>

        <section id="top" className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
            <p className="subtitle">{copy.subtitle}</p>
            <div className="hero-actions">
              <a className="primary-link" href="https://academy.schood.online">{copy.primaryCta}</a>
              <a className="secondary-link" href="#checklist">{copy.secondaryCta}</a>
            </div>
            <p className="updated">{copy.updated}</p>
          </div>

          <aside className="product-signal" aria-label="Academy service map">
            <div className="signal-head">
              <img src="/schood-logo.png" alt="Schood" />
              <div>
                <strong>{copy.appLabel}</strong>
                <span>Role-based Academy LMS</span>
              </div>
            </div>
            <div className="signal-board">
              <span>Owner</span>
              <span>Center</span>
              <span>Office</span>
              <span>Teacher</span>
              <span>Student</span>
            </div>
            <div className="signal-lines" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
          </aside>
        </section>
      </header>

      <div className="layout">
        <aside className="toc">
          <p>{copy.navTitle}</p>
          <a href="#routes">{copy.routesTitle}</a>
          <a href="#operating-model">{copy.operatingTitle}</a>
          <a href="#roles">{copy.rolesTitle}</a>
          {sectionLinks.map((section) => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}
          <a href="#checklist">{copy.checklistTitle}</a>
        </aside>

        <div className="content">
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
              <p className="eyebrow">Access grants</p>
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

          {copy.sections.map((section) => (
            <section key={section.id} id={section.id} className="doc-section">
              <div className="section-heading">
                <p className="eyebrow">Academy operations</p>
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

          <section id="checklist" className="doc-section checklist">
            <div className="section-heading">
              <p className="eyebrow">Go-live</p>
              <h2>{copy.checklistTitle}</h2>
            </div>
            <ul>
              {copy.checklist.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>

          <footer className="footer">
            <p>{copy.footer}</p>
          </footer>
        </div>
      </div>
    </main>
  );
};

export default App;
