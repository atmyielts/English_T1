-- Bind the existing composite lead and lesson operations to current authority,
-- original intent and an immutable receipt in the same transaction.
begin;
-- Retain an existing non-main default branch when initializing CRM records.
create or replace function public.ensure_academy_crm_defaults(
  p_academy_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pipeline_id uuid;
  v_source record;
  v_stage record;
begin
  if not exists (select 1 from public.tenants where id = p_academy_id) then
    raise exception 'Academy not found';
  end if;

  insert into public.academy_branches (
    academy_id, branch_key, name, timezone, currency, is_default, created_by
  )
  values (p_academy_id, 'main', 'Main branch', 'Asia/Tashkent', 'UZS', not exists(select 1 from public.academy_branches where academy_id=p_academy_id and is_default), p_actor_id)
  on conflict (academy_id, branch_key) do nothing;

  for v_source in
    select * from (values
      ('instagram', 'social', 10, 'Instagram', 'Instagram', 'Instagram'),
      ('telegram', 'social', 20, 'Telegram', 'Telegram', 'Telegram'),
      ('website', 'digital', 30, 'Website', 'Veb-sayt', 'Веб-сайт'),
      ('landing_page', 'digital', 40, 'Landing page', 'Landing sahifa', 'Лендинг'),
      ('phone', 'direct', 50, 'Phone', 'Telefon', 'Телефон'),
      ('walk_in', 'direct', 60, 'Walk-in', 'Tashrif', 'Личный визит'),
      ('referral', 'referral', 70, 'Referral', 'Tavsiya', 'Рекомендация'),
      ('existing_student', 'referral', 80, 'Existing student', 'Mavjud o‘quvchi', 'Действующий ученик'),
      ('school_partnership', 'partnership', 90, 'School partnership', 'Maktab hamkorligi', 'Партнерство со школой'),
      ('advertising_campaign', 'paid', 100, 'Advertising campaign', 'Reklama kampaniyasi', 'Рекламная кампания'),
      ('manual', 'direct', 110, 'Manual entry', 'Qo‘lda kiritish', 'Ручной ввод'),
      ('api_import', 'integration', 120, 'API or import', 'API yoki import', 'API или импорт'),
      ('other', 'other', 130, 'Other', 'Boshqa', 'Другое')
    ) as s(source_key, category, position, en_label, uz_label, ru_label)
  loop
    insert into public.academy_lead_sources (
      academy_id, source_key, category, position, label_i18n, is_system, created_by
    ) values (
      p_academy_id,
      v_source.source_key,
      v_source.category,
      v_source.position,
      jsonb_build_object('en', v_source.en_label, 'uz', v_source.uz_label, 'ru', v_source.ru_label),
      true,
      p_actor_id
    ) on conflict (academy_id, source_key) do nothing;
  end loop;

  insert into public.academy_sales_pipelines (
    academy_id, pipeline_key, name_i18n, is_default, created_by
  ) values (
    p_academy_id,
    'admissions',
    jsonb_build_object('en', 'Admissions', 'uz', 'Qabul', 'ru', 'Прием'),
    true,
    p_actor_id
  )
  on conflict (academy_id, pipeline_key) do update
    set is_active = true
  returning id into v_pipeline_id;

  for v_stage in
    select * from (values
      ('new', 10, 5, null::text, 'New', 'Yangi', 'Новый'),
      ('contacted', 20, 15, null::text, 'Contacted', 'Bog‘lanildi', 'Связались'),
      ('qualified', 30, 30, null::text, 'Qualified', 'Mos', 'Квалифицирован'),
      ('trial_booked', 40, 45, null::text, 'Trial booked', 'Sinov rejalashtirilgan', 'Пробный урок назначен'),
      ('trial_attended', 50, 65, null::text, 'Trial attended', 'Sinovga qatnashdi', 'Пробный урок посещен'),
      ('offered', 60, 80, null::text, 'Offered', 'Taklif berildi', 'Предложение сделано'),
      ('won', 70, 100, 'won', 'Won', 'Muvaffaqiyatli', 'Успешно'),
      ('lost', 80, 0, 'lost', 'Lost', 'Yo‘qotilgan', 'Потерян')
    ) as s(stage_key, position, probability, terminal_kind, en_label, uz_label, ru_label)
  loop
    insert into public.academy_pipeline_stages (
      academy_id, pipeline_id, stage_key, label_i18n, position,
      probability_percent, terminal_kind
    ) values (
      p_academy_id,
      v_pipeline_id,
      v_stage.stage_key,
      jsonb_build_object('en', v_stage.en_label, 'uz', v_stage.uz_label, 'ru', v_stage.ru_label),
      v_stage.position,
      v_stage.probability,
      v_stage.terminal_kind
    ) on conflict (academy_id, pipeline_id, stage_key) do nothing;
  end loop;

  insert into public.academy_pipeline_transitions (
    academy_id, pipeline_id, from_stage_id, to_stage_id, requires_reason
  )
  select
    p_academy_id,
    v_pipeline_id,
    fs.id,
    ts.id,
    t.to_key = 'lost'
  from (values
    ('new', 'contacted'),
    ('contacted', 'qualified'),
    ('qualified', 'trial_booked'),
    ('trial_booked', 'trial_attended'),
    ('trial_attended', 'offered'),
    ('offered', 'won'),
    ('contacted', 'new'),
    ('qualified', 'contacted'),
    ('trial_booked', 'qualified'),
    ('trial_attended', 'trial_booked'),
    ('offered', 'trial_attended'),
    ('new', 'lost'),
    ('contacted', 'lost'),
    ('qualified', 'lost'),
    ('trial_booked', 'lost'),
    ('trial_attended', 'lost'),
    ('offered', 'lost')
  ) as t(from_key, to_key)
  join public.academy_pipeline_stages fs
    on fs.academy_id = p_academy_id and fs.pipeline_id = v_pipeline_id and fs.stage_key = t.from_key
  join public.academy_pipeline_stages ts
    on ts.academy_id = p_academy_id and ts.pipeline_id = v_pipeline_id and ts.stage_key = t.to_key
  on conflict (academy_id, pipeline_id, from_stage_id, to_stage_id) do nothing;

  return jsonb_build_object('academy_id', p_academy_id, 'pipeline_id', v_pipeline_id);
end;
$$;

-- Creates the tenant and its first owner membership in one transaction. The
-- Edge function authenticates the actor; this command is service-role only so
-- a failed membership insert cannot leave an orphaned academy behind.

create table public.academy_operational_command_receipts(
 academy_id uuid not null references public.tenants(id) on delete restrict,
 actor_id uuid not null references public.users(id) on delete cascade,
 request_key text not null,command text not null,payload jsonb not null,
 protected_scopes jsonb not null,result jsonb not null,created_at timestamptz not null default now(),
 primary key(academy_id,actor_id,request_key),unique(academy_id,request_key),check(length(request_key) between 1 and 160)
);
alter table public.academy_operational_command_receipts enable row level security;
revoke all on public.academy_operational_command_receipts from public,anon,authenticated;
grant all on public.academy_operational_command_receipts to service_role;
create trigger academy_operational_receipts_immutable before update or delete on public.academy_operational_command_receipts
 for each row execute function public.academy_reject_operational_finance_history_mutation();

create function public.academy_teacher_session_context(p_academy uuid,p_actor uuid,p_session uuid)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='20s' as $$
declare auths jsonb;session public.academy_lesson_sessions;staff public.academy_staff;scope jsonb;
begin
 auths:=public.academy_current_authorities(p_academy,p_actor);
 select * into session from public.academy_lesson_sessions where academy_id=p_academy and id=p_session for update;
 if not found or session.status not in('scheduled','confirmed','in_progress','completed') then raise exception using errcode='42501',message='Choose a current assigned lesson';end if;
 scope:=public.academy_command_resource(p_academy,'classroom',session.classroom_id);
 if not public.academy_command_covers(auths,'viewEducationOS',scope) or not public.academy_command_covers(auths,'markAttendance',scope) then raise exception using errcode='42501',message='Current access does not cover this lesson';end if;
 select s.* into staff from public.academy_staff s join auth.users u on u.id=p_actor
 where s.academy_id=p_academy and s.is_active and(s.user_id=p_actor or(s.user_id is null and u.email_confirmed_at is not null and lower(trim(s.email))=lower(trim(u.email))))
 and(s.id=session.primary_staff_id or exists(select 1 from public.academy_session_staff_assignments a where a.academy_id=p_academy and a.session_id=p_session and a.staff_id=s.id and a.ended_at is null))
 order by(s.user_id=p_actor) desc,s.id limit 1 for share of s;
 if staff.id is null then raise exception using errcode='42501',message='Your active staff profile is not assigned to this lesson';end if;
 return jsonb_build_object('actor_id',p_actor,'academy_id',p_academy,'staff_id',staff.id,'classroom_id',session.classroom_id,'branch_id',session.branch_id,'session_status',session.status,
  'permissions',jsonb_build_object('viewEducationOS',true,'markAttendance',true,'manageAssignments',public.academy_command_covers(auths,'manageAssignments',scope)));
end;$$;
revoke all on function public.academy_teacher_session_context(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.academy_teacher_session_context(uuid,uuid,uuid) to service_role;

create function public.academy_operational_command(p_academy uuid,p_actor uuid,p_command text,p_payload jsonb,p_request_key text)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='35s' as $$
declare auths jsonb;scope jsonb;scopes jsonb:='[]';cap text;intent jsonb:=p_payload->'intent';args jsonb:=p_payload->'server_args';context jsonb;
 previous public.academy_operational_command_receipts;result jsonb;saved jsonb;branch uuid;target uuid;person uuid;phone_key text;duplicate_lead uuid;row_value jsonb;field text;
begin
 if jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(intent) is distinct from 'object' or coalesce(p_request_key,'') !~ '^[A-Za-z0-9_.:-]{1,160}$'
  or p_command not in('create_lead','teacher_lesson_start','teacher_lesson_attendance','teacher_lesson_finish') then raise exception using errcode='22023',message='Review the operational action and retry key';end if;
 auths:=public.academy_current_authorities(p_academy,p_actor);
 perform pg_advisory_xact_lock(hashtextextended('operational-command:'||p_academy::text||':'||p_request_key,0));
 if p_command='create_lead' then
  cap:='manageAdmissions';branch:=nullif(intent->>'branch_id','')::uuid;
  if branch is null then
   select b.id into branch from public.academy_branches b where b.academy_id=p_academy and b.is_active and public.academy_command_covers(auths,cap,jsonb_build_object('kind','branch','branch_id',b.id)) order by b.is_default desc,b.created_at,b.id limit 1 for share;
  end if;
  if branch is null then raise exception using errcode='42501',message='Choose a currently permitted admissions branch';end if;
  scopes:=jsonb_build_array(public.academy_command_resource(p_academy,'branch',branch));
  if nullif(intent->>'preferred_branch_id','') is not null then scopes:=scopes||jsonb_build_array(public.academy_command_resource(p_academy,'branch',(intent->>'preferred_branch_id')::uuid));end if;
 else
  cap:='markAttendance';target:=(intent->>'session_id')::uuid;
  context:=public.academy_teacher_session_context(p_academy,p_actor,target);
  if jsonb_typeof(args) is distinct from 'object' or args->>'p_session_id' is distinct from target::text or args->>'p_staff_id' is distinct from context->>'staff_id'
   or args->>'p_actor_id' is distinct from p_actor::text or args->>'p_academy_id' is distinct from p_academy::text then raise exception using errcode='23505',message='The lesson or staff identity changed; reopen it';end if;
  scopes:=jsonb_build_array(public.academy_command_resource(p_academy,'classroom',(context->>'classroom_id')::uuid));
  if p_command='teacher_lesson_finish' and coalesce((args->>'p_assign_homework')::boolean,true) then
   perform public.academy_assert_current_capability(p_academy,p_actor,'manageAssignments',scopes->0);
  end if;
 end if;
 for scope in select value from jsonb_array_elements(scopes) loop perform public.academy_assert_current_capability(p_academy,p_actor,cap,scope);end loop;
 select * into previous from public.academy_operational_command_receipts where academy_id=p_academy and actor_id=p_actor and request_key=p_request_key;
 if found then
  if previous.command<>p_command or previous.payload is distinct from intent then raise exception using errcode='23505',message='This retry belongs to another operational change';end if;
  for scope in select value from jsonb_array_elements(previous.protected_scopes) loop perform public.academy_assert_current_capability(p_academy,p_actor,cap,scope);end loop;
  return previous.result||'{"replayed":true}';
 end if;
 if p_command<>'create_lead' and context->>'session_status'='completed' then raise exception using errcode='23505',message='This lesson is already complete; refresh its saved record';end if;
 if p_command='create_lead' then
  if coalesce(length(trim(intent->>'full_name')),0) not between 1 and 180 or(coalesce(length(trim(intent->>'phone')),0)=0 and coalesce(length(trim(intent->>'email')),0)=0 and coalesce(length(trim(intent->>'telegram')),0)=0)
   or length(coalesce(intent->>'phone',''))>80 or length(coalesce(intent->>'email',''))>240 or length(coalesce(intent->>'interested_course',''))>180 or length(coalesce(intent->>'preferred_schedule',''))>240 then raise exception using errcode='22023',message='Enter a valid name and contact details';end if;
  foreach field in array array['assigned_user_id','responsible_user_id'] loop
   person:=nullif(intent->>field,'')::uuid;if person is not null then perform public.academy_assert_current_capability(p_academy,person,'viewAdmissions',scopes->0);end if;
  end loop;
  phone_key:=regexp_replace(coalesce(intent->>'phone',''),'[^0-9]','','g');
  if phone_key<>'' then
   perform pg_advisory_xact_lock(hashtextextended('academy-lead-phone:'||p_academy::text||':'||branch::text||':'||phone_key,0));
   select id into duplicate_lead from public.academy_leads where academy_id=p_academy and branch_id=branch and regexp_replace(coalesce(phone,''),'[^0-9]','','g')=phone_key order by created_at,id limit 1;
  end if;
  -- Old pages used unnamespaced keys without a receipt. Never silently create a
  -- second inquiry when a pre-upgrade save with this key already exists.
  if exists(select 1 from public.academy_leads where academy_id=p_academy and idempotency_key=p_request_key) then raise exception using errcode='23505',message='This inquiry was saved before the upgrade; refresh and review it';end if;
  saved:=public.academy_create_lead(p_academy,p_actor,(intent-'metadata')||jsonb_build_object('branch_id',branch),'operational:'||p_actor::text||':'||p_request_key);
  result:=jsonb_build_object('lead',saved,'duplicate_phone',duplicate_lead is not null);
 elsif p_command='teacher_lesson_start' then
  saved:=public.academy_start_teacher_lesson(p_academy,target,p_actor,(context->>'staff_id')::uuid,nullif(args->>'p_course_id','')::uuid,nullif(args->>'p_module_id','')::uuid,nullif(args->>'p_lesson_id','')::uuid,args->'p_plan_snapshot',args->'p_homework_draft',p_request_key);
  result:=jsonb_build_object('run',saved);
 elsif p_command='teacher_lesson_attendance' then
  if jsonb_typeof(args->'p_records') is distinct from 'array' or jsonb_array_length(args->'p_records') not between 1 and 500
   or jsonb_typeof(intent->'records') is distinct from 'array' or jsonb_array_length(intent->'records')<>jsonb_array_length(args->'p_records') then raise exception using errcode='22023',message='Choose between one and 500 attendance rows';end if;
  if(select count(*)<>count(distinct value->>'contact_id') from jsonb_array_elements(args->'p_records')) then raise exception using errcode='22023',message='Each student can appear once in this attendance batch';end if;
  for row_value in select value from jsonb_array_elements(args->'p_records') loop
   if jsonb_typeof(row_value) is distinct from 'object' or coalesce(row_value->>'contact_id','')='' or coalesce(row_value->>'status','') not in('present','absent','late','excused') or length(coalesce(row_value->>'notes',''))>1000 then raise exception using errcode='22023',message='Review each attendance row';end if;
   perform 1 from public.academy_classroom_memberships m join public.academy_contacts c on c.academy_id=m.academy_id and c.id=m.contact_id
    where m.academy_id=p_academy and m.classroom_id=(context->>'classroom_id')::uuid and m.contact_id=(row_value->>'contact_id')::uuid and m.role='student' and m.status in('active','paused','completed') and c.status in('active','trial','paused') for share of m,c;
   if not found then raise exception using errcode='42501',message='An attendance student is outside the current class roster';end if;
  end loop;
  result:=public.academy_record_teacher_attendance_batch(p_academy,target,p_actor,(context->>'staff_id')::uuid,args->'p_records',p_request_key);
 elsif p_command='teacher_lesson_finish' then
  if jsonb_typeof(args->'p_coverage') is distinct from 'array' or jsonb_array_length(args->'p_coverage')>100 or(jsonb_typeof(intent->'coverage')='array' and jsonb_array_length(intent->'coverage')>100) then raise exception using errcode='22023',message='Review at most 100 lesson objectives';end if;
  result:=public.academy_finish_teacher_lesson(p_academy,target,p_actor,(context->>'staff_id')::uuid,args->'p_coverage',args->>'p_teacher_notes',args->'p_homework',coalesce((args->>'p_assign_homework')::boolean,true),p_request_key);
 end if;
 result:=result||jsonb_build_object('actor_id',p_actor,'request_key',p_request_key,'command',p_command,'replayed',false);
 insert into public.academy_operational_command_receipts(academy_id,actor_id,request_key,command,payload,protected_scopes,result)
 values(p_academy,p_actor,p_request_key,p_command,intent,scopes,result);
 for scope in select value from jsonb_array_elements(scopes) loop perform public.academy_assert_current_capability(p_academy,p_actor,cap,scope);end loop;
 if p_command='teacher_lesson_finish' and coalesce((args->>'p_assign_homework')::boolean,true) then perform public.academy_assert_current_capability(p_academy,p_actor,'manageAssignments',scopes->0);end if;
 if p_command<>'create_lead' then perform public.academy_teacher_session_context(p_academy,p_actor,target);end if;
 return result;
end;$$;
revoke all on function public.academy_operational_command(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.academy_operational_command(uuid,uuid,text,jsonb,text) to service_role;
commit;
