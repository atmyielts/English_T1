-- Company English people (gtm): owner guard, demo-request fields, invitation rules.
\set ON_ERROR_STOP 1
insert into public.users(id) values
  ('00000000-0000-4000-8000-0000000000b1'), ('00000000-0000-4000-8000-0000000000b2'), ('00000000-0000-4000-8000-0000000000b3');
\i /work/migration.sql

do $$
declare
  first_owner constant uuid := '00000000-0000-4000-8000-0000000000b1';
  second_owner constant uuid := '00000000-0000-4000-8000-0000000000b2';
  employee constant uuid := '00000000-0000-4000-8000-0000000000b3';
  org uuid;
  owner_row uuid;
  other_row uuid;
  employee_row uuid;
  department uuid;
  blocked boolean;
begin
  insert into public.company_orgs(name, status, seats_limit) values ('Silk Road Hotels', 'active', 2) returning id into org;
  insert into public.company_members(org_id, user_id, role, status) values (org, first_owner, 'owner', 'active') returning id into owner_row;
  insert into public.company_members(org_id, user_id, role, status) values (org, employee, 'employee', 'active') returning id into employee_row;

  -- The only owner cannot be demoted or removed by an update.
  blocked := false;
  begin
    update public.company_members set role = 'admin' where id = owner_row;
  exception when others then
    blocked := sqlerrm like 'company_last_owner%';
  end;
  assert blocked, 'last owner demotion blocked';
  blocked := false;
  begin
    update public.company_members set status = 'removed' where id = owner_row;
  exception when others then
    blocked := sqlerrm like 'company_last_owner%';
  end;
  assert blocked, 'last owner removal blocked';

  -- With a second owner the first may step down; other columns are never blocked.
  insert into public.company_members(org_id, user_id, role, status) values (org, second_owner, 'owner', 'active') returning id into other_row;
  update public.company_members set role = 'admin' where id = owner_row;
  assert (select role from public.company_members where id = owner_row) = 'admin', 'stepped down';
  update public.company_members set job_role = 'management', seat = true where id = other_row;
  -- An invited owner (not active yet) does not count, and does not block either.
  insert into public.company_members(org_id, email, role, status) values (org, 'next@example.com', 'owner', 'invited');
  update public.company_members set status = 'removed' where org_id = org and status = 'invited';
  blocked := false;
  begin
    update public.company_members set status = 'removed' where id = other_row;
  exception when others then
    blocked := sqlerrm like 'company_last_owner%';
  end;
  assert blocked, 'new last owner protected';
  -- Erasing an account deletes rows; that is not blocked.
  delete from public.company_members where id = other_row;
  assert not exists (select 1 from public.company_members where id = other_row), 'delete allowed';

  -- Deleting a department moves its people to no department.
  insert into public.company_departments(org_id, name) values (org, 'Front office') returning id into department;
  update public.company_members set department_id = department where id = employee_row;
  delete from public.company_departments where id = department;
  assert (select department_id is null from public.company_members where id = employee_row), 'department set null';

  -- Invitations: the token hash is unique, personal invites cascade with their member.
  insert into public.company_invites(org_id, member_id, kind, token_hash, expires_at) values (org, employee_row, 'personal', 'hash-1', now() + interval '14 days');
  blocked := false;
  begin
    insert into public.company_invites(org_id, kind, token_hash, expires_at) values (org, 'link', 'hash-1', now() + interval '1 day');
  exception when unique_violation then
    blocked := true;
  end;
  assert blocked, 'token hash unique';

  -- Demo requests carry a job title, interests and a follow-up date.
  insert into public.company_leads(name, company, phone, job_title, interests, follow_up_at, ip_hash)
    values ('Dilnoza', 'Silk Road Hotels', '+998 90 000 00 00', 'HR director', array['hiring','training'], current_date + 3, 'abc');
  assert (select interests = array['hiring','training'] from public.company_leads where company = 'Silk Road Hotels'), 'interests stored';
  blocked := false;
  begin
    insert into public.company_leads(name, company, interests) values ('X', 'Y', array['payroll']);
  exception when check_violation then
    blocked := true;
  end;
  assert blocked, 'unknown interest refused';
  assert (select count(*) from public.company_leads where ip_hash = 'abc') = 1, 'ip hash lookup';
end
$$;

do $$
begin
  assert not has_function_privilege('authenticated', 'public.company_members_owner_guard()', 'execute'), 'guard not callable';
  assert exists (select 1 from pg_trigger where tgname = 'company_members_owner_guard'), 'owner guard installed';
  assert (select count(*) from pg_trigger where tgname = 'company_members_owner_guard') = 1, 'owner guard once';
end
$$;
select 'company people: ok';
