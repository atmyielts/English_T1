begin;
-- Image geometry is immutable public question content. Accepted regions and
-- label answers remain in private assessment_item_keys, never candidate forms.
create function public.assessment_image_coordinate(p_value jsonb) returns boolean language plpgsql immutable set search_path=public,pg_temp as $$declare n numeric;begin
 if jsonb_typeof(p_value) is distinct from 'number' then return false;end if;
 n:=(p_value#>>'{}')::numeric;return n between 0 and 1 and trunc(n,6)=n;
end;$$;
create function public.assessment_image_cross(a jsonb,b jsonb,c jsonb) returns double precision language sql immutable as $$
 select ((b->>'x')::double precision-(a->>'x')::double precision)*((c->>'y')::double precision-(a->>'y')::double precision)-((b->>'y')::double precision-(a->>'y')::double precision)*((c->>'x')::double precision-(a->>'x')::double precision);
$$;
create function public.assessment_image_on_segment(a jsonb,b jsonb,p jsonb) returns boolean language sql immutable as $$
 select abs(public.assessment_image_cross(a,b,p))<=1e-12 and (p->>'x')::double precision between least((a->>'x')::double precision,(b->>'x')::double precision)-1e-12 and greatest((a->>'x')::double precision,(b->>'x')::double precision)+1e-12 and (p->>'y')::double precision between least((a->>'y')::double precision,(b->>'y')::double precision)-1e-12 and greatest((a->>'y')::double precision,(b->>'y')::double precision)+1e-12;
$$;
create function public.assessment_image_region_valid(p_region jsonb) returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare points jsonb;n integer;i integer;j integer;area double precision:=0;a jsonb;b jsonb;c jsonb;d jsonb;cross1 double precision;cross2 double precision;cross3 double precision;cross4 double precision;field text;
begin
 if jsonb_typeof(p_region) is distinct from 'object' then return false;end if;
 if p_region->>'shape'='rectangle' then
  foreach field in array array['x1','y1','x2','y2'] loop if not public.assessment_image_coordinate(p_region->field) then return false;end if;end loop;
  return (p_region->>'x1')::numeric<(p_region->>'x2')::numeric and (p_region->>'y1')::numeric<(p_region->>'y2')::numeric;
 elsif p_region->>'shape'='ellipse' then
  foreach field in array array['x','y','radius_x','radius_y'] loop if not public.assessment_image_coordinate(p_region->field) then return false;end if;end loop;
  return (p_region->>'radius_x')::numeric>0 and (p_region->>'radius_y')::numeric>0
   and (p_region->>'x')::numeric-(p_region->>'radius_x')::numeric>=0 and (p_region->>'x')::numeric+(p_region->>'radius_x')::numeric<=1
   and (p_region->>'y')::numeric-(p_region->>'radius_y')::numeric>=0 and (p_region->>'y')::numeric+(p_region->>'radius_y')::numeric<=1;
 elsif p_region->>'shape'='polygon' then
  points:=p_region->'points';if jsonb_typeof(points) is distinct from 'array' then return false;end if;n:=jsonb_array_length(points);
  if n not between 3 and 32 then return false;end if;
  for a in select value from jsonb_array_elements(points) loop
   if jsonb_typeof(a) is distinct from 'object' or not public.assessment_image_coordinate(a->'x') or not public.assessment_image_coordinate(a->'y') then return false;end if;
  end loop;
  if (select count(distinct jsonb_build_array(value->'x',value->'y')) from jsonb_array_elements(points))<>n then return false;end if;
  for i in 0..n-1 loop
   a:=points->i;b:=points->((i+1)%n);
   area:=area+(a->>'x')::double precision*(b->>'y')::double precision-(b->>'x')::double precision*(a->>'y')::double precision;
   if public.assessment_image_on_segment(points->((i+n-1)%n),b,a) then return false;end if;
   for j in i+1..n-1 loop
    if j=i+1 or (i=0 and j=n-1) then continue;end if;
    c:=points->j;d:=points->((j+1)%n);
    cross1:=public.assessment_image_cross(a,b,c);cross2:=public.assessment_image_cross(a,b,d);cross3:=public.assessment_image_cross(c,d,a);cross4:=public.assessment_image_cross(c,d,b);
    if (cross1*cross2<0 and cross3*cross4<0) or public.assessment_image_on_segment(a,b,c) or public.assessment_image_on_segment(a,b,d) or public.assessment_image_on_segment(c,d,a) or public.assessment_image_on_segment(c,d,b) then return false;end if;
   end loop;
  end loop;
  return abs(area)>1e-12;
 end if;return false;
end;$$;
create function public.assessment_image_item_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare interaction jsonb;anchor jsonb;labels jsonb;kind text:=new.payload->>'type';
begin
 if kind not in('diagram_labeling','hotspot') then
  if new.payload ? 'image_response' then raise exception 'unexpected_image_interaction' using errcode='23514';end if;return new;
 end if;
 interaction:=new.payload->'image_response';
 if jsonb_typeof(interaction) is distinct from 'object' or interaction->>'schema_version' is distinct from 'assessment.image-response.v1'
  or exists(select 1 from jsonb_object_keys(interaction) key where key not in('schema_version','artifact_id','anchors'))
  or not exists(select 1 from jsonb_array_elements(new.payload->'media') asset where asset->>'kind'='image' and asset->>'artifact_id'=interaction->>'artifact_id')
 then raise exception 'invalid_image_interaction' using errcode='23514';end if;
 if kind='hotspot' then
  if interaction ? 'anchors' then raise exception 'private_hotspot_targets_not_public' using errcode='23514';end if;
 else
  labels:=new.payload->'response_ids';
  if jsonb_typeof(labels) is distinct from 'array' or jsonb_typeof(interaction->'anchors') is distinct from 'array' then raise exception 'diagram_anchors_required' using errcode='23514';end if;
  if jsonb_array_length(labels) not between 1 and 100 or jsonb_array_length(interaction->'anchors')<>jsonb_array_length(labels)
   or (select count(distinct value->>'response_id') from jsonb_array_elements(interaction->'anchors'))<>jsonb_array_length(labels)
  then raise exception 'diagram_anchor_binding_mismatch' using errcode='23514';end if;
  for anchor in select value from jsonb_array_elements(interaction->'anchors') loop
   if jsonb_typeof(anchor) is distinct from 'object' or not(labels ? (anchor->>'response_id')) or not public.assessment_image_coordinate(anchor->'x') or not public.assessment_image_coordinate(anchor->'y')
    or exists(select 1 from jsonb_object_keys(anchor) key where key not in('response_id','x','y')) then raise exception 'invalid_diagram_anchor' using errcode='23514';end if;
  end loop;
 end if;return new;
end;$$;
create trigger image_item_guard before insert or update of payload on public.assessment_item_versions for each row execute function public.assessment_image_item_guard();
create function public.assessment_image_key_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$declare item jsonb;region jsonb;field text;answer jsonb;begin
 select payload into item from public.assessment_item_versions where tenant_id=new.tenant_id and id=new.item_version_id;
 if item->>'type'='hotspot' then
  if jsonb_typeof(new.key->'hotspot'->'regions') is distinct from 'array' then raise exception 'hotspot_regions_required' using errcode='23514';end if;
  if jsonb_array_length(new.key->'hotspot'->'regions') not between 1 and 20 then raise exception 'invalid_hotspot_region_count' using errcode='23514';end if;
  for region in select value from jsonb_array_elements(new.key->'hotspot'->'regions') loop if not public.assessment_image_region_valid(region) then raise exception 'invalid_hotspot_region' using errcode='23514';end if;end loop;
 elsif item->>'type'='diagram_labeling' then
  if jsonb_typeof(new.key->'correct') is distinct from 'object' then raise exception 'diagram_answer_key_required' using errcode='23514';end if;
  if (select count(*) from jsonb_object_keys(new.key->'correct'))<>jsonb_array_length(item->'response_ids') then raise exception 'diagram_key_binding_mismatch' using errcode='23514';end if;
  for field,answer in select * from jsonb_each(new.key->'correct') loop
   if not(item->'response_ids' ? field) then raise exception 'diagram_key_binding_mismatch' using errcode='23514';end if;
   if jsonb_typeof(answer)='string' then
    if length(trim(answer#>>'{}')) not between 1 and 1000 then raise exception 'invalid_diagram_answer_key' using errcode='23514';end if;
   elsif jsonb_typeof(answer)='array' then
    if jsonb_array_length(answer) not between 1 and 50 or (select count(distinct value) from jsonb_array_elements(answer))<>jsonb_array_length(answer)
     or exists(select 1 from jsonb_array_elements(answer) entry where jsonb_typeof(entry) is distinct from 'string' or length(trim(entry#>>'{}')) not between 1 and 1000) then raise exception 'invalid_diagram_answer_key' using errcode='23514';end if;
   else raise exception 'invalid_diagram_answer_key' using errcode='23514';end if;
  end loop;
 end if;return new;
end;$$;
create trigger image_key_guard before insert or update on public.assessment_item_keys for each row execute function public.assessment_image_key_guard();
create function public.assessment_image_response_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$declare item jsonb;field text;answer jsonb;begin
 select payload into item from public.assessment_item_versions where tenant_id=new.tenant_id and id=new.item_version_id;
 if new.response='null'::jsonb then return new;end if;
 if item->>'type'='hotspot' then
  if jsonb_typeof(new.response) is distinct from 'object' or new.response->>'schema_version' is distinct from 'assessment.image-point.v1' or not public.assessment_image_coordinate(new.response->'x') or not public.assessment_image_coordinate(new.response->'y') then raise exception 'invalid_image_point' using errcode='23514';end if;
  if exists(select 1 from jsonb_object_keys(new.response) key where key not in('schema_version','x','y')) then raise exception 'unexpected_image_point_fields' using errcode='23514';end if;
 elsif item->>'type'='diagram_labeling' then
  if jsonb_typeof(new.response) is distinct from 'object' then raise exception 'invalid_diagram_response' using errcode='23514';end if;
  for field,answer in select * from jsonb_each(new.response) loop
   if not(item->'response_ids' ? field) or jsonb_typeof(answer) is distinct from 'string' or length(answer#>>'{}')>1000 then raise exception 'invalid_diagram_response' using errcode='23514';end if;
  end loop;
 end if;return new;
end;$$;
create trigger image_response_guard before insert on public.assessment_response_journal for each row execute function public.assessment_image_response_guard();
revoke all on function public.assessment_image_coordinate(jsonb),public.assessment_image_cross(jsonb,jsonb,jsonb),public.assessment_image_on_segment(jsonb,jsonb,jsonb),public.assessment_image_region_valid(jsonb),public.assessment_image_item_guard(),public.assessment_image_key_guard(),public.assessment_image_response_guard() from public,anon,authenticated,service_role;
commit;
