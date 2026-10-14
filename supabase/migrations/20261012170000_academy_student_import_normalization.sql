-- Shared deterministic normalization for preview and transaction-time revalidation.
-- No contact, guardian, membership, payment, or entitlement writes occur here.
create or replace function public.academy_student_import_phone(p_value text)
returns text language plpgsql immutable set search_path=public as $$
declare v_text text:=trim(p_value);v_digits text;
begin
 if nullif(v_text,'') is null or length(v_text)>80 or v_text !~ '^\+?[0-9 ()-]+$' then return null;end if;
 v_digits:=regexp_replace(v_text,'[^0-9]','','g');
 if left(v_text,1)='+' then null;
 elsif length(v_digits)=9 then v_digits:='998'||v_digits;
 elsif length(v_digits)=12 and left(v_digits,3)='998' then null;
 elsif length(v_digits)=13 and left(v_digits,4)='0998' then v_digits:=substring(v_digits from 2);
 elsif left(v_digits,2)='00' then v_digits:=substring(v_digits from 3);
 else return null;end if;
 if v_digits !~ '^[1-9][0-9]{6,14}$' or (left(v_digits,3)='998' and length(v_digits)<>12) then return null;end if;
 return '+'||v_digits;
end;$$;
revoke all on function public.academy_student_import_phone(text) from public,anon,authenticated,service_role;

create or replace function public.academy_normalize_student_import_row(p_mapped jsonb,p_settings jsonb)
returns jsonb language plpgsql immutable set search_path=public as $$
declare
 v_errors jsonb:='[]';v_normal jsonb:='{}';v_key text;v_value text;v_first text;v_last text;v_full text;
 v_phone text;v_parent text;v_group text;v_email text;v_amount numeric:=0;v_ledger bigint;
 v_date_text text;v_date date;v_format text:=p_settings->>'date_format';v_parts text[];v_year integer;v_month integer;v_day integer;
