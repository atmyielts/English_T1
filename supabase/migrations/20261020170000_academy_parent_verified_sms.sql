-- SMS destinations come only from the current confirmed Auth phone binding.
-- Provider configuration and delivery happen after the consent claim.
begin;
do $migration$
declare body text;anchor text;addition text;
begin
 select replace(pg_get_functiondef('public.academy_guardian_delivery_claim(uuid)'::regprocedure),E'\r\n',E'\n') into body;
 anchor:=$anchor$elsif n.channel='sms' then reason:='parent_sms_not_configured';$anchor$;
 addition:=$change$elsif n.channel='sms' then
  if g.user_id is null or not exists(select 1 from auth.users a where a.id=g.user_id and a.deleted_at is null
    and a.phone_confirmed_at is not null and public.academy_normalize_phone(a.phone)=g.phone_normalized) then reason:='parent_phone_not_verified';end if;
  destination:=g.phone_normalized;
$change$;
 if length(body)-length(replace(body,anchor,''))<>length(anchor) then raise exception 'Installed parent SMS claim differs; review the retained body';end if;
 execute replace(body,anchor,addition);
end;
$migration$;
commit;
