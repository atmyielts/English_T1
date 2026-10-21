import { createHandler, type Repository } from "./handler.ts";
import { hash } from "../../../packages/assessment-core/src/mod.ts";
import {IMAGE_RESPONSE_PROTOCOL} from '../../../packages/assessment-core/src/image-response.ts';
const actor="00000000-0000-4000-8000-000000000001", tenant="00000000-0000-4000-8000-000000000002";
Deno.test('academic media starts require independent enabled compatibility and reviewed policies without exposing future content',async()=>{
 let stored:Record<string,unknown>|null=null;const payload={schema_version:'assessment.item.v1',type:'video_response',prompt:'Future private academic video prompt',locale:'en',max_score:10,tags:[],rubric_id:tenant,media_response:{schema_version:'assessment.media-policy.v1',mimes:['video/webm'],max_bytes:1048576,sources:['capture']}};
 const repo=mediaRepository(payload,value=>stored=value),data={registration_id:actor,delivery_client:'assessment.prompt-media.v1',media_answer_client:'assessment.media-delivery.v2'};
 equal((await createHandler({repository:repo,allowedOrigins:[]})(req('commands',{action:'attempt.start',data:{...data,media_responses_enabled:true}}))).status,422);equal(stored,null);
 const handle=createHandler({repository:repo,allowedOrigins:[],mediaAnswersEnabled:true});
 equal((await handle(req('commands',{action:'attempt.start',data:{...data,media_answer_client:'assessment.media-answer.v1'}}))).status,422);equal(stored,null);
 const prepared=await(await handle(req('candidate/preparation?registration_id='+actor))).json();equal(prepared.data.response_tools.length,0);equal(JSON.stringify(prepared.data.media_response_tools),'["video_response"]');equal(JSON.stringify(prepared.data.media_capture_groups),'[{"type":"video_response","mimes":["video/webm"]}]');equal(JSON.stringify(prepared).includes('Future private'),false);equal(JSON.stringify(prepared).includes(tenant),false);
 equal((await handle(req('commands',{action:'attempt.start',data:{registration_id:actor,delivery_client:'assessment.prompt-media.v1'}}))).status,422);equal(stored,null);
 equal((await handle(req('commands',{action:'attempt.start',data:{...data,manifest:{forged:true},score:10,state:'ready'}}))).status,200);const input=stored as unknown as Record<string,unknown>;equal('media_answer_client' in input,false);equal('score' in input,false);equal('state' in input,false);equal(JSON.stringify(input.manifest).includes('forged'),false);
 const {media_response:removed,...legacy}=payload;void removed;equal((await createHandler({repository:mediaRepository(legacy,()=>{throw new Error('Legacy policy bypass');}),allowedOrigins:[],mediaAnswersEnabled:true})(req('commands',{action:'attempt.start',data}))).status,422);
});
const calls: string[]=[];
function mediaRepository(payload:Record<string,unknown>,write:(data:Record<string,unknown>)=>void):Repository{
 const definition={schema_version:'assessment.definition.v1',title:'Protected media',locale:'en',duration_seconds:60,sections:[{id:actor,title:'Part',item_version_ids:[actor]}]};
 return {...repository,get:table=>Promise.resolve(table==='assessment_registrations'?{id:actor,candidate_id:actor,window_id:actor}:table==='assessment_exam_windows'?{assessment_version_id:actor}:{id:actor,definition}),versions:()=>Promise.resolve([{id:actor,payload,approved_by:tenant,created_by:actor}]),command:(_actor,_tenant,_key,_action,data)=>{write(data);return Promise.resolve({id:actor});}};
}
Deno.test('enabled prompt media requires the current client protocol without trusting supplied form authority',async()=>{
 let stored:Record<string,unknown>|null=null;
 const payload={schema_version:'assessment.item.v1',type:'numeric',prompt:'Protected prompt',locale:'en',max_score:1,tags:[],media:[{artifact_id:actor,kind:'image',alt:'Reviewed diagram'},{artifact_id:tenant,kind:'audio',alt:'Recorded instructions'}]};
 const handle=createHandler({repository:mediaRepository(payload,value=>stored=value),allowedOrigins:[],promptMediaEnabled:true});
 equal((await handle(req('commands',{action:'attempt.start',data:{registration_id:actor}}))).status,422);equal(stored,null);
 const response=await handle(req('commands',{action:'attempt.start',data:{registration_id:actor,delivery_client:'assessment.prompt-media.v1',manifest:{forged:true},manifest_hash:'forged',candidate_id:tenant}}));
 equal(response.status,200);const input=stored as unknown as Record<string,unknown>;equal('delivery_client' in input,false);equal('candidate_id' in input,false);equal(String(input.manifest_hash).length,64);
 equal(JSON.stringify(input.manifest).includes('Reviewed diagram'),true);equal(JSON.stringify(input.manifest).includes('forged'),false);equal(JSON.stringify(input.manifest).includes('correct'),false);
});
Deno.test('candidate preparation reveals capabilities but never future prompts, asset IDs or scoring keys',async()=>{
 const payload={schema_version:'assessment.item.v1',type:'numeric',prompt:'Future private prompt',locale:'en',max_score:1,tags:[],media:[{artifact_id:actor,kind:'video',alt:'Private video description'}]};
 const repo=mediaRepository(payload,()=>{throw new Error('Preparation made a write');});
 const response=await createHandler({repository:repo,allowedOrigins:[],promptMediaEnabled:true})(req('candidate/preparation?registration_id='+actor));
 equal(response.status,200);const body=await response.text();equal(body.includes('Future private prompt'),false);equal(body.includes(actor),false);equal(body.includes('Private video description'),false);equal(JSON.parse(body).data.prompt_media[0],'video');
 const foreign:Repository={...repo,get:table=>table==='assessment_registrations'?Promise.resolve({id:actor,candidate_id:tenant}):repo.get(table,tenant,actor)};
 equal((await createHandler({repository:foreign,allowedOrigins:[]})(req('candidate/preparation?registration_id='+actor))).status,404);
});
Deno.test('capture-bound attempt starts require the rollout flag and forward only canonical proof fields',async()=>{
 let stored:Record<string,unknown>|null=null;const payload={schema_version:'assessment.item.v1',type:'numeric',prompt:'Numeric item',locale:'en',max_score:1,tags:[]};
 const repo=mediaRepository(payload,data=>stored=data),data={registration_id:actor,capture_binding:{session_id:actor,device_id:tenant,token_hash:'a'.repeat(64),ready:true,sources:['camera']}};
 equal((await createHandler({repository:repo,allowedOrigins:[]})(req('commands',{action:'attempt.start',data}))).status,503);equal(stored,null);
 equal((await createHandler({repository:repo,allowedOrigins:[],captureLaunchEnabled:true})(req('commands',{action:'attempt.start',data}))).status,200);
 equal(JSON.stringify((stored as unknown as Record<string,unknown>).capture_binding),JSON.stringify({session_id:actor,device_id:tenant,token_hash:'a'.repeat(64)}));
});
Deno.test('capture and image-response tools cannot be enabled by claiming prompt-media compatibility',async()=>{
 for(const type of ['audio_response','video_response','file_response','hotspot','diagram_labeling']){
  let writes=0;const payload={schema_version:'assessment.item.v1',type,prompt:'Undelivered response tool',locale:'en',max_score:1,tags:[],rubric_id:tenant,response_ids:['label'],media:[{artifact_id:actor,kind:'image',alt:'Image'}],...(['hotspot','diagram_labeling'].includes(type)?{image_response:{schema_version:IMAGE_RESPONSE_PROTOCOL,artifact_id:actor,...(type==='diagram_labeling'?{anchors:[{response_id:'label',x:.2,y:.3}]}:{})}}:{})};
  const response=await createHandler({repository:mediaRepository(payload,()=>writes++),allowedOrigins:[],promptMediaEnabled:true})(req('commands',{action:'attempt.start',data:{registration_id:actor,delivery_client:'assessment.prompt-media.v1'}}));equal(response.status,422);equal(writes,0);
 }
});
Deno.test('image response preparation exposes capability names only and requires independent enabled client compatibility',async()=>{
 let stored:Record<string,unknown>|null=null;
 const payload={schema_version:'assessment.item.v1',type:'hotspot',prompt:'Private prompt',locale:'en',max_score:1,tags:[],media:[{artifact_id:actor,kind:'image',alt:'Private alt'}],image_response:{schema_version:IMAGE_RESPONSE_PROTOCOL,artifact_id:actor}};
 const handle=createHandler({repository:mediaRepository(payload,data=>stored=data),allowedOrigins:[],promptMediaEnabled:true,imageResponsesEnabled:true});
 const prepared=await(await handle(req('candidate/preparation?registration_id='+actor))).json();equal(JSON.stringify(prepared.data.image_response_tools),'["hotspot"]');equal(JSON.stringify(prepared).includes('Private'),false);equal(JSON.stringify(prepared).includes(actor),false);
 const data={registration_id:actor,delivery_client:'assessment.prompt-media.v1'};
 equal((await handle(req('commands',{action:'attempt.start',data}))).status,422);equal(stored,null);
 equal((await handle(req('commands',{action:'attempt.start',data:{...data,image_response_client:IMAGE_RESPONSE_PROTOCOL,ready:true,regions:['forged']}}))).status,200);
 equal('image_response_client' in stored!,false);equal('regions' in stored!,false);equal('ready' in stored!,false);
});
Deno.test('media-bearing examination starts fail explicitly until the verified delivery client is connected',async()=>{let writes=0;const definition={schema_version:'assessment.definition.v1',title:'Protected image',locale:'en',duration_seconds:60,sections:[{id:actor,title:'Part',item_version_ids:[actor]}]},payload={schema_version:'assessment.item.v1',type:'numeric',prompt:'Inspect image',locale:'en',max_score:1,tags:[],media:[{artifact_id:actor,kind:'image',alt:'Reviewed illustration'}]};const handle=createHandler({repository:{...repository,get:table=>Promise.resolve(table==='assessment_registrations'?{id:actor,candidate_id:actor,window_id:actor}:table==='assessment_exam_windows'?{assessment_version_id:actor}:{id:actor,definition}),versions:()=>Promise.resolve([{id:actor,payload,approved_by:tenant,created_by:actor}]),command:()=>{writes++;return Promise.resolve({});}},allowedOrigins:[]});const response=await handle(req('commands',{action:'attempt.start',data:{registration_id:actor}}));equal(response.status,422);equal((await response.json()).code,'media_delivery_unavailable');equal(writes,0);});
Deno.test('assessment revisions require an If-Match fence and strip supplied publication authority',async()=>{
 const definition={schema_version:'assessment.definition.v1',title:'Revised',locale:'en',duration_seconds:60,shuffle_items:false,shuffle_options:true,sections:[{id:actor,title:'Part',item_version_ids:[tenant]}]};let stored:Record<string,unknown>={};
 const handle=createHandler({repository:{...repository,capability:()=>Promise.resolve(true),get:()=>Promise.resolve({id:actor}),command:(_a,_t,_k,action,data)=>{equal(action,'assessment.revise');stored=data;return Promise.resolve({id:actor,revision:3});}},allowedOrigins:[]});
 const body={action:'assessment.revise',data:{id:actor,definition,reason:' Update coverage ',revision:500,published_by:actor}};
 equal((await handle(req('commands',body))).status,422);equal((await handle(req('commands',body,'valid',{'if-match':'2'}))).status,200);equal(stored.revision,2);equal(stored.reason,'Update coverage');equal('published_by' in stored,false);
});
Deno.test('assessment revisions recheck write authority and reject foreign definitions before command dispatch',async()=>{
 let writes=0;const definition={schema_version:'assessment.definition.v1',title:'Test',locale:'ru',duration_seconds:60,sections:[{id:actor,title:'Part',item_version_ids:[tenant]}]};
 const body={action:'assessment.revise',data:{id:actor,definition,reason:'Change'}};
 const repo={...repository,command:()=>{writes++;return Promise.resolve({});}};
 equal((await createHandler({repository:repo,allowedOrigins:[]})(req('commands',body,'valid',{'if-match':'1'}))).status,403);
 equal((await createHandler({repository:{...repo,capability:()=>Promise.resolve(true)},allowedOrigins:[]})(req('commands',body,'valid',{'if-match':'1'}))).status,404);equal(writes,0);
});
Deno.test('revision review returns its tenant-scoped parent bank without trusting supplied bank metadata',async()=>{
 let parentReads=0;const payload={schema_version:'assessment.item.v1',type:'single_choice',prompt:'Review',locale:'en',max_score:1,tags:[],options:[{id:'a',text:'A'},{id:'b',text:'B'}]};
 const handle=createHandler({repository:{...repository,capability:()=>Promise.resolve(true),get:(table,scope,id)=>{equal(scope,tenant);equal(id,actor);if(table==='assessment_items'){parentReads++;return Promise.resolve({id:actor,bank_id:tenant});}return Promise.resolve({id:actor,item_id:actor,payload});},key:()=>Promise.resolve({key:{correct:'a'}})},allowedOrigins:[]});
 const response=await handle(req(`item-versions/${actor}/review`));equal(response.status,200);const value=await response.json();equal(value.data.bank_id,tenant);equal(parentReads,1);
});
 Deno.test('subjective content approval includes the reviewed immutable rubric, not only its ID',async()=>{
  const payload={schema_version:'assessment.item.v1',type:'essay',prompt:'Explain',locale:'en',max_score:9,tags:[],rubric_id:tenant},key={},rubric={id:tenant,title:'Writing',criteria:[{id:'a',title:'Accuracy',max_score:9,descriptor:'Describe accuracy'}]};
  const handle=createHandler({repository:{...repository,capability:()=>Promise.resolve(true),get:table=>Promise.resolve(table==='assessment_rubrics'?rubric:{id:actor,payload}),key:()=>Promise.resolve({key}),command:()=>Promise.resolve({id:actor})},allowedOrigins:[]});
  const reviewed=await(await handle(req(`item-versions/${actor}/review`))).json();equal(reviewed.data.rubric.title,'Writing');
  equal((await handle(req('commands',{action:'item.approve',data:{id:actor,review_hash:await hash({item:payload,key})}}))).status,409);
  equal((await handle(req('commands',{action:'item.approve',data:{id:actor,review_hash:reviewed.data.review_hash}}))).status,200);
 });
