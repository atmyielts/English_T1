import {consumeRecovery,dispatchRecovery,recoveryTicket} from './recovery.ts';
import {CoordinatorEngine} from './engine.ts';
import type {RecoveryTicket,Storage} from './protocol.ts';
const equal=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Expected ${JSON.stringify(b)}, received ${JSON.stringify(a)}`);};
const ticket=(id=1):RecoveryTicket=>({schema_version:'assessment.recovery.v1',tenant_id:'10000000-0000-4000-8000-000000000001',attempt_id:`80000000-0000-4000-8000-${String(id).padStart(12,'0')}`,revision:1,lease_token:'50000000-0000-4000-8000-000000000001'});
Deno.test('recovery tickets strip injected actor and payload and reject malformed scope/revision',()=>{
 equal(recoveryTicket({...ticket(),actor:'forged',response:'PRIVATE'}),ticket());let failed=false;try{recoveryTicket({...ticket(),revision:0});}catch{failed=true;}equal(failed,true);
});
Deno.test('dispatcher sends bounded canonical batches and stops after a partial claim',async()=>{
 let claimed=0;const sent:unknown[]=[];const result=await dispatchRecovery(()=>Promise.resolve(++claimed===1?Array.from({length:100},(_,i)=>ticket(i+1)):[ticket(101)]),{sendBatch:rows=>{sent.push(rows);return Promise.resolve();}},200,()=>0);
 equal(claimed,2);equal(result,101);equal((sent[0] as unknown[]).length,100);equal((sent[1] as unknown[]).length,1);
});
Deno.test('dispatcher does not conceal provider send failure and bounds cron work',async()=>{
 let claimed=0,failed=false;try{await dispatchRecovery(()=>{claimed++;return Promise.resolve([ticket()]);},{sendBatch:()=>Promise.reject(new Error('queue offline'))});}catch{failed=true;}equal(failed,true);equal(claimed,1);
 let batches=0;await dispatchRecovery(()=>Promise.resolve(Array.from({length:100},(_,i)=>ticket(i+1))),{sendBatch:()=>{batches++;return Promise.resolve();}},2,()=>0);equal(batches,2);
});
Deno.test('consumer isolates failed messages, bounds concurrency and acknowledges only completed recovery',async()=>{
 let active=0,peak=0;const actions:string[]=[],messages=Array.from({length:20},(_,i)=>({body:ticket(i+1),attempts:1,ack:()=>actions.push(`ack-${i}`),retry:()=>actions.push(`retry-${i}`)}));
 await consumeRecovery(messages,async value=>{active++;peak=Math.max(peak,active);await Promise.resolve();active--;if(value.attempt_id===ticket(3).attempt_id)throw new Error('DB unavailable');});
 equal(actions.length,20);equal(actions.filter(value=>value.startsWith('retry')),['retry-2']);if(peak>8)throw new Error('Unbounded database concurrency');
});
Deno.test('malformed jobs are retried for configured dead-letter handling, not silently acknowledged',async()=>{
 const calls:string[]=[];await consumeRecovery([{body:{...ticket(),lease_token:'forged'},attempts:9,ack:()=>calls.push('ack'),retry:options=>calls.push(`retry:${options.delaySeconds}`)}],()=>{throw new Error('Must not call canonical recovery');});equal(calls,['retry:900']);
});
Deno.test('orphan recovery binds only canonical ownership, persists schedule and stores no ticket secret',async()=>{
 const values=new Map<string,unknown>();let alarm:number|null=null;
 const storage:Storage={get:<T>(key:string)=>Promise.resolve(values.get(key) as T|undefined),put:(key,value)=>{values.set(key,value);return Promise.resolve();},setAlarm:time=>{alarm=time;return Promise.resolve();},deleteAlarm:()=>{alarm=null;return Promise.resolve();}};
 const job=ticket(),binding={tenant:job.tenant_id,attempt:job.attempt_id,actor:'canonical-candidate'},snapshot={attempt_id:job.attempt_id,state:'expired',deadline_at:'2030-01-01T12:00:00Z',section_deadline_at:'2030-01-01T12:00:00Z',closes_at:'2030-01-01T13:00:00Z',section_index:0,last_sequence:0,lease_epoch:null,lease_expires_at:null,server_time:'2030-01-01T12:01:00Z',next_deadline_at:null};
 const engine=new CoordinatorEngine(storage,{invoke:()=>{throw new Error('Not a candidate command');},expire:()=>{throw new Error('Not an unaudited alarm');},recover:()=>Promise.resolve({accepted:true,binding,snapshot})});await engine.recover(job);equal(values.get('binding'),binding);equal(alarm,null);equal(JSON.stringify([...values]).includes(job.lease_token),false);
});
Deno.test('stale recovery tickets cannot bind an object and wrong canonical identity cannot replace prior binding',async()=>{
 const values=new Map<string,unknown>(),storage:Storage={get:<T>(key:string)=>Promise.resolve(values.get(key) as T|undefined),put:(key,value)=>{values.set(key,value);return Promise.resolve();},setAlarm:()=>Promise.resolve(),deleteAlarm:()=>Promise.resolve()};
 const backend={invoke:()=>Promise.reject(new Error('unused')),expire:()=>Promise.reject(new Error('unused')),recover:()=>Promise.resolve({accepted:false})};
 await new CoordinatorEngine(storage,backend).recover(ticket());equal(values.size,0);
 values.set('binding',{tenant:'different',attempt:ticket().attempt_id,actor:'candidate'});let failed=false;try{await new CoordinatorEngine(storage,backend).recover(ticket());}catch{failed=true;}equal(failed,true);
});
