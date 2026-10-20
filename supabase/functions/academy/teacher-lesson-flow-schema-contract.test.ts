import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => Deno.readTextFile(new URL(path, root));

Deno.test("teacher lesson runs are tenant-safe, staff-private, and service-written", async () => {
  const migration = await read("supabase/migrations/20260901120000_academy_teacher_lesson_flow.sql");
  assertMatch(migration, /create table if not exists public\.academy_teacher_lesson_runs/);
  for (const relationship of ["session_id", "classroom_id", "staff_id", "course_id", "module_id", "lesson_id", "homework_assignment_id"]) {
    assertMatch(migration, new RegExp(`foreign key \\(academy_id, ${relationship}\\)`));
  }
  assertMatch(migration, /alter table public\.academy_teacher_lesson_runs enable row level security/);
  assertMatch(migration, /public\.academy_org_can_manage\(academy_id\)/);
  assertMatch(migration, /staff\.user_id = auth\.uid\(\)/);
  assertMatch(migration, /revoke all on public\.academy_teacher_lesson_runs from anon, authenticated/);
  assertMatch(migration, /grant select on public\.academy_teacher_lesson_runs to authenticated/);
  assertEquals(/grant (?:insert|update|delete|all) on public\.academy_teacher_lesson_runs to authenticated/i.test(migration), false);
});

Deno.test("teacher lesson writes are replay-safe and restricted to the assigned teacher", async () => {
  const migration = await read("supabase/migrations/20260901120000_academy_teacher_lesson_flow.sql");
  for (const rpc of ["academy_start_teacher_lesson", "academy_record_teacher_attendance_batch", "academy_finish_teacher_lesson"]) {
    assertMatch(migration, new RegExp(`create or replace function public\\.${rpc}`));
    assertMatch(migration, new RegExp(`revoke all on function public\\.${rpc}[\\s\\S]*?from public, anon, authenticated`));
    assertMatch(migration, new RegExp(`grant execute on function public\\.${rpc}[\\s\\S]*?to service_role`));
  }
  assert(migration.split("idempotency_key is required").length >= 4);
  assertMatch(migration, /Teacher is not assigned to this lesson session/);
  assertMatch(migration, /Teacher is not assigned to this lesson run/);
  assertMatch(migration, /academy_assignments_teacher_lesson_run_uidx/);
  assertMatch(migration, /on conflict \(academy_id, \(metadata->>'teacher_lesson_run_id'\)\)/);
});

Deno.test("finishing a lesson closes the academic loop and queues only opted-in class groups", async () => {
  const migration = await read("supabase/migrations/20260901120000_academy_teacher_lesson_flow.sql");
  assertMatch(migration, /academy_transition_lesson_session/);
  assertMatch(migration, /'teacher_lesson_flow'/);
  assertMatch(migration, /s\.event_type = 'homework_published' and s\.enabled and s\.delivery_mode <> 'off'/);
  assertMatch(migration, /settings\.enabled/);
  assertMatch(migration, /c\.status = 'active' and c\.purpose = 'classroom_community'/);
  assertMatch(migration, /on conflict \(academy_id, dedupe_key\) where dedupe_key is not null do nothing/);
});

Deno.test("Academy and Telegram use the same teacher lesson service", async () => {
  const shared = await read("supabase/functions/_shared/academy-teacher-flow.ts");
  const academy = await read("supabase/functions/academy/index.ts");
  const operational = await read("supabase/functions/academy/operational-command.ts");
  const telegram = await read("supabase/functions/academy-telegram/index.ts");
  const miniApp = await read("apps/academy/src/components/telegram/AcademyTelegramApp.tsx");
  for (const operation of ["loadAcademyTeacherDay", "startAcademyTeacherLesson", "recordAcademyTeacherAttendance", "finishAcademyTeacherLesson"]) {
    assertMatch(shared, new RegExp(`export const ${operation}`));
    assert(academy.includes(operation)||academy.includes('runOperationalCommand')&&operational.includes(operation), `${operation} must be used by Academy`);
    assert(telegram.includes(operation), `${operation} must be used by Telegram`);
  }
  for (const action of ["teacher_lesson_start", "teacher_lesson_attendance", "teacher_lesson_finish"]) {
    assert(telegram.includes(action));
    assert(miniApp.includes(action));
  }
  assertMatch(telegram, /command === "\/today"[\s\S]*?loadAcademyTeacherDay/);
});