const repository: Repository={
  user: token=>Promise.resolve(token==="valid"?actor:null),
  workspaces:()=>Promise.resolve([]),
  capability:()=>Promise.resolve(false), list:()=>Promise.resolve([]),get:()=>Promise.resolve(null), versions:()=>Promise.resolve([]),windowRequirements:()=>Promise.resolve([]),
  key:()=>Promise.resolve(null),
  command:(_actor,_tenant,_key,action)=>{calls.push(action);return Promise.resolve({id:actor});},
};
function req(path="commands",body?: unknown,token="valid",extra: Record<string,string>={}) {
  const endpoint=new URL(`https://test.invalid/assessment-cloud/${path}`);endpoint.searchParams.set('tenant_id',tenant);
  return new Request(endpoint,{method:body?"POST":"GET",headers:{authorization:`Bearer ${token}`,"content-type":"application/json","idempotency-key":"command-0001",...extra},...(body?{body:JSON.stringify(body)}:{})});
}
function equal(actual:unknown,expected:unknown){if(actual!==expected)throw new Error(`Expected ${expected}, received ${actual}`);}
Deno.test('Assessment workspace discovery binds the authenticated actor, not supplied organization or user fields',async()=>{
 let reads=0;
 const handle=createHandler({repository:{...repository,workspaces:who=>{equal(who,actor);reads++;return Promise.resolve([{tenant_id:tenant,role:'assessment_member',tenants:{name:'Assessment-only institution'}}]);}},allowedOrigins:[]});
 const response=await handle(req(`workspaces?actor_id=${tenant}&user_id=${tenant}`));
 equal(response.status,200);equal(response.headers.get('cache-control'),'no-store');equal((await response.json()).data[0].role,'assessment_member');
 equal((await handle(req('workspaces',undefined,'bad'))).status,401);equal(reads,1);
});
Deno.test("API rejects missing identity, unknown origins and capability bypasses before writes",async()=>{
  const handle=createHandler({repository,allowedOrigins:["https://assessment.schood.online"]});
  equal((await handle(req("commands",{action:"bank.create",data:{title:"Test"}},"bad"))).status,401);
  equal((await handle(req("commands",{action:"bank.create",data:{title:"Test"}}))).status,403);
  equal((await handle(req("commands",{action:"bank.create",data:{title:"Test"}},"valid",{origin:"https://foreign.invalid"}))).status,403);
  equal(calls.length,0);
});
Deno.test("candidate cannot read another candidate attempt or start a foreign registration",async()=>{
  const handle=createHandler({repository:{...repository,get:()=>Promise.resolve({id:actor,candidate_id:tenant})},allowedOrigins:[]});
  equal((await handle(req(`candidate/attempts/${actor}`))).status,404);
  equal((await handle(req("commands",{action:"attempt.start",data:{registration_id:actor}}))).status,404);
});
Deno.test('candidate assignments expose service requirements through Assessment-owned data only',async()=>{
 const handle=createHandler({repository:{...repository,
  list:(table,_tenant,filters)=>{equal(table,'assessment_registrations');equal(filters?.candidate_id,actor);return Promise.resolve([{id:actor,window_id:tenant}]);},
  windowRequirements:(_tenant,ids)=>{equal(JSON.stringify(ids),JSON.stringify([tenant]));return Promise.resolve([{id:tenant,title:'Entrance assessment',required_services:['proctor']}]);}
 },allowedOrigins:[]});
 const body=await(await handle(req('candidate/registrations'))).json();equal(body.data[0].title,'Entrance assessment');equal(JSON.stringify(body.data[0].required_services),'["proctor"]');
});
Deno.test("author command strips supplied actor, tenant, keys and state fields",async()=>{
  let stored:Record<string,unknown>={};
  const handle=createHandler({repository:{...repository,capability:()=>Promise.resolve(true),command:(who,scope,_key,_action,data)=>{equal(who,actor);equal(scope,tenant);stored=data;return Promise.resolve({id:actor});}},allowedOrigins:[]});
  equal((await handle(req("commands",{action:"bank.create",data:{title:" Math ",actor:tenant,tenant_id:actor,status:"approved"}}))).status,200);
  equal(JSON.stringify(stored),JSON.stringify({title:"Math"}));
});
Deno.test("server computes response hashes instead of trusting a supplied hash",async()=>{
  let stored:Record<string,unknown>={};
  const handle=createHandler({repository:{...repository,command:(_a,_t,_k,_action,data)=>{stored=data;return Promise.resolve({id:actor});}},allowedOrigins:[]});
  equal((await handle(req("commands",{action:"response.append",data:{attempt_id:actor,item_version_id:actor,sequence:1,response:"A",payload_hash:"forged"}}))).status,200);
  equal(typeof stored.payload_hash,"string");equal(String(stored.payload_hash).length,64);equal(stored.payload_hash==="forged",false);
});
Deno.test("candidate receives only the current section, never future prompts or private keys",async()=>{
  const handle=createHandler({repository:{...repository,get:(table)=>Promise.resolve(table==="assessment_attempts"?{id:actor,candidate_id:actor,form_id:actor,section_index:0}:{manifest:{schema_version:"assessment.manifest.v1",sections:[{title:"Current",items:[]},{title:"Future private prompt",items:[]}]}})},allowedOrigins:[]});
  const response=await handle(req(`candidate/attempts/${actor}`));equal(response.status,200);
  const body=await response.text();equal(body.includes("Future private prompt"),false);equal(body.includes('"section_count":2'),true);
});
Deno.test("approval requires a review hash of the immutable item and key",async()=>{
  const payload={schema_version:"assessment.item.v1",prompt:"Reviewed content"},key={correct:"A"};
  const handle=createHandler({repository:{...repository,capability:()=>Promise.resolve(true),get:()=>Promise.resolve({id:actor,payload}),key:()=>Promise.resolve({key})},allowedOrigins:[]});
  equal((await handle(req("commands",{action:"item.approve",data:{id:actor,review_hash:"forged"}}))).status,409);
  equal((await handle(req("commands",{action:"item.approve",data:{id:actor,review_hash:await hash({item:payload,key})}}))).status,200);
});
Deno.test('accommodation approval requires exam management and forwards only the strict contract',async()=>{
 const policy={schema_version:'assessment.break-policy.v1',clock:'stopped',max_breaks:2,max_seconds:60,total_seconds:120};
 const data={registration_id:actor,revision:1,extra_seconds:300,break_policy:policy,reason:'Approved under access arrangements policy'};
 let stored:Record<string,unknown>|null=null,capability='';
 const handle=(allowed:boolean)=>createHandler({repository:{...repository,capability:(_t,_a,name)=>{capability=name;return Promise.resolve(allowed);},command:(_a,_t,_k,action,input)=>{equal(action,'registration.accommodate');stored=input as Record<string,unknown>;return Promise.resolve({id:actor,revision:2});}},allowedOrigins:[]});
 equal((await handle(false)(req('commands',{action:'registration.accommodate',data}))).status,403);equal(capability,'exams.manage');equal(stored,null);
 for(const bad of [{...data,break_policy:{...policy,max_seconds:59.5}},{...data,break_policy:{...policy,max_breaks:0}},{...data,extra_seconds:86401},{...data,reason:''},{...data,revision:-1}])equal((await handle(true)(req('commands',{action:'registration.accommodate',data:bad}))).status,422);
 equal(stored,null);
 equal((await handle(true)(req('commands',{action:'registration.accommodate',data:{...data,diagnosis:'never stored',candidate_id:tenant}}))).status,200);
 equal(JSON.stringify(Object.keys(stored!).sort()),JSON.stringify(['break_policy','extra_seconds','reason','registration_id','revision']));
});
