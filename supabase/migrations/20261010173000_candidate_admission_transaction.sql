-- Deploy with the reviewed verified-account candidate-entry RPC adapter only.
-- Unreceipted legacy paid inventory must be reconciled before switching callers.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create table public.exam_admission_receipts (
  token_id uuid primary key references public.exam_tokens(id) on delete restrict,
  actor_id uuid not null references public.users(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  experience_id uuid not null references public.experiences(id) on delete restrict,
  session_id uuid not null unique references public.sessions(id) on delete restrict,
  registration_id uuid not null unique references public.exam_registrations(id) on delete restrict,
  voucher_id uuid unique references public.partner_vouchers(id) on delete restrict,
  purchased_terms jsonb not null,
  result jsonb not null,
  committed_at timestamptz not null default now()
);
alter table public.exam_admission_receipts enable row level security;
revoke all on public.exam_admission_receipts from public,anon,authenticated,service_role;
grant select on public.exam_admission_receipts to service_role;

create function public.admit_candidate_exam(p_actor uuid,p_code text,p_first_name text,p_last_name text,p_email text,p_phone text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public
set lock_timeout='3s' set statement_timeout='20s' as $$
<<admission>>
declare token public.exam_tokens%rowtype; voucher public.partner_vouchers%rowtype;
  receipt public.exam_admission_receipts%rowtype; issuance public.voucher_issue_receipts%rowtype;
  exam public.experiences%rowtype; product public.products%rowtype; section uuid;
  payment public.payments%rowtype; paid public.payment_fulfillment_receipts%rowtype;
  target uuid; ids uuid[]; academy uuid; original_scope jsonb; verified_email text;
  terms jsonb; metadata jsonb; outcome jsonb; session_id uuid:=gen_random_uuid(); registration_id uuid:=gen_random_uuid();
  classroom public.academy_classrooms%rowtype; student public.partner_center_students%rowtype; contact public.academy_contacts%rowtype;
  first_name text:=trim(p_first_name); last_name text:=trim(p_last_name); phone text:=trim(p_phone);
begin
  if p_actor is null or p_code is null or p_code !~ '^[A-Z0-9-]{6,90}$'
    or coalesce(length(first_name),0) not between 1 and 100 or coalesce(length(last_name),0) not between 1 and 100
    or coalesce(length(phone),0) not between 1 and 80 or coalesce(length(p_email),0) not between 1 and 320 then
    raise exception using errcode='22023',message='Valid candidate details are required';
  end if;
  select * into token from public.exam_tokens where token_code=p_code;
  if not found then raise exception using errcode='P0002',message='Candidate ID is unavailable'; end if;
  if (select count(*) from public.partner_vouchers where exam_token_id=token.id)>1 then
    raise exception using errcode='23505',message='Candidate inventory requires reconciliation';
  end if;
  select * into voucher from public.partner_vouchers where exam_token_id=token.id;
  select academy_id into academy from public.academy_classrooms where id=voucher.classroom_id;
  original_scope:=jsonb_build_array(token.id,token.tenant_id,token.experience_id,voucher.id,voucher.tenant_id,voucher.classroom_id);
  select array_agg(m.tenant_id) into ids from public.tenant_memberships m join public.tenants t on t.id=m.tenant_id
    where m.user_id=p_actor and m.status='active' and lower(trim(m.role))='owner' and t.type='personal';
  if coalesce(cardinality(ids),0)<>1 then raise exception using errcode='22023',message='Personal account requires review'; end if;
  target:=ids[1];
  -- Consistent tenant-first ordering also covers voucher issue, redemption and finance.
  perform 1 from public.tenants where id in(token.tenant_id,target,academy) order by id for update;
  perform public.assert_payment_checkout_actor(p_actor,target);
  perform 1 from public.tenant_memberships m join public.tenants t on t.id=m.tenant_id
    where m.user_id=p_actor and m.tenant_id=target and m.status='active' and lower(trim(m.role))='owner' and t.type='personal'
    for share of m;
  if not found then raise exception using errcode='42501',message='Personal account is unavailable'; end if;
  select nullif(lower(trim(email)),'') into verified_email from auth.users
    where id=p_actor and email_confirmed_at is not null for share;
  if verified_email is null or verified_email<>lower(trim(p_email)) then
    raise exception using errcode='42501',message='Use your verified account email';
  end if;
  select * into token from public.exam_tokens where token_code=p_code for update;
  if (select count(*) from public.partner_vouchers where exam_token_id=token.id)>1 then
    raise exception using errcode='23505',message='Candidate inventory requires reconciliation';
  end if;
  select * into voucher from public.partner_vouchers where exam_token_id=token.id for update;
  if original_scope is distinct from jsonb_build_array(token.id,token.tenant_id,token.experience_id,voucher.id,voucher.tenant_id,voucher.classroom_id) then
    raise exception using errcode='23505',message='Candidate inventory changed; retry its original reference';
  end if;
  select * into exam from public.experiences where id=token.experience_id and is_active=true for share;
  if not found then raise exception using errcode='22023',message='Exam is unavailable'; end if;
  select * into product from public.products where id=exam.product_id and status='active' for share;
  if not found or coalesce(product.metadata->>'app_url','') not in
    ('https://ielts.schood.online','https://ielts.schood.online/','https://sat.schood.online','https://sat.schood.online/',
     'https://toefl.schood.online','https://toefl.schood.online/','https://itep.schood.online','https://itep.schood.online/') then
    raise exception using errcode='22023',message='Exam service requires review';
  end if;
  select id into section from public.sections where experience_id=exam.id order by display_order,id limit 1 for share;
  if section is null then raise exception using errcode='22023',message='Exam is not ready'; end if;
  select * into receipt from public.exam_admission_receipts where token_id=token.id;
  if found then
    if receipt.actor_id<>p_actor or (receipt.tenant_id,receipt.experience_id,receipt.voucher_id,token.claimed_by,token.uses_count,token.status)
      is distinct from (token.tenant_id,token.experience_id,voucher.id,p_actor,1,'claimed'::text)
      or not exists(select 1 from public.sessions s where s.id=receipt.session_id and s.user_id=p_actor
        and s.token_id=token.id and s.experience_id=exam.id and s.registration_id=receipt.registration_id
        and s.status in('created','active','paused','completed'))
      or (voucher.id is not null and (voucher.status,voucher.redeemed_by,voucher.uses_count) is distinct from ('redeemed'::text,p_actor,1)) then
      raise exception using errcode='42501',message='Candidate session is unavailable for this account or requires review';
    end if;
    return receipt.result||jsonb_build_object('deduped',true);
  end if;
  if token.status<>'active' or token.claimed_by is not null or token.claimed_at is not null or token.uses_count<>0
    or token.max_uses<>1 or token.expires_at<=now() or exists(select 1 from public.sessions where token_id=token.id)
    or exists(select 1 from public.exam_registrations where token_id=token.id) then
    raise exception using errcode='22023',message='Candidate ID is unavailable or requires reconciliation';
  end if;
  if voucher.id is not null then
    if voucher.access_kind<>'mock_exam' or voucher.tenant_id<>token.tenant_id or voucher.code<>token.token_code
      or voucher.experience_id<>exam.id or voucher.product_id<>product.id or voucher.max_uses<>1 or voucher.uses_count<>0
      or voucher.status<>'unused' or voucher.redeemed_by is not null or voucher.redeemed_at is not null or voucher.expires_at<=now() then
      raise exception using errcode='22023',message='Mock voucher requires reconciliation';
    end if;
    if nullif(lower(trim(voucher.assigned_email)),'') is not null and verified_email<>lower(trim(voucher.assigned_email)) then
      raise exception using errcode='42501',message='Voucher is assigned to another verified account';
    end if;
    perform 1 from public.partner_center_profiles where tenant_id=voucher.tenant_id and status='active' for share;
    if not found then raise exception using errcode='42501',message='Center is unavailable'; end if;
    select * into issuance from public.voucher_issue_receipts where batch_id=voucher.batch_id;
    terms:=voucher.metadata->'purchased_terms';
    if not found or issuance.tenant_id<>voucher.tenant_id or terms is distinct from issuance.purchased_terms
      or token.metadata->'purchased_terms' is distinct from terms
      or terms is distinct from jsonb_build_object('experience_id',exam.id,'product_id',product.id,'max_uses',1)
      or not exists(select 1 from public.partner_voucher_batches where id=voucher.batch_id and tenant_id=voucher.tenant_id and status='active') then
      raise exception using errcode='22023',message='Voucher purchase evidence requires reconciliation';
    end if;
  else
    select * into payment from public.payments where id=nullif(token.metadata->>'payment_id','')::uuid;
    select * into paid from public.payment_fulfillment_receipts where payment_id=payment.id;
    if payment.id is null or paid.payment_id is null or payment.status not in('paid','success','completed')
      or payment.purchase_type<>'token_pack' or paid.purchase_type<>'token_pack'
      or (payment.tenant_id,payment.user_id) is distinct from (token.tenant_id,token.created_by)
      or (paid.tenant_id,paid.user_id) is distinct from (payment.tenant_id,payment.user_id)
      or payment.product_id is distinct from product.id
      or nullif(payment.metadata->>'experience_id','')::uuid is distinct from exam.id
      or coalesce((paid.result->>'tokens_created')::integer,0)<1
      or (paid.result->>'tokens_created')::integer is distinct from (payment.metadata->>'quantity')::integer
      or (paid.result->>'tokens_created')::integer<>(select count(*) from public.exam_tokens t where t.metadata->>'payment_id'=payment.id::text) then
      raise exception using errcode='22023',message='Candidate purchase evidence requires reconciliation';
    end if;
    terms:=jsonb_build_object('payment_id',payment.id,'experience_id',exam.id,'product_id',product.id,'max_uses',1);
  end if;
  metadata:=jsonb_build_object('exam_mode','token','strict_mode',true,'launch_kind',case when voucher.id is null then 'candidate_id' else 'center_voucher' end,
    'source','candidate_entry','token_code',token.token_code,'candidate_name',first_name||' '||last_name,'candidate_email',verified_email);
  if voucher.id is not null then
    metadata:=metadata||jsonb_build_object('voucher_id',voucher.id,'voucher_code',voucher.code,'center_tenant_id',voucher.tenant_id,'classroom_id',voucher.classroom_id,
      'partner_voucher',jsonb_build_object('id',voucher.id,'code',voucher.code,'center_tenant_id',voucher.tenant_id,'access_kind','mock_exam','classroom_id',voucher.classroom_id));
  end if;
  insert into public.user_profiles(user_id,first_name,last_name,phone) values(p_actor,first_name,last_name,phone)
    on conflict(user_id) do update set first_name=excluded.first_name,last_name=excluded.last_name,phone=excluded.phone;
  insert into public.sessions(id,user_id,experience_id,status,metadata,token_id) values(session_id,p_actor,exam.id,'created',metadata,token.id);
  insert into public.exam_registrations(id,token_id,tenant_id,experience_id,user_id,session_id,status,first_name,last_name,legal_name,email,phone)
    values(registration_id,token.id,token.tenant_id,exam.id,p_actor,session_id,'registered',first_name,last_name,first_name||' '||last_name,verified_email,phone);
  update public.sessions as s set registration_id=admission.registration_id where s.id=admission.session_id;
  if voucher.id is not null then
    if (select count(*) from public.partner_center_students where tenant_id=voucher.tenant_id and (user_id=p_actor or lower(email)=verified_email))>1 then
      raise exception using errcode='23505',message='Student identity requires review';
    end if;
    select * into student from public.partner_center_students where tenant_id=voucher.tenant_id and (user_id=p_actor or lower(email)=verified_email) for update;
    if student.id is not null and student.user_id is not null and student.user_id<>p_actor then
      raise exception using errcode='23505',message='Student identity requires review';
    end if;
    if student.id is null then
      insert into public.partner_center_students(tenant_id,user_id,full_name,email,phone,status,source_voucher_id,last_activity_at,metadata)
        values(voucher.tenant_id,p_actor,first_name||' '||last_name,verified_email,phone,'active',voucher.id,now(),jsonb_build_object('redeemed_via','candidate-entry'));
    else
      update public.partner_center_students set user_id=p_actor,status='active',source_voucher_id=voucher.id,last_activity_at=now() where id=student.id;
    end if;
    if voucher.classroom_id is not null then
      select * into classroom from public.academy_classrooms where id=voucher.classroom_id and academy_id=academy and is_active=true for share;
      if not found or not exists(select 1 from public.tenants t where t.id=academy and t.metadata @> jsonb_build_object('parent_center_id',voucher.tenant_id,'service_family','academy')) then
        raise exception using errcode='22023',message='Voucher classroom requires review';
      end if;
      if (select count(*) from public.academy_contacts where academy_id=academy and (user_id=p_actor or lower(email)=verified_email))>1 then
        raise exception using errcode='23505',message='Academy identity requires review';
      end if;
      select * into contact from public.academy_contacts where academy_id=academy and (user_id=p_actor or lower(email)=verified_email) for update;
      if contact.id is not null and contact.user_id is not null and contact.user_id<>p_actor then
        raise exception using errcode='23505',message='Academy identity requires review';
      end if;
      if contact.id is null then
        insert into public.academy_contacts(academy_id,user_id,first_name,last_name,email,status,last_activity_at,metadata)
          values(academy,p_actor,first_name,last_name,verified_email,'active',now(),jsonb_build_object('source','partner_voucher_redeem')) returning * into contact;
      else
        update public.academy_contacts set user_id=p_actor,status='active',last_activity_at=now() where id=contact.id;
      end if;
      insert into public.academy_classroom_memberships(academy_id,classroom_id,contact_id,role,metadata)
        values(academy,classroom.id,contact.id,'student',jsonb_build_object('source','partner_voucher_redeem','voucher_id',voucher.id))
        on conflict(classroom_id,contact_id) do nothing;
    end if;
    update public.partner_vouchers set status='redeemed',redeemed_by=p_actor,redeemed_at=now(),uses_count=1,
      metadata=partner_vouchers.metadata||jsonb_build_object('redeemed_via','candidate-entry') where id=voucher.id;
  end if;
  update public.exam_tokens set status='claimed',claimed_by=p_actor,claimed_at=now(),uses_count=1 where id=token.id;
  outcome:=jsonb_build_object('actor_id',p_actor,'session_id',session_id,'experience_id',exam.id,'first_section_id',section,'product_id',product.id,
    'product_slug',product.metadata->>'slug','app_url',product.metadata->>'app_url','strict_mode',true,'deduped',false,
    'launch_kind',case when voucher.id is null then 'candidate_id' else 'center_voucher' end,
    'voucher_id',voucher.id,'voucher_code',voucher.code,'center_tenant_id',voucher.tenant_id,'classroom_id',voucher.classroom_id);
  insert into public.exam_admission_receipts(token_id,actor_id,tenant_id,experience_id,session_id,registration_id,voucher_id,purchased_terms,result)
    values(token.id,p_actor,token.tenant_id,exam.id,session_id,registration_id,voucher.id,terms,outcome);
  return outcome;
end; $$;
revoke all on function public.admit_candidate_exam(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.admit_candidate_exam(uuid,text,text,text,text,text) to service_role;

create function public.enforce_exam_admission_identity() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_table_name='exam_tokens' and exists(select 1 from public.exam_admission_receipts where token_id=old.id) then
    if tg_op='DELETE' or (old.id,old.token_code,old.tenant_id,old.experience_id,old.created_by,old.claimed_by,old.claimed_at,old.uses_count,old.max_uses,
      old.metadata->'payment_id',old.metadata->'purchased_terms') is distinct from
      (new.id,new.token_code,new.tenant_id,new.experience_id,new.created_by,new.claimed_by,new.claimed_at,new.uses_count,new.max_uses,
       new.metadata->'payment_id',new.metadata->'purchased_terms') or new.status='active' then
      raise exception using errcode='23514',message='Exam admission identity is immutable';
    end if;
  elsif tg_table_name='sessions' and exists(select 1 from public.exam_admission_receipts where session_id=old.id) then
    if tg_op='DELETE' or (old.id,old.user_id,old.experience_id,old.token_id,old.registration_id) is distinct from
      (new.id,new.user_id,new.experience_id,new.token_id,new.registration_id) then
      raise exception using errcode='23514',message='Exam session identity is immutable';
    end if;
  elsif tg_table_name='exam_registrations' and exists(select 1 from public.exam_admission_receipts where registration_id=old.id) then
    if tg_op='DELETE' or (old.id,old.token_id,old.tenant_id,old.experience_id,old.user_id,old.session_id) is distinct from
      (new.id,new.token_id,new.tenant_id,new.experience_id,new.user_id,new.session_id) then
      raise exception using errcode='23514',message='Exam registration identity is immutable';
    end if;
  elsif tg_table_name='partner_vouchers' and exists(select 1 from public.exam_admission_receipts where voucher_id=old.id) then
    if tg_op='DELETE' or (old.id,old.redeemed_by,old.redeemed_at,old.uses_count) is distinct from
      (new.id,new.redeemed_by,new.redeemed_at,new.uses_count) or new.status='unused' then
      raise exception using errcode='23514',message='Mock voucher admission identity is immutable';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
create trigger exam_token_admission_identity before update or delete on public.exam_tokens
  for each row execute function public.enforce_exam_admission_identity();
create trigger exam_session_admission_identity before update or delete on public.sessions
  for each row execute function public.enforce_exam_admission_identity();
create trigger exam_registration_admission_identity before update or delete on public.exam_registrations
  for each row execute function public.enforce_exam_admission_identity();
create trigger exam_voucher_admission_identity before update or delete on public.partner_vouchers
  for each row execute function public.enforce_exam_admission_identity();
revoke all on function public.enforce_exam_admission_identity() from public,anon,authenticated,service_role;
commit;
