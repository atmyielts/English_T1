import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const migration = await Deno.readTextFile(new URL("../../migrations/20260814120000_student_center_classroom_video_foundation.sql", import.meta.url));
const academy = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const studentCenter = await Deno.readTextFile(new URL("../student-center/index.ts", import.meta.url));
const academyVideo = await Deno.readTextFile(new URL("../academy-video/index.ts", import.meta.url));
const platformSettingsEntry = await Deno.readTextFile(new URL("../platform-settings/index.ts", import.meta.url));
const platformSettings = await Deno.readTextFile(new URL("../platform-settings/handler.ts", import.meta.url));
const config = (await Deno.readTextFile(new URL("../../config.toml", import.meta.url))).replaceAll("\r\n", "\n");

Deno.test("Student Center and Classroom 2.0 ship disabled by default", () => {
  assert(migration.includes("add column if not exists student_center_enabled boolean not null default false"));
  assert(migration.includes("add column if not exists classroom_v2_enabled boolean not null default false"));
  assert(migration.includes("add column if not exists academy_video_uploads_enabled boolean not null default false"));
});

Deno.test("new Academy delivery and video tables are service-mediated and tenant scoped", () => {
  for (const table of ["academy_session_delivery", "academy_video_policies", "academy_video_assets", "academy_lesson_media"]) {
    assert(migration.includes(`create table if not exists public.${table}`), `${table} must exist`);
    assert(migration.includes(`alter table public.${table} enable row level security;`), `${table} must enable RLS`);
    assert(migration.includes(`revoke all on public.${table} from anon, authenticated;`), `${table} must reject direct client access`);
  }
  assert(migration.includes("foreign key (lesson_id, academy_id)"));
  assert(migration.includes("foreign key (video_asset_id, academy_id)"));
});

Deno.test("legacy video resources are playable but immutable and new arbitrary videos are blocked", () => {
  assert(migration.includes("where kind = 'video'"));
  assert(migration.includes("New video resources must use managed lesson media"));
  assert(migration.includes("Legacy video resources are read-only"));
  assert(migration.includes("before insert or update or delete on public.academy_classroom_resources"));
  assert(academy.includes('code: "VIDEO_MANAGED_HOSTING_REQUIRED"'));
});

Deno.test("Student Center adapters are user scoped and fail independently", () => {
  assert(studentCenter.includes('.eq("user_id", user.id)'));
  assert(studentCenter.includes('settle("academy", academyRequest)'));
  assert(studentCenter.includes('settle("access", accessRequest)'));
  assert(studentCenter.includes('settle("learning", learningRequest)'));
  assert(studentCenter.includes("partial_errors: partialErrors"));
  assertEquals(studentCenter.includes("SUPABASE_SERVICE_ROLE_KEY\" }"), false);
});

Deno.test("live-room joins recheck classroom enrollment and a bounded time window", () => {
  assert(academy.includes('requestedAction === "student_session_join"'));
  assert(academy.includes("loadStudentClassroomEnrollment"));
  assert(academy.includes("join_opens_at"));
  assert(academy.includes("join_closes_at"));
  assert(academy.includes('requireAcademyPermission(access, "manageAcademicOperations")'));
});

Deno.test("managed video requires provider health, global approval, academy approval, and positive quota", () => {
  for (const marker of ["GLOBAL_DISABLED", "VIDEO_HOSTING_NOT_CONFIGURED", "ACADEMY_NOT_APPROVED", "QUOTA_NOT_CONFIGURED", "STORAGE_QUOTA_REACHED", "MONTHLY_UPLOAD_QUOTA_REACHED"]) {
    assert(academyVideo.includes(marker), marker);
  }
  assert(academyVideo.includes("requireSignedURLs: true"));
  assert(academyVideo.includes('allowedOrigins: ["academy.schood.online"]'));
  assert(academyVideo.includes("canViewAsset"));
  assert(academyVideo.includes("academy_audit_events"));
  assert(academyVideo.includes('sb.rpc("academy_reserve_video_asset"'));
  assert(academyVideo.includes('.eq("status", "published")'));
  assert(migration.includes("for update;"));
  assert(migration.includes("grant execute on function public.academy_reserve_video_asset"));
  assert(platformSettingsEntry.includes('from "./handler.ts"') || platformSettingsEntry.includes("from './handler.ts'"));
  assert(platformSettingsEntry.includes("serve(handlePlatformSettings)"));
  assert(platformSettings.includes("Video hosting must be fully configured before uploads can be enabled"));
});

Deno.test("new public Edge routes retain explicit JWT verification in their handlers", () => {
  assert(config.includes("[functions.student-center]\nverify_jwt = false"));
  assert(config.includes("[functions.academy-video]\nverify_jwt = false"));
  assert(studentCenter.includes("authClient.auth.getUser(token)"));
  assert(academyVideo.includes("authClient.auth.getUser(token)"));
});
