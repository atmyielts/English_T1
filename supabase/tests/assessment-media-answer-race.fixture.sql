do $$declare t uuid:='10000000-0000-4000-8000-000000000001';owner uuid:='00000000-0000-4000-8000-000000000001';candidate uuid:='00000000-0000-4000-8000-000000000003';ver uuid;form jsonb;win uuid;reg uuid;aid uuid;begin
 select assessment_version_id,manifest into ver,form from public.assessment_forms where manifest->>'title'='Academic media' limit 1;
 if ver is null then raise exception 'Canonical academic media fixture missing';end if;
 win:=(public.assessment_command(owner,t,'answer-race-window','window.create',jsonb_build_object('assessment_version_id',ver,'title','Academic answer admission race','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '1 hour'))->>'id')::uuid;
 reg:=(public.assessment_command(owner,t,'answer-race-registration','registration.create',jsonb_build_object('window_id',win,'candidate_id',candidate))->>'id')::uuid;
 aid:=(public.assessment_command(candidate,t,'answer-race-attempt','attempt.start',jsonb_build_object('registration_id',reg,'manifest',form,'manifest_hash',repeat('f',64)))->>'id')::uuid;
 perform public.assessment_runtime_command(candidate,t,'answer-race-device','lease.acquire',jsonb_build_object('attempt_id',aid,'device_id',candidate,'token_hash',repeat('a',64)));
end;$$;
