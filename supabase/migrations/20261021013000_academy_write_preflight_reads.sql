begin;
set local lock_timeout='5s';
-- GET preflight reads may belong to a write action. Its actual mutation still
-- runs with the original locked current-authority helper in a read-write TX.
do $migration$
declare source text;body text;anchor text:='if v_mode=''read'' and current_setting(''transaction_read_only'')=''on'' then';
begin
 select p.prosrc,pg_get_functiondef(p.oid) into body,source from pg_proc p where p.oid='public.academy_legacy_boundary_context(boolean)'::regprocedure;
 if encode(extensions.digest(convert_to(replace(body,chr(13)||chr(10),chr(10)),'UTF8'),'sha256'),'hex')<>'ce98d8f30c39cccd9d29fa7a8b38e0efa78594140af6755229de0426e01342fa' then raise exception 'Legacy context drifted from its qualified installed body';end if;
 if length(source)-length(replace(source,anchor,''))<>length(anchor) then raise exception 'Read-only context anchor changed';end if;
 source:=replace(source,anchor,'if current_setting(''transaction_read_only'')=''on'' then');
 execute source;
end;$migration$;
notify pgrst,'reload schema';
commit;