begin
 if jsonb_typeof(p_mapped) is distinct from 'object' or jsonb_typeof(p_settings) is distinct from 'object' then
  raise exception 'Mapped import row and settings are required';end if;
 if v_format is null or v_format not in('iso','day_first','month_first')
  or (p_settings->>'balance_convention') is null or (p_settings->>'balance_convention') not in('credit_positive','debt_positive')
  or (p_settings->>'currency') is null or (p_settings->>'currency') !~ '^[A-Z]{3}$' then
  raise exception 'Validated import format settings are required';end if;
 -- Numeric phone/balance values arrived through JSON; unsafe floating point
 -- integers cannot recover a spreadsheet's original digits. Require exact text.
 foreach v_key in array array['phone','parent_phone','balance'] loop
  if jsonb_typeof(p_mapped->v_key)='number' and
   (abs((p_mapped->>v_key)::numeric)>9007199254740991 or (p_mapped->>v_key)::numeric<>trunc((p_mapped->>v_key)::numeric)) then
   v_errors:=v_errors||jsonb_build_array(v_key||'_unsafe_number');end if;
 end loop;
 foreach v_key in array array['full_name','first_name','last_name','phone','email','parent_phone','parent_name','group_name','balance','joined_on'] loop
  if coalesce(jsonb_typeof(p_mapped->v_key),'null') not in('string','number','null') then
   v_errors:=v_errors||jsonb_build_array(v_key||'_invalid_type');end if;
 end loop;
 v_first:=nullif(trim(p_mapped->>'first_name'),'');v_last:=coalesce(nullif(trim(p_mapped->>'last_name'),''),'');v_full:=nullif(trim(p_mapped->>'full_name'),'');
 if v_first is null then v_first:=v_full;end if;
 if v_first is null or length(v_first)>180 or length(v_last)>180 or coalesce(length(v_full),0)>360
  or coalesce(v_first,'') ~ '^[0-9[:space:][:punct:]]+$'
  or coalesce(v_first,'') ~ '[[:cntrl:]]' or v_last ~ '[[:cntrl:]]' then v_errors:=v_errors||'"name_invalid"'::jsonb;end if;
 -- When a full name is the only name column, retain it intact. Never guess
 -- which word is a surname or discard patronymics and multilingual names.
 v_normal:=jsonb_build_object('first_name',v_first,'last_name',v_last,'source_full_name',v_full);
 v_phone:=public.academy_student_import_phone(p_mapped->>'phone');
 if v_phone is null then v_errors:=v_errors||'"phone_invalid"'::jsonb;end if;
 v_parent:=public.academy_student_import_phone(p_mapped->>'parent_phone');
 if nullif(trim(p_mapped->>'parent_phone'),'') is not null and v_parent is null then v_errors:=v_errors||'"parent_phone_invalid"'::jsonb;end if;
 v_value:=nullif(trim(p_mapped->>'parent_name'),'');
 if coalesce(length(v_value),0)>360 or coalesce(v_value,'') ~ '[[:cntrl:]]' then v_errors:=v_errors||'"parent_name_invalid"'::jsonb;end if;
 if v_value is not null and v_parent is null then v_errors:=v_errors||'"parent_phone_required"'::jsonb;end if;
 v_normal:=v_normal||jsonb_build_object('phone',v_phone,'parent_phone',v_parent,'parent_name',v_value);
 v_email:=nullif(lower(trim(p_mapped->>'email')),'');
 if v_email is not null and (length(v_email)>320 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then v_errors:=v_errors||'"email_invalid"'::jsonb;end if;
 v_group:=nullif(trim(p_mapped->>'group_name'),'');
 if coalesce(length(v_group),0)>180 or coalesce(v_group,'') ~ '[[:cntrl:]]' then v_errors:=v_errors||'"group_name_invalid"'::jsonb;end if;
 v_normal:=v_normal||jsonb_build_object('email',v_email,'group_name',v_group);
 v_value:=nullif(trim(replace(replace(p_mapped->>'balance',chr(160),' '),chr(8239),' ')),'');
 if v_value is not null then
  -- Grouped thousands must be consistent. Decimals, exponent notation and
  -- currency suffixes are rejected instead of truncated or guessed.
  if length(v_value)>40 or v_value !~ '^[-+]?[0-9]+$|^[-+]?[0-9]{1,3}(,[0-9]{3})+$|^[-+]?[0-9]{1,3}( [0-9]{3})+$' then
   v_errors:=v_errors||'"balance_invalid_integer"'::jsonb;
  else
   v_amount:=replace(replace(v_value,',',''),' ','')::numeric;
   if abs(v_amount)>9223372036854775807 then v_errors:=v_errors||'"balance_out_of_range"'::jsonb;end if;
  end if;
 end if;
 if abs(v_amount)<=9223372036854775807 then
  v_ledger:=(case when p_settings->>'balance_convention'='credit_positive' then -v_amount else v_amount end)::bigint;
 end if;
 -- Store exact integers as JSON strings so the browser never rounds bigint.
 v_normal:=v_normal||jsonb_build_object('source_balance',v_amount::text,'ledger_amount',v_ledger::text,'currency',p_settings->>'currency');
 v_date_text:=nullif(trim(p_mapped->>'joined_on'),'');
 if v_date_text is null then
  begin v_date:=(p_settings->>'as_of_date')::date;exception when others then v_date:=null;end;
  if v_date is null then raise exception 'A frozen branch-local import date is required';end if;
 else
  -- ISO from an Excel Date is unambiguous and accepted for every source format.
  if v_date_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
   v_parts:=string_to_array(v_date_text,'-');v_year:=v_parts[1]::integer;v_month:=v_parts[2]::integer;v_day:=v_parts[3]::integer;
  elsif v_format in('day_first','month_first') and v_date_text ~ '^[0-9]{1,2}([./-])[0-9]{1,2}\1[0-9]{4}$' then
   v_parts:=regexp_split_to_array(v_date_text,'[./-]');v_year:=v_parts[3]::integer;
   v_month:=(case when v_format='day_first' then v_parts[2] else v_parts[1] end)::integer;
   v_day:=(case when v_format='day_first' then v_parts[1] else v_parts[2] end)::integer;
  else v_errors:=v_errors||'"join_date_format_invalid"'::jsonb;end if;
  if v_year is not null then
   begin v_date:=make_date(v_year,v_month,v_day);exception when datetime_field_overflow then v_errors:=v_errors||'"join_date_invalid"'::jsonb;end;
  end if;
 end if;
 v_normal:=v_normal||jsonb_build_object('joined_on',v_date::text);
 return jsonb_build_object('normalized',v_normal,'errors',v_errors);
end;$$;
revoke all on function public.academy_normalize_student_import_row(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.academy_normalize_student_import_row(jsonb,jsonb) to service_role;
