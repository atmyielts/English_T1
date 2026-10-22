import {AttemptRuntime,type CoordinatorTransport,type LeaseCredentials,type RuntimeStatus} from '../src/runtime.ts';
const equal=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Expected ${JSON.stringify(b)}, received ${JSON.stringify(a)}`);};
const fail=async(work:()=>Promise<unknown>,code?:string)=>{let failure:unknown=null;try{await work();}catch(cause){failure=cause;}if(!failure)throw new Error('Expected failure');if(code)equal((failure as {code?:string}).code??(failure as Error).message,code);};
/** One canonical attempt shared by two browser devices, modelled on the server rules. */
function attempt(){
 const now=Date.parse('2030-01-01T11:00:00Z');let holder:string|null=null,epoch=0,expires=0;const superseded=new Set<string>(),receipts=new Map<string,unknown>(),calls:{device:string;action:string;takeover:boolean;key:string}[]=[];let saved=0;
 const snapshot=()=>({attempt_id:'attempt-a',state:'active',deadline_at:'2030-01-01T12:00:00Z',section_deadline_at:'2030-01-01T12:00:00Z',closes_at:'2030-01-01T13:00:00Z',section_index:0,last_sequence:saved,lease_epoch:epoch||null,lease_expires_at:expires?new Date(expires).toISOString():null,server_time:new Date(now).toISOString(),next_deadline_at:'2030-01-01T12:00:00Z'});
 const refuse=(code:string)=>Object.assign(new Error(code),{code});
 function device(id:string){
  let credentials:LeaseCredentials={device_id:id,token:id.padEnd(64,'0').slice(0,64)};const statuses:RuntimeStatus[]=[];let counter=0,lose=false;
  const transport:CoordinatorTransport={state:()=>Promise.resolve({snapshot:snapshot()}),command:async(action,data,key)=>{
   calls.push({device:id,action,takeover:data.takeover===true,key});
   if(receipts.has(id+key))return {result:receipts.get(id+key),snapshot:snapshot()};
   let result:unknown;
   if(action==='lease.acquire'){
    if(holder===id||holder===null){if(data.takeover)throw refuse('device_takeover_not_needed');holder=id;epoch++;expires=now+60000;result={epoch};}
    else if(!data.takeover)throw refuse(superseded.has(id)?'device_lease_superseded':'device_lease_active');
    else{superseded.add(holder);superseded.delete(id);result={epoch:epoch+1,takeover:{from_epoch:epoch,previous_lease_active:true,acknowledged_sequence:saved,saved_responses:saved}};holder=id;epoch++;expires=now+60000;}
   }else{
    const lease=data.lease as {device_id:string;epoch:number};
    if(lease.device_id!==holder||lease.epoch!==epoch)throw refuse(superseded.has(lease.device_id)?'device_lease_superseded':'device_lease_invalid');
    if(action==='response.append')saved++;result={saved};
   }
   receipts.set(id+key,result);if(lose){lose=false;throw new Error('lost reply');}return {result,snapshot:snapshot()};
  }};
  const runtime=new AttemptRuntime(transport,{read:()=>({...credentials}),write:value=>{credentials={...value};}},()=>{},status=>statuses.push(status),()=>now,()=>`${id}-key-${++counter}`);
  return {runtime,statuses,last:()=>statuses.at(-1),credentials:()=>credentials,lose:()=>{lose=true;}};
 }
 return {device,calls,saved:()=>saved,holder:()=>holder};
}
Deno.test('a second device asks before taking over and the first is then superseded, never silently re-acquiring',async()=>{
 const a=attempt(),laptop=a.device('laptop'),phone=a.device('phone');
 await laptop.runtime.tick();equal(laptop.last()?.ready,true);
 await laptop.runtime.command('response.append',{sequence:1},'answer-1');
 // The phone is refused and told to choose; repeated ticks do not try again by themselves.
 await fail(()=>phone.runtime.tick(),'device_lease_active');equal(phone.last()?.device,{kind:'takeover_required'});
 const attempts=a.calls.filter(row=>row.device==='phone').length;await phone.runtime.tick();equal(a.calls.filter(row=>row.device==='phone').length,attempts);
 await fail(()=>phone.runtime.command('response.append',{sequence:2},'phone-answer'));equal(a.saved(),1);
 // Confirmed, the phone takes over and learns what was already saved.
 await phone.runtime.takeover();equal(phone.last()?.ready,true);equal(phone.last()?.device,{kind:'took_over',saved_responses:1,acknowledged_sequence:1,previous_lease_active:true});equal(phone.credentials().takeover_key,undefined);
 // The laptop's next save is refused as superseded, and it does not take the attempt back on its own.
 await fail(()=>laptop.runtime.command('response.append',{sequence:2},'answer-2'),'device_lease_superseded');equal(laptop.last()?.device,{kind:'superseded'});
 const before=a.calls.filter(row=>row.device==='laptop').length;await laptop.runtime.tick();await laptop.runtime.tick();
 equal(a.calls.filter(row=>row.device==='laptop').length,before);equal(a.holder(),'phone');equal(a.saved(),1);
 await phone.runtime.command('response.append',{sequence:2},'phone-2');equal(a.saved(),2);
 // Taking it back is again an explicit choice.
 await laptop.runtime.takeover();equal(a.holder(),'laptop');equal(laptop.last()?.device?.kind,'took_over');
 await fail(()=>phone.runtime.command('response.append',{sequence:3},'phone-3'),'device_lease_superseded');
 laptop.runtime.close();phone.runtime.close();
});
Deno.test('a takeover reply lost in transit is retried with the same key, and an unnecessary takeover falls back to a normal acquisition',async()=>{
 const a=attempt(),laptop=a.device('laptop'),phone=a.device('phone');
 await laptop.runtime.tick();await fail(()=>phone.runtime.tick());
 phone.lose();await fail(()=>phone.runtime.takeover());const kept=phone.credentials().takeover_key;equal(typeof kept,'string');equal(a.holder(),'phone');
 await phone.runtime.takeover();const tries=a.calls.filter(row=>row.device==='phone'&&row.takeover);equal(tries.map(row=>row.key),[kept,kept]);equal(phone.last()?.device?.kind,'took_over');equal(phone.credentials().takeover_key,undefined);
 const b=attempt(),solo=b.device('solo');
 await solo.runtime.takeover();equal(b.holder(),'solo');equal(solo.last()?.ready,true);equal(solo.last()?.device??null,null);
 equal(b.calls.map(row=>[row.action,row.takeover]),[['lease.acquire',true],['lease.acquire',false]]);
 laptop.runtime.close();phone.runtime.close();solo.runtime.close();
});
