import {CoordinatorEngine} from './engine.ts';
import {RuntimeError,type Backend,type Invocation,type Result,type Storage} from './protocol.ts';
const equal=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Expected ${JSON.stringify(b)}, received ${JSON.stringify(a)}`);};
class Memory implements Storage{
 values=new Map<string,unknown>();alarm:number|null=null;failReceipt=false;
 get<T>(key:string){return Promise.resolve(this.values.get(key) as T|undefined);}
 put(key:string,value:unknown){if(this.failReceipt&&key.startsWith('command:')&&(value as {committed:boolean}).committed){this.failReceipt=false;return Promise.reject(new Error('storage interrupted'));}this.values.set(key,structuredClone(value));return Promise.resolve();}
 setAlarm(value:number){this.alarm=value;return Promise.resolve();}deleteAlarm(){this.alarm=null;return Promise.resolve();}
}
const snapshot=()=>({attempt_id:'attempt',state:'active',deadline_at:'2030-01-01T12:00:00Z',section_deadline_at:'2030-01-01T12:00:00Z',closes_at:'2030-01-01T13:00:00Z',section_index:0,last_sequence:0,lease_epoch:1,lease_expires_at:null,server_time:'2030-01-01T11:00:00Z',next_deadline_at:'2030-01-01T12:00:00Z'});
const invocation=(key='command-1'):Invocation=>({tenant:'tenant',attempt:'attempt',actor:'candidate',bearer:'Bearer PRIVATE-JWT',key,action:'response.append',data:{sequence:1,response:'PRIVATE-ANSWER',lease:{token_hash:'PRIVATE-TOKEN',epoch:1}}});
function backend(){const receipts=new Map<string,unknown>(),actions:string[]=[];let sequence=0;return {actions,receipts,
 invoke(input:Invocation):Promise<Result>{actions.push(input.action);if(input.action==='snapshot')return Promise.resolve({snapshot:{...snapshot(),last_sequence:sequence}});if(!receipts.has(input.key))receipts.set(input.key,{id:'response-'+(++sequence)});return Promise.resolve({result:receipts.get(input.key),snapshot:{...snapshot(),last_sequence:sequence}});},
 expire():Promise<Result>{actions.push('alarm.expire');return Promise.resolve({snapshot:{...snapshot(),state:'expired',next_deadline_at:null}});}
};}
Deno.test('DO response acknowledgement follows canonical commit and durable receipt, with no private payload storage',async()=>{
 const store=new Memory(),canonical=backend(),engine=new CoordinatorEngine(store,canonical,()=>0);
 const result=await engine.invoke(invocation());equal(result.result,{id:'response-1'});equal(canonical.actions,['snapshot','response.append']);
 const serialized=JSON.stringify([...store.values]);equal(serialized.includes('PRIVATE-ANSWER'),false);equal(serialized.includes('PRIVATE-JWT'),false);equal(serialized.includes('PRIVATE-TOKEN'),false);
 equal(store.alarm,Date.parse('2030-01-01T12:00:00Z'));
});
Deno.test('restart after canonical commit but lost durable receipt replays without a second response',async()=>{
 const store=new Memory(),canonical=backend(),first=new CoordinatorEngine(store,canonical,()=>0);store.failReceipt=true;
 try{await first.invoke(invocation());throw new Error('Expected interruption');}catch(cause){equal((cause as Error).message,'storage interrupted');}
 const resumed=new CoordinatorEngine(store,canonical,()=>0);equal((await resumed.invoke(invocation())).result,{id:'response-1'});equal(canonical.receipts.size,1);
});
Deno.test('semantic replay allows rotated leases and reordered JSON fields but rejects changed answers',async()=>{
 const store=new Memory(),canonical=backend(),engine=new CoordinatorEngine(store,canonical,()=>0);await engine.invoke(invocation());
 const retry=invocation();retry.data={lease:{epoch:2,token_hash:'rotated'},response:'PRIVATE-ANSWER',sequence:1};equal((await engine.invoke(retry)).result,{id:'response-1'});
 const conflict=invocation();conflict.data.response='CHANGED';try{await engine.invoke(conflict);throw new Error('Conflict accepted');}catch(cause){equal((cause as RuntimeError).status,409);}
});
Deno.test('concurrent commands are serialized across backend fetch yields',async()=>{
 const store=new Memory(),order:string[]=[],base=backend();let active=0;
 const remote:Backend={...base,async invoke(input){active++;if(active!==1)throw new Error('Interleaved canonical operation');await Promise.resolve();order.push(input.key||input.action);const result=await base.invoke(input);active--;return result;}};
 const engine=new CoordinatorEngine(store,remote,()=>0);await Promise.all([engine.invoke(invocation('command-1')),engine.invoke(invocation('command-2'))]);equal(order,['snapshot','command-1','command-2']);
});
Deno.test('an unowned attempt cannot poison the persisted actor binding',async()=>{
 const store=new Memory(),remote:Backend={invoke:()=>Promise.reject(new RuntimeError(404,'not_found','Not found')),expire:()=>Promise.reject(new Error('unexpected'))};
 try{await new CoordinatorEngine(store,remote).invoke(invocation());}catch{}equal(store.values.size,0);
});
Deno.test('rehydrated alarms reconcile canonical expiry and remove finalized scheduling',async()=>{
 const store=new Memory(),canonical=backend();await new CoordinatorEngine(store,canonical,()=>0).invoke(invocation());await new CoordinatorEngine(store,canonical,()=>0).alarm();equal(store.alarm,null);equal(canonical.actions.at(-1),'alarm.expire');
});
Deno.test('past deadline reconciliation is throttled and canonical failures do not produce acknowledgements',async()=>{
 const store=new Memory(),base=backend(),remote:Backend={...base,invoke:input=>input.action==='snapshot'?base.invoke(input):Promise.reject(new Error('database unavailable'))};
 try{await new CoordinatorEngine(store,remote,()=>Date.parse('2030-01-01T12:30:00Z')).invoke(invocation());}catch{}equal((store.values.get('command:candidate:command-1') as {committed:boolean}).committed,false);equal(store.alarm,Date.parse('2030-01-01T12:30:00Z')+1000);
});
Deno.test('capture policy rejection never commits a DO answer receipt and its alarm reconciles the canonical pause',async()=>{
 const store=new Memory();let paused=false;
 const remote:Backend={
  invoke:input=>{
   if(input.action==='snapshot')return Promise.resolve({snapshot:{...snapshot(),state:paused?'paused':'active',next_deadline_at:paused?'2030-01-01T13:00:00Z':'2030-01-01T11:00:05Z'}});
   paused=true;return Promise.reject(new RuntimeError(422,'capture_continuity_required','Required recording interrupted'));
  },
  expire:()=>Promise.resolve({snapshot:{...snapshot(),state:'paused',next_deadline_at:'2030-01-01T13:00:00Z'}})
 };
 const engine=new CoordinatorEngine(store,remote,()=>0);
 try{await engine.invoke(invocation());throw new Error('Rejected response acknowledged');}catch(cause){equal((cause as RuntimeError).code,'capture_continuity_required');}
 equal((store.values.get('command:candidate:command-1') as {committed:boolean}).committed,false);
 equal(store.alarm,Date.parse('2030-01-01T11:00:05Z'));await engine.alarm();equal(store.alarm,Date.parse('2030-01-01T13:00:00Z'));
});
