import {AttemptRuntime,type CoordinatorTransport,type LeaseCredentials,type RuntimeResult,type RuntimeStatus} from '../src/runtime.ts';
const equal=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Expected ${JSON.stringify(b)}, received ${JSON.stringify(a)}`);};
const fail=async(work:()=>Promise<unknown>)=>{let failed=false;try{await work();}catch{failed=true;}if(!failed)throw new Error('Expected failure');};
function fixture(){
 let now=Date.parse('2030-01-01T11:00:00Z'),epoch=0,expires=0,state='active',counter=0;
 let credentials:LeaseCredentials={device_id:'device-a',token:'a'.repeat(64)};
 const calls:{action:string;data:Record<string,unknown>;key:string}[]=[],statuses:RuntimeStatus[]=[],receipts=new Map<string,unknown>();
 const snapshot=()=>({attempt_id:'attempt-a',state,deadline_at:'2030-01-01T12:00:00Z',section_deadline_at:'2030-01-01T12:00:00Z',closes_at:'2030-01-01T13:00:00Z',section_index:0,last_sequence:0,lease_epoch:epoch||null,lease_expires_at:expires?new Date(expires).toISOString():null,server_time:new Date(now).toISOString(),next_deadline_at:'2030-01-01T12:00:00Z'});
 let loseReply=false,offline=false,competing=false;
 const transport:CoordinatorTransport={state:()=>offline?Promise.reject(new Error('offline')):Promise.resolve({snapshot:snapshot()}),command:async(action,data,key)=>{
   calls.push({action,data,key});if(offline)throw new Error('offline');
   if(receipts.has(key))return {result:receipts.get(key),snapshot:snapshot()};
   let result:unknown={saved:true};
   if(action==='lease.acquire'){if(competing)throw new Error('device_lease_active');if(expires<=now)epoch++;expires=now+60000;result={epoch};}
   else if(action==='lease.renew'){equal((data.lease as {epoch:number}).epoch,epoch);expires=now+60000;result={epoch};}
   else{equal((data.lease as {epoch:number}).epoch,epoch);if(action==='attempt.submit')state='submitted';}
   receipts.set(key,result);if(loseReply){loseReply=false;throw new Error('lost receipt');}return {result,snapshot:snapshot()};
 }};
 const store={read:()=>({...credentials}),write:(value:LeaseCredentials)=>{credentials={...value};}};
 const make=()=>new AttemptRuntime(transport,store,()=>{},status=>statuses.push(status),()=>now,()=>`key-${++counter}-stable`);
 return {make,calls,statuses,credentials:()=>credentials,now:(seconds:number)=>{now+=seconds*1000;},lose:()=>{loseReply=true;},offline:(value:boolean)=>{offline=value;},compete:()=>{competing=true;},finalize:()=>{state='expired';},pause:()=>{state='paused';}};
}
Deno.test('browser acquires before writing and renews using coordinator time',async()=>{
 const f=fixture(),runtime=f.make();await runtime.tick();equal(f.statuses.at(-1)?.ready,true);equal(f.calls.map(row=>row.action),['lease.acquire']);
 await runtime.command('response.append',{sequence:1,response:'answer'},'response-stable');equal((f.calls[1].data.lease as {epoch:number}).epoch,1);
 f.now(31);await runtime.tick();equal(f.calls.at(-1)?.action,'lease.renew');equal(f.credentials().renew_key,undefined);runtime.close();
});
Deno.test('lost lease receipt retains operation key through browser runtime recreation',async()=>{
 const f=fixture(),first=f.make();f.lose();await fail(()=>first.tick());const key=f.credentials().acquire_key;first.close();
 const restored=f.make();await restored.tick();equal(f.calls[0].key,key);equal(f.calls[1].key,key);equal(f.credentials().epoch,1);equal(f.credentials().acquire_key,undefined);restored.close();
});
Deno.test('expired acquisition receipt uses a fresh operation and fences the old epoch',async()=>{
 const f=fixture(),first=f.make();f.lose();await fail(()=>first.tick());const old=f.credentials().acquire_key;first.close();f.now(61);
 const restored=f.make();await restored.tick();equal(f.calls[1].key,old);if(f.calls[2].key===old)throw new Error('Reused stale acquisition');equal(f.credentials().epoch,2);restored.close();
});
Deno.test('lost committed response receipt can be recovered after finalization without reacquiring',async()=>{
 const f=fixture(),runtime=f.make();await runtime.tick();f.lose();await fail(()=>runtime.command('response.append',{sequence:1,response:'answer'},'stable-answer'));f.finalize();await runtime.tick();
 equal(f.statuses.at(-1)?.ready,false);equal(await runtime.command('response.append',{sequence:1,response:'answer'},'stable-answer'),{saved:true});equal(f.calls.filter(row=>row.action==='lease.acquire').length,1);runtime.close();
});
Deno.test('offline errors preserve local lease until expiry and competing device is not bypassed',async()=>{
 const f=fixture(),runtime=f.make();await runtime.tick();f.offline(true);await fail(()=>runtime.tick());equal(f.statuses.at(-1)?.ready,true);equal(f.statuses.at(-1)?.problem,'offline');
 f.now(61);await fail(()=>runtime.tick());equal(f.statuses.at(-1)?.ready,false);f.offline(false);f.compete();await fail(()=>runtime.tick());equal(f.statuses.at(-1)?.problem,'device_lease_active');runtime.close();
});
Deno.test('paused assessments renew the lease and closed clients reject future commands',async()=>{
 const f=fixture(),runtime=f.make();await runtime.tick();f.pause();f.now(31);await runtime.tick();equal(f.calls.at(-1)?.action,'lease.renew');runtime.close();const count=f.calls.length;await fail(()=>runtime.command('attempt.submit',{},'submit-stable'));equal(f.calls.length,count);
});
Deno.test('overlapping browser commands are ordered and keep independent stable response keys',async()=>{
 const f=fixture(),runtime=f.make();await runtime.tick();await Promise.all([runtime.command('response.append',{sequence:1},'answer-one'),runtime.tick(),runtime.command('response.append',{sequence:2},'answer-two')]);
 equal(f.calls.filter(row=>row.action==='response.append').map(row=>[row.data.sequence,row.key]),[[1,'answer-one'],[2,'answer-two']]);runtime.close();
});
