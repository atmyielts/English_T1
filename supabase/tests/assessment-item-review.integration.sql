\set ON_ERROR_STOP on
begin;
do $$ declare t uuid:='10000000-0000-4000-8000-000000000001';author uuid:='00000000-0000-4000-8000-000000000001';reviewer uuid:='00000000-0000-4000-8000-000000000002';candidate uuid:='00000000-0000-4000-8000-000000000003';
 bank uuid;v1 uuid;v2 uuid;item uuid;result jsonb;hash text:=repeat('a',64);payload jsonb:='{"schema_version":"assessment.item.v1","type":"single_choice","locale":"en","prompt":"Review workflow question","max_score":1,"tags":[],"options":[{"id":"a","text":"Yes"},{"id":"b","text":"No"}]}';
begin
 select id into bank from assessment_item_banks where title='Grading bank';
 result:=assessment_command(author,t,'review-create-0001','item.create',jsonb_build_object('bank_id',bank,'item',payload,'key','{"correct":"a"}'::jsonb));v1:=(result->>'id')::uuid;item:=(result->>'item_id')::uuid;
 -- Comments: staff with question rights only, on open versions only.
 begin perform assessment_command(candidate,t,'review-comment-cand','item.comment',jsonb_build_object('id',v1,'body','x'));raise exception 'Candidate commented';exception when insufficient_privilege then null;end;
 result:=assessment_command(author,t,'review-comment-0001','item.comment',jsonb_build_object('id',v1,'area','prompt','body','Draft note: check the wording.'));
 if result->>'status'<>'draft' or assessment_command(author,t,'review-comment-0001','item.comment',jsonb_build_object('id',v1,'area','prompt','body','Draft note: check the wording.'))<>result then raise exception 'Comment receipt changed';end if;
 begin perform assessment_command(author,t,'review-comment-0001','item.comment',jsonb_build_object('id',v1,'body','Different')); raise exception 'Key reuse accepted';exception when unique_violation then null;end;
 begin perform assessment_command(author,t,'review-comment-area','item.comment',jsonb_build_object('id',v1,'area','layout','body','x'));raise exception 'Unknown area accepted';exception when invalid_parameter_value then null;end;
 begin perform assessment_command(author,t,'review-comment-empty','item.comment',jsonb_build_object('id',v1,'body','   '));raise exception 'Empty comment accepted';exception when invalid_parameter_value then null;end;
 -- A change request needs an independent reviewer and a version in review.
 begin perform assessment_command(reviewer,t,'review-changes-draft','item.request_changes',jsonb_build_object('id',v1,'body','x','review_hash',hash));raise exception 'Draft change request accepted';exception when check_violation then null;end;
 perform assessment_command(author,t,'review-submit-0001','item.submit',jsonb_build_object('id',v1));
 begin perform assessment_command(author,t,'review-changes-self','item.request_changes',jsonb_build_object('id',v1,'body','x','review_hash',hash));raise exception 'Author requested own changes';exception when check_violation then if sqlerrm<>'reviewer_must_differ_from_author' then raise;end if;end;
 begin perform assessment_command(reviewer,t,'review-changes-nohash','item.request_changes',jsonb_build_object('id',v1,'body','x'));raise exception 'Unreviewed change request accepted';exception when invalid_parameter_value then null;end;
 result:=assessment_command(reviewer,t,'review-changes-0001','item.request_changes',jsonb_build_object('id',v1,'area','key','body','Option b is also defensible; clarify the prompt.','review_hash',hash));
 if result->>'status'<>'changes_requested' or (select status from assessment_item_versions where id=v1)<>'changes_requested' then raise exception 'Change request not recorded';end if;
 -- A version with requested changes can be neither approved nor reopened.
 begin perform assessment_command(reviewer,t,'review-approve-closed','item.approve',jsonb_build_object('id',v1));raise exception 'Approved a version with requested changes';exception when check_violation then null;end;
 begin update assessment_item_versions set status='review' where id=v1;raise exception 'Reopened version';exception when check_violation then null;end;
 -- Revisions are fenced to the latest version; a lost reply replays.
 result:=assessment_command(author,t,'review-revise-0001','item.revise',jsonb_build_object('item_id',item,'base_version_id',v1,'item',jsonb_set(payload,'{prompt}','"Review workflow question, clarified"'),'key','{"correct":"a"}'::jsonb));v2:=(result->>'id')::uuid;
 if result->>'version'<>'2' or assessment_command(author,t,'review-revise-0001','item.revise',jsonb_build_object('item_id',item,'base_version_id',v1,'item',jsonb_set(payload,'{prompt}','"Review workflow question, clarified"'),'key','{"correct":"a"}'::jsonb))<>result then raise exception 'Revision replay changed';end if;
 begin perform assessment_command(reviewer,t,'review-revise-stale','item.revise',jsonb_build_object('item_id',item,'base_version_id',v1,'item',payload,'key','{"correct":"b"}'::jsonb));raise exception 'Stale revision accepted';exception when unique_violation then if sqlerrm<>'item_revision_conflict' then raise;end if;end;
 begin perform assessment_command(author,t,'review-revise-foreign','item.revise',jsonb_build_object('item_id',item,'base_version_id',(select id from assessment_item_versions where item_id<>item limit 1),'item',payload,'key','{"correct":"a"}'::jsonb));raise exception 'Foreign base accepted';exception when no_data_found then null;end;
 perform assessment_command(author,t,'review-submit-0002','item.submit',jsonb_build_object('id',v2));
 perform assessment_command(reviewer,t,'review-comment-0002','item.comment',jsonb_build_object('id',v2,'body','The clarified prompt resolves the ambiguity.'));
 perform assessment_command(reviewer,t,'review-approve-0002','item.approve',jsonb_build_object('id',v2));
 begin perform assessment_command(reviewer,t,'review-comment-closed','item.comment',jsonb_build_object('id',v2,'body','late'));raise exception 'Commented on approved version';exception when check_violation then if sqlerrm<>'item_review_closed' then raise;end if;end;
 -- History is append-only and complete.
 if (select string_agg(kind||':'||area,',' order by created_at,id) from assessment_item_review_comments where item_id=item)<>'comment:prompt,changes_requested:key,comment:general' then raise exception 'Review history wrong';end if;
 begin update assessment_item_review_comments set body='edited' where item_id=item;raise exception 'Comment edited';exception when check_violation then null;end;
 begin delete from assessment_item_review_comments where item_id=item;raise exception 'Comment deleted';exception when check_violation then null;end;
 if (select count(*) from assessment_audit_events where action in('item.comment','item.request_changes') and target_id in(v1,v2))<>3 then raise exception 'Review audit missing';end if;
 if has_table_privilege('authenticated','public.assessment_item_review_comments','select') or has_table_privilege('anon','public.assessment_item_review_comments','select') then raise exception 'Comments exposed to clients';end if;
end $$;
rollback;
