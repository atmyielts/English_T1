import {createRuntimeRepository} from './repository.ts';
import {createRuntimeHandler} from './handler.ts';
const id='00000000-0000-4000-8000-000000000001',secret='fixture-coordinator-secret-0000000000';
const equal=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Expected ${JSON.stringify(b)}, received ${JSON.stringify(a)}`);};
const auth={auth:{getUser:()=>Promise.resolve({data:{user:{id}},error:null})}};
Deno.test('committed capture pause becomes an HTTP rejection, never an answer receipt',async()=>{
 let commits=0;
 const repository=createRuntimeRepository(auth,{rpc:(name,args)=>{
  equal(name,'assessment_runtime_command');equal(args.p_actor,id);commits++;
  return Promise.resolve({data:{rejected:'capture_continuity_required',snapshot:{state:'paused'}},error:null});
 }});
 const response=await createRuntimeHandler(repository,secret)(new Request('https://test.invalid',{method:'POST',headers:{'x-assessment-coordinator-key':secret,authorization:'Bearer fixture','Idempotency-Key':'capture-rejected-0001'},body:JSON.stringify({tenant_id:id,attempt_id:id,action:'attempt.submit',data:{lease:{device_id:id,token_hash:'a'.repeat(64),epoch:1}}})}));
 equal(commits,1);equal(response.status,422);const body=await response.json();equal(body.code,'capture_continuity_required');equal(body.data,undefined);equal(body.result,undefined);
});
Deno.test('ordinary and replayed canonical receipts retain their exact runtime envelope',async()=>{
 const receipt={result:{id},snapshot:{state:'paused',capture:{action:'paused'}}};
 const repository=createRuntimeRepository(auth,{rpc:()=>Promise.resolve({data:receipt,error:null})});
 equal(await repository.command(id,id,'original-key','response.append',{attempt_id:id}),receipt);
});
Deno.test('unknown non-receipt database rejection fails closed',async()=>{
 const repository=createRuntimeRepository(auth,{rpc:()=>Promise.resolve({data:{rejected:'unknown'},error:null})});
 try{await repository.command(id,id,'unknown-key','attempt.submit',{});throw new Error('Unknown rejection was accepted');}
 catch(cause){equal((cause as {code:string}).code,'database_error');}
});
