import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { handleAtomicCandidateEntry } from './atomic.ts';
const actor='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const body={token_code:'QA-EXAM-123',first_name:'Owned',last_name:'QA',email:'owned@example.invalid',phone:'unverified-phone'};
const result={actor_id:actor,session_id:actor,experience_id:actor,first_section_id:actor,product_id:actor,product_slug:'ielts',app_url:'https://ielts.schood.online',strict_mode:true,launch_kind:'candidate_id'};
function setup(data: unknown=result,error: {code?:string;message?:string}|null=null) {
  const calls:{name:string;args:Record<string,string>}[]=[];
  const sbDb={rpc(name:string,args:Record<string,string>){calls.push({name,args});return Promise.resolve({data,error});}};
  const sbAuth={auth:{getUser(_token:string){return Promise.resolve({data:{user:{id:actor,email:body.email,email_confirmed_at:'2026-01-01'}},error:null});}}};
  const request=(input:unknown=body,header:string|null='Bearer owned-token',method='POST')=>new Request('https://example.invalid',{method,headers:{'Content-Type':'application/json',...(header?{Authorization:header}:{})},...(method==='POST'?{body:JSON.stringify(input)}:{})});
  return {calls,sbDb,sbAuth,request,handle:(req:Request)=>handleAtomicCandidateEntry(req,{sbDb,sbAuth})};
}
Deno.test('atomic candidate HTTP admits exclusively the verified actor through one RPC',async()=>{
  const f=setup(),response=await f.handle(f.request({...body,user_id:other,p_actor:other,tenant_id:other}));
  assertEquals(response.status,200);assertEquals(f.calls,[{name:'admit_candidate_exam',args:{p_actor:actor,p_code:body.token_code,p_email:body.email,p_first_name:'Owned',p_last_name:'QA',p_phone:body.phone}}]);
  assertEquals(response.headers.get('Cache-Control'),'no-store');assertEquals((await response.json()).session,undefined);
});
Deno.test('atomic candidate HTTP authentication and email failures never reach admission',async()=>{
  for(const [input,header,status] of [[body,null,401],[{...body,email:'other@example.invalid'},'Bearer owned-token',403],[{},'Bearer owned-token',400],[[],'Bearer owned-token',400],[{...body,token_code:'bad/code'},'Bearer owned-token',400]] as const){
    const f=setup();assertEquals((await f.handle(f.request(input,header))).status,status);assertEquals(f.calls.length,0);
  }
});
Deno.test('atomic candidate HTTP bounds actual request bytes and supports unauthenticated preflight',async()=>{
  const f=setup();assertEquals((await f.handle(f.request({...body,extra:'x'.repeat(8192)}))).status,413);assertEquals(f.calls.length,0);
  assertEquals((await f.handle(f.request(null,null,'OPTIONS'))).status,200);assertEquals((await f.handle(f.request(null,null,'GET'))).status,405);
});
Deno.test('atomic candidate HTTP translates SQL denial and reconciliation without leaking internal error messages',async()=>{
  for(const [code,status] of [['P0002',404],['42501',403],['22023',409],['23505',409],['23514',409],['22P02',409],['55P03',503],['57014',503],['PGRST202',503],['unknown',503]] as const){
    const f=setup(null,{code,message:'private provider detail'}),response=await f.handle(f.request());assertEquals(response.status,status);assert(!(await response.text()).includes('private'));
    assertEquals(f.calls.length,1);
  }
});
Deno.test('atomic candidate HTTP dropped response never falls back to non-atomic writes or promises a fresh attempt',async()=>{
  const f=setup();f.sbDb.rpc=()=>{throw Error('Connection lost after commit');};
  const response=await f.handle(f.request());assertEquals(response.status,503);assertEquals((await response.json()).code,'candidate_retry');
});
Deno.test('atomic candidate HTTP ignores credentials returned by SQL and validates session scope',async()=>{
  const f=setup({...result,session:{access_token:'private'},access_token:'private',refresh_token:'private'});
  const response=await f.handle(f.request());assertEquals(response.status,200);assert(!(await response.text()).includes('private'));
  for(const bad of [{...result,actor_id:other},{...result,session_id:'bad'},{...result,app_url:'https://evil.example'},{...result,app_url:'https://ielts.schood.online?token=private'},
    {...result,strict_mode:false},{...result,launch_kind:'center_voucher'},{...result,classroom_id:'bad'}])assertEquals((await setup(bad).handle(f.request())).status,503);
});
Deno.test('atomic candidate HTTP recovery uses the original code and returns the durable result unchanged',async()=>{
  const f=setup({...result,deduped:true});const first=await f.handle(f.request()),retry=await f.handle(f.request());
  assertEquals(first.status,200);assertEquals(await first.json(),await retry.json());assertEquals(f.calls[0].args,f.calls[1].args);
});
