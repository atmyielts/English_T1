import { createProctorHandler, type ProctorRepository } from './handler.ts';
const actor='00000000-0000-4000-8000-000000000001',tenant='10000000-0000-4000-8000-000000000001';
let writes:Record<string,unknown>[]=[];
const repository:ProctorRepository={user:()=>Promise.resolve(actor),workspaces:()=>Promise.resolve([]),capability:()=>Promise.resolve(false),access:()=>Promise.resolve(false),list:()=>Promise.resolve([]),get:()=>Promise.resolve(null),command:(_a,_t,_k,action,data)=>{writes.push({action,...data});return Promise.resolve({id:actor});}};
const req=(action:string,data:unknown)=>new Request(`https://test.invalid/proctor/commands?tenant_id=${tenant}`,{method:'POST',headers:{authorization:'Bearer fixture','content-type':'application/json','idempotency-key':'command-0001'},body:JSON.stringify({action,data})});
function equal(a:unknown,b:unknown){if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Expected ${JSON.stringify(b)}, received ${JSON.stringify(a)}`);}
Deno.test('human findings normalize recording citations without accepting storage/source/guilt fields',async()=>{
 writes=[];const handle=createProctorHandler(repository,[]),reference={recording_id:actor,from_sequence:1,to_sequence:2,head_hash:'a'.repeat(64)};
 equal((await handle(req('case.finding',{case_id:actor,disposition:'insufficient_evidence',rationale:'This is a human assessment of the selected evidence.',evidence_event_ids:[],evidence_recording_refs:[{...reference,source:'trusted_model',guilty:true,object_key:'foreign'},reference]}))).status,200);
 equal(writes[0].evidence_recording_refs,[reference]);
 equal((await handle(req('case.finding',{case_id:actor,disposition:'clear',rationale:'Invalid interval must not reach persistence.',evidence_event_ids:[],evidence_recording_refs:[{...reference,to_sequence:0}]}))).status,422);equal(writes.length,1);
});
Deno.test('recording citation reads require current session reviewer authority',async()=>{
 let readCitations=false;
 const handle=createProctorHandler({...repository,get:async()=>({id:actor}),access:async(_t,_s,_u,assignment)=>assignment!=='reviewer',capability:async()=>true,list:async(table)=>{if(table==='proctor_recording_citations'){readCitations=true;return[{recording_id:'private-recording'}];}return table==='proctor_review_cases'?[{id:actor}]:[];}},[]);
 const response=await handle(new Request(`https://test.invalid/proctor/sessions/${actor}?tenant_id=${tenant}`,{headers:{authorization:'Bearer fixture'}}));equal(response.status,200);equal((await response.json()).data.recording_citations,[]);equal(readCitations,false);
});
Deno.test('proctor API requires auth, supervisor capability and explicit consent',async()=>{
 const handle=createProctorHandler(repository,[]);writes=[];
 equal((await createProctorHandler({...repository,user:()=>Promise.resolve(null)},[])(req('policy.create',{}))).status,401);
 equal((await handle(req('policy.create',{title:'Exam',policy:{}}))).status,403);
 equal((await handle(req('preparation.accept',{registration_id:actor,policy_id:actor,acknowledged:false}))).status,422);
 equal(writes.length,0);
});
Deno.test('capture preflight is explicit default-off and cannot downgrade live, secure, second-camera or document requirements',async()=>{
 const request=new Request(`https://test.invalid/proctor/candidate/preflight?tenant_id=${tenant}&registration_id=${actor}`,{headers:{authorization:'Bearer fixture'}});
 for(const [mode,level,second,enabled]of[['record_review',0,false,true],['live',0,false,false],['secure_desktop',0,false,false],['center',0,false,false],['record_review',2,false,false],['record_review',0,true,false]]as const){
  const repo:ProctorRepository={...repository,get:async table=>table==='assessment_registrations'?{id:actor,candidate_id:actor,window_id:actor}:{id:tenant,title:'Recording policy',policy:{schema_version:'proctor.policy.v1',mode,identity_level:level,camera:true,microphone:true,screen:true,second_camera:second}},list:async table=>table==='proctor_window_policies'?[{policy_id:tenant}]:[]};
  const off=await(await createProctorHandler(repo,[])(request.clone())).json();equal(off.data.runtime_ready,false);equal(off.data.capture_required,true);equal(off.data.capture_enabled,false);
  const on=await(await createProctorHandler(repo,[],{captureLaunchEnabled:true})(request.clone())).json();equal(on.data.runtime_ready,enabled);equal(on.data.capture_enabled,enabled);equal(on.data.capture_protocol,'proctor.capture.v1');
 }
});
Deno.test('browser cannot impersonate AI or supply guilt, source, severity or event hashes',async()=>{
 const handle=createProctorHandler(repository,[]);writes=[];
 equal((await handle(req('events.append',{session_id:actor,stream_id:actor,events:[{sequence:1,kind:'ml_anomaly',occurred_at:new Date().toISOString()}]}))).status,422);
 equal((await handle(req('events.append',{session_id:actor,stream_id:actor,events:[{sequence:1,kind:'focus_loss',occurred_at:new Date().toISOString(),source:'trusted_model',severity:'high',guilty:true,payload_hash:'forged'}]}))).status,200);
 const event=(writes[0].events as Record<string,unknown>[])[0];
 equal(Object.keys(event).sort(),['sequence','kind','occurred_at','payload_hash'].sort());equal(String(event.payload_hash).length,64);
 equal(writes.length,1);
});
Deno.test('candidate cannot fetch another candidate preflight or attempt',async()=>{
 const handle=createProctorHandler({...repository,get:()=>Promise.resolve({id:actor,candidate_id:tenant})},[]);
 equal((await handle(new Request(`https://test.invalid/proctor/candidate/preflight?tenant_id=${tenant}&registration_id=${actor}`,{headers:{authorization:'Bearer fixture'}}))).status,404);
 equal((await handle(new Request(`https://test.invalid/proctor/candidate/session?tenant_id=${tenant}&attempt_id=${actor}`,{headers:{authorization:'Bearer fixture'}}))).status,404);
});
Deno.test('assignment-only observers cannot enumerate unassigned sessions',async()=>{
 const handle=createProctorHandler({...repository,list:(table)=>Promise.resolve(table==='proctor_sessions'?[{id:actor,candidate_id:actor}]:[])},[]);
 const response=await handle(new Request(`https://test.invalid/proctor/sessions?tenant_id=${tenant}`,{headers:{authorization:'Bearer fixture'}}));
 equal((await response.json()).data,[]);
});
Deno.test('proctor service has no grading or automatic invalidation command',async()=>{
 const handle=createProctorHandler({...repository,capability:()=>Promise.resolve(true)},[]);
 equal((await handle(req('session.invalidate',{session_id:actor}))).status,422);
 equal((await handle(req('grade.override',{session_id:actor}))).status,422);
});
Deno.test('session controls and reviewer findings follow session-specific assignments',async()=>{
 const handle=createProctorHandler({...repository,
  capability:(_t,_u,cap)=>Promise.resolve(cap==='proctor.review'),
  access:(_t,_s,_u,assignment)=>Promise.resolve(assignment!=='reviewer'),
  get:()=>Promise.resolve({id:actor}),
  list:(table)=>Promise.resolve(table==='proctor_review_cases'?[{id:actor}]:table==='proctor_case_findings'?[{rationale:'Private reviewer deliberation'}]:[])
 },[]);
 const response=await handle(new Request(`https://test.invalid/proctor/sessions/${actor}?tenant_id=${tenant}`,{headers:{authorization:'Bearer fixture'}}));
 equal(response.status,200);const body=await response.json();
 equal(body.data.permissions,{observe:true,review:false});equal(body.data.findings,[]);
});
Deno.test('candidate preflight exposes requirements without private attended identity notes',async()=>{
 const policy={schema_version:'proctor.policy.v1',mode:'browser',identity_level:1,camera:false,microphone:false,screen:false,second_camera:false};
 let verified=false;
 const handle=createProctorHandler({...repository,
  get:(table)=>Promise.resolve(table==='assessment_registrations'?{id:actor,candidate_id:actor,window_id:actor}:{id:actor,title:'Entrance policy',policy}),
  list:(table)=>Promise.resolve(table==='proctor_window_policies'?[{policy_id:actor}]:table==='proctor_identity_checks'?[{level:1,verified_by:tenant,notes:'PRIVATE document information'}]:[]),
  capability:()=>Promise.resolve(verified)
 },[]);
 const request=()=>new Request(`https://test.invalid/proctor/candidate/preflight?tenant_id=${tenant}&registration_id=${actor}`,{headers:{authorization:'Bearer fixture'}});
 let body=await(await handle(request())).json();equal(body.data.identity_verified,false);equal(body.data.runtime_ready,true);equal(JSON.stringify(body).includes('PRIVATE'),false);
 verified=true;body=await(await handle(request())).json();equal(body.data.identity_verified,true);
});
Deno.test('candidate notices exclude staff identity and expose only owning acknowledgement status',async()=>{
 const handle=createProctorHandler({...repository,
  get:()=>Promise.resolve({id:actor,candidate_id:actor,state:'paused'}),
  list:(table)=>Promise.resolve(table==='proctor_sessions'?[{id:actor}]:table==='proctor_candidate_notices'?[{id:actor,kind:'warning',reason:'Stay on the exam page',issued_at:'2030-01-01',issued_by:'private-staff-id'},{id:tenant,kind:'paused',reason:'Required recording interrupted',issued_at:'2030-01-02',issued_by:null,issuer_kind:'system'}]:table==='proctor_notice_acknowledgements'?[{notice_id:actor}]:[])
 },[]);
 const body=await(await handle(new Request(`https://test.invalid/proctor/candidate/session?tenant_id=${tenant}&attempt_id=${actor}`,{headers:{authorization:'Bearer fixture'}}))).json();
 equal(body.data.notices[0].acknowledged,true);equal(JSON.stringify(body).includes('private-staff-id'),false);
 equal(body.data.notices[0].issuer_kind,'user');equal(body.data.notices[1].issuer_kind,'system');equal(body.data.notices[1].acknowledged,false);
});
