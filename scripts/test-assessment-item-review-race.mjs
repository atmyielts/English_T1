/** Question review races. Four revisions from the same base version: exactly
 * one becomes the next version and three are refused as conflicts. Then an
 * approval and three change requests race on one version in review: exactly one
 * decision is recorded. Disposable local test container only. */
export async function itemReviewRace(query,parallel){
 const tenant='10000000-0000-4000-8000-000000000001',author='00000000-0000-4000-8000-000000000001',reviewer='00000000-0000-4000-8000-000000000002';
 query(`create table fixture_item_review_race(item_id uuid,base uuid,review uuid);
 do $$declare bank uuid;r jsonb;second uuid;payload jsonb:='{"schema_version":"assessment.item.v1","type":"single_choice","locale":"en","prompt":"Race question","max_score":1,"tags":[],"options":[{"id":"a","text":"A"},{"id":"b","text":"B"}]}';begin
  bank:=(assessment_command('${author}','${tenant}','review-race-bank','bank.create','{"title":"Review race"}')->>'id')::uuid;
  r:=assessment_command('${author}','${tenant}','review-race-item','item.create',jsonb_build_object('bank_id',bank,'item',payload,'key','{"correct":"a"}'::jsonb));
  second:=(assessment_command('${author}','${tenant}','review-race-second','item.create',jsonb_build_object('bank_id',bank,'item',jsonb_set(payload,'{prompt}','"Race decision"'),'key','{"correct":"a"}'::jsonb))->>'id')::uuid;
  perform assessment_command('${author}','${tenant}','review-race-submit','item.submit',jsonb_build_object('id',second));
  insert into fixture_item_review_race values((r->>'item_id')::uuid,(r->>'id')::uuid,second);
 end;$$;
 create function fixture_item_review_try(p_actor uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql as $$begin
  return jsonb_build_object('ok',true,'result',assessment_command(p_actor,'${tenant}',p_key,p_action,p_data));
 exception when others then return jsonb_build_object('ok',false,'error',sqlerrm);end;$$;`);
 const [item,base,review]=query('select item_id||\'|\'||base||\'|\'||review from fixture_item_review_race;').trim().split('|');
 const revise=(n)=>`select fixture_item_review_try('${author}','review-race-revise-${n}','item.revise',jsonb_build_object('item_id','${item}','base_version_id','${base}','item',jsonb_build_object('schema_version','assessment.item.v1','type','single_choice','locale','en','prompt','Race revision ${n}','max_score',1,'tags','[]'::jsonb,'options','[{"id":"a","text":"A"},{"id":"b","text":"B"}]'::jsonb),'key','{"correct":"a"}'::jsonb));`;
 const revisions=(await parallel([1,2,3,4].map(revise))).map(text=>JSON.parse(text));
 const won=revisions.filter(row=>row.ok);
 if(won.length!==1||revisions.filter(row=>!row.ok).some(row=>row.error!=='item_revision_conflict'))throw Error('Revision race wrong: '+JSON.stringify(revisions));
 if(query(`select string_agg(version::text,',' order by version) from assessment_item_versions where item_id='${item}';`).trim()!=='1,2')throw Error('Revision race left the wrong versions');
 const winner=revisions.indexOf(won[0])+1,replay=JSON.parse(query(revise(winner)));
 if(!replay.ok||JSON.stringify(replay.result)!==JSON.stringify(won[0].result))throw Error('Winning revision replay changed');
 const decide=(n)=>n===1?`select fixture_item_review_try('${reviewer}','review-race-approve','item.approve',jsonb_build_object('id','${review}'));`:`select fixture_item_review_try('${reviewer}','review-race-changes-${n}','item.request_changes',jsonb_build_object('id','${review}','body','Race change request ${n}','review_hash',repeat('b',64)));`;
 const decisions=(await parallel([1,2,3,4].map(decide))).map(text=>JSON.parse(text));
 if(decisions.filter(row=>row.ok).length!==1||decisions.filter(row=>!row.ok).some(row=>row.error!=='invalid_item_transition'))throw Error('Decision race wrong: '+JSON.stringify(decisions));
 const status=query(`select status from assessment_item_versions where id='${review}';`).trim(),requests=Number(query(`select count(*) from assessment_item_review_comments where item_version_id='${review}';`).trim());
 if(status==='approved'?requests!==0:status!=='changes_requested'||requests!==1)throw Error(`Decision race left ${status} with ${requests} change requests`);
}
