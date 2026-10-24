// Runs scripts/fixtures/academy-course-versions.sql in an in-memory PostgreSQL
// (PGlite). The curriculum tables, the Homework OS unlock gates and the course
// listings come from their real migrations; only the platform tables around
// them (tenants, users, classrooms, contacts, authority) are minimal stand-ins.
// No hosted database is touched.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';

const read = (path) => readFileSync(path, 'utf8').replace(/^﻿/, '');
const between = (text, start, end) => {
  const from = text.indexOf(start), to = end ? text.indexOf(end, from) : text.length;
  assert.ok(from >= 0 && to > from, `Missing section ${start}`);
  return text.slice(from, to);
};

const curriculum = read('supabase/migrations/20260810120000_academy_curriculum_assessments.sql');
const homework = read('supabase/migrations/20261024100000_academy_homework_os.sql');
const listings = read('supabase/migrations/20261024105000_academy_course_listings.sql');
const versions = read('supabase/migrations/20261024231500_academy_course_versions.sql');
const fixture = read('scripts/fixtures/academy-course-versions.sql');

const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    -- Supabase grants new objects to the API roles by default; the migration must revoke them.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    create schema auth;
    create table auth.users(id uuid primary key, email text, aud text, role text, email_confirmed_at timestamptz,
      raw_app_meta_data jsonb, raw_user_meta_data jsonb, deleted_at timestamptz, banned_until timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
    create table public.users(id uuid primary key, is_active boolean not null default true);
    create function public.handle_new_auth_user() returns trigger language plpgsql as $$begin insert into public.users(id) values (new.id); return new; end$$;
    create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();
    create table public.tenants(id uuid primary key, name text, slug text, type text, metadata jsonb not null default '{}', created_by uuid);
    create table public.tenant_memberships(id uuid primary key default gen_random_uuid(), tenant_id uuid, user_id uuid, role text, status text);
    create table public.academy_branches(id uuid primary key, academy_id uuid, branch_key text, name text, timezone text, is_default boolean);
    create table public.academy_classrooms(id uuid primary key, academy_id uuid not null, branch_id uuid, name text, created_by uuid);
    create table public.academy_contacts(id uuid primary key, academy_id uuid not null, primary_branch_id uuid, user_id uuid,
      first_name text, email text, status text, created_by uuid);
    create table public.academy_classroom_memberships(id uuid primary key default gen_random_uuid(), academy_id uuid, classroom_id uuid,
      contact_id uuid, role text, status text);
    create table public.academy_learning_config(key text primary key, value jsonb not null);
    insert into public.academy_learning_config values ('billing.enforced', 'false');
    create table public.academy_legacy_boundary_actions(action text, mode text, capabilities text[], primary key(action, mode));
    create function public.is_academy_member(uuid) returns boolean language sql stable as $$select false$$;
    create function public.is_academy_admin(uuid) returns boolean language sql stable as $$select false$$;
    create function public.handle_teacher_studio_updated_at() returns trigger language plpgsql as $$begin new.updated_at := now(); return new; end$$;
    create function public.academy_learning_allows(uuid, text) returns boolean language sql stable as $$select true$$;
    -- Authority stand-ins: an active owner or admin covers the whole academy; anyone else is refused.
    create function public.academy_current_authorities(p_academy_id uuid, p_actor_id uuid) returns jsonb language plpgsql as $$
    declare result jsonb;
    begin
      select coalesce(jsonb_agg(jsonb_build_object('role', role, 'scope_type', 'academy')), '[]') into result
      from public.tenant_memberships where tenant_id = p_academy_id and user_id = p_actor_id and status = 'active' and role in ('owner', 'admin');
      if result = '[]' then raise exception using errcode = '42501', message = 'Forbidden Academy access'; end if;
      return result;
    end$$;
    create function public.academy_command_covers(p_authorities jsonb, p_capability text, p_scope jsonb) returns boolean language sql as $$
      select exists(select 1 from jsonb_array_elements(p_authorities) a where a->>'scope_type' = 'academy')$$;
  `);
  await db.exec(between(curriculum, 'create unique index if not exists academy_classrooms_id_academy_unique', 'create table if not exists public.academy_grade_categories'));
  await db.exec(between(homework, '-- Module unlock-by-check', '-- Staff scope for Homework OS'));
  await db.exec(listings);
  await db.exec(versions);
  // A second run must be harmless (create or replace, if not exists, on conflict).
  await db.exec(versions);

  const body = fixture.replace(/^\s*begin;\s*/m, '').replace(/\nrollback;[\s\S]*$/, '\n');
  assert.ok(body.includes('do $fixture$') && !/\brollback;/.test(body));
  await db.exec(body);
  const left = (await db.query('select count(*)::int n from public.academy_course_versions')).rows[0].n;
  console.log(JSON.stringify({suite: 'academy-course-versions', fixture: 'scripts/fixtures/academy-course-versions.sql', passed: true, versions_created: left, productionTouched: false}));
} catch (error) {
  console.error(JSON.stringify({message: error.message, code: error.code, where: error.where}));
  process.exitCode = 1;
} finally {
  await db.close();
}
