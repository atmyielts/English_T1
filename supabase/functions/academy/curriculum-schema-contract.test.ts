import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const migrationUrl = new URL(
  "../../migrations/20260810120000_academy_curriculum_assessments.sql",
  import.meta.url,
);
const migration = await Deno.readTextFile(migrationUrl);

const curriculumTables = [
  "academy_courses",
  "academy_course_modules",
  "academy_lessons",
  "academy_classroom_courses",
  "academy_lesson_progress",
  "academy_quizzes",
  "academy_quiz_questions",
  "academy_quiz_attempts",
  "academy_grade_categories",
  "academy_rubrics",
];

Deno.test("Academy curriculum schema enables RLS on every new tenant table", () => {
  for (const table of curriculumTables) {
    assert(
      migration.includes(
        `alter table public.${table} enable row level security;`,
      ),
      `${table} must enable RLS`,
    );
  }
});

Deno.test("Academy curriculum schema uses tenant-scoped foreign keys", () => {
  const expectedTenantLinks = [
    "foreign key (course_id, academy_id) references public.academy_courses(id, academy_id)",
    "foreign key (module_id, academy_id) references public.academy_course_modules(id, academy_id)",
    "foreign key (lesson_id, academy_id) references public.academy_lessons(id, academy_id)",
    "foreign key (quiz_id, academy_id) references public.academy_quizzes(id, academy_id)",
    "foreign key (classroom_id, academy_id) references public.academy_classrooms(id, academy_id)",
    "foreign key (contact_id, academy_id) references public.academy_contacts(id, academy_id)",
  ];
  for (const link of expectedTenantLinks) {
    assert(
      migration.includes(link),
      `Missing tenant-safe relationship: ${link}`,
    );
  }
});

Deno.test("Academy curriculum schema preserves tenant identity when optional parents are deleted", () => {
  for (
    const column of [
      "prerequisite_lesson_id",
      "lesson_id",
      "course_id",
      "module_id",
      "grade_category_id",
      "rubric_id",
    ]
  ) {
    assert(
      migration.includes(`on delete set null (${column})`),
      `${column} deletion must not null academy_id`,
    );
  }
});

Deno.test("Quiz answer keys are not exposed by a member-read RLS policy", () => {
  const questionPolicies = migration.match(
    /create policy[^;]+on public\.academy_quiz_questions[\s\S]*?;/gi,
  ) ?? [];
  assertEquals(questionPolicies.length, 1);
  const questionPolicy = questionPolicies[0] ?? "";
  assert(questionPolicy.includes("manage by admins"));
  assertEquals(questionPolicy.includes("read by members"), false);
});
