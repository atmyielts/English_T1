-- Retain the installed financial command body while binding each adjustment
-- subtype to the independent permission used for every replay/final check.
begin;
do $migration$
declare definition text;marker text:=$marker$ if p_command='transition_payroll' then cap:=$marker$;
 replacement text:=$replacement$ if p_command='post_account_adjustment' then
  cap:=case lower(trim(m->>'entry_type')) when 'refund' then 'refundFinance' when 'discount' then 'discountFinance' else 'adjustFinance' end;
 end if;
 if p_command='transition_payroll' then cap:=$replacement$;
begin
 definition:=pg_get_functiondef('public.academy_finance_command(uuid,uuid,text,jsonb,text)'::regprocedure);
 if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1
  or definition like '%cap:=case lower(trim(m->>''entry_type''))%'
  or definition not like '%previous.protected_scopes%'
  or definition not like '%academy_assert_current_capability(p_academy_id,p_actor_id,cap,scope)%' then
  raise exception 'Financial command changed; review its current definition before applying subtype authority';
 end if;
 execute replace(definition,marker,replacement);
end;$migration$;
commit;
