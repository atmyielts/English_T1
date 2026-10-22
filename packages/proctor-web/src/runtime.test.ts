import { ProctorRuntime,type RuntimeTransport } from './runtime.ts';
import type { BrowserEvent,BrowserEventKind,CandidateProctorState,EventStore,MonitoringStatus } from './types.ts';
const equal=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Expected ${JSON.stringify(b)}, received ${JSON.stringify(a)}`);};
const initial=():CandidateProctorState=>({session:{id:'session-1',state:'active',policy_snapshot:{} as never},attempt:{state:'active',deadline_at:'2030-01-01T12:00:00Z',section_deadline_at:'2030-01-01T12:00:00Z'},notices:[],server_time:'2030-01-01T11:00:00Z'});
class Store implements EventStore {
  entries:BrowserEvent[]=[];closed=false;failSave=false;seq=0;
  append(kind:BrowserEventKind,occurred_at:string){if(this.failSave)return Promise.reject(new Error('quota'));this.entries.push({stream_id:'stream-a',sequence:++this.seq,kind,occurred_at});return Promise.resolve();}
  pending(){return Promise.resolve([...this.entries]);}
  acknowledge(stream:string,sequences:number[]){this.entries=this.entries.filter(row=>row.stream_id!==stream||!sequences.includes(row.sequence));return Promise.resolve();}
  close(){this.closed=true;}
}
Deno.test('browser events retain queue and command keys across provider failures',async()=>{
 const store=new Store(),calls:{action:string;data:Record<string,unknown>;key:string}[]=[],status:MonitoringStatus[]=[];let offline=true;
 const transport:RuntimeTransport={state:()=>Promise.resolve(initial()),command:(action,data,key)=>{calls.push({action,data,key});return offline?Promise.reject(new Error('offline')):Promise.resolve({});}};
 const runtime=new ProctorRuntime('session-1',store,transport,()=>{},value=>status.push(value),()=>Date.parse('2030-01-01T11:00:00Z'));
 await runtime.emit('focus_loss');await runtime.tick();equal(store.entries.length,1);
 offline=false;await runtime.tick();equal(store.entries.length,0);
 const heartbeats=calls.filter(row=>row.action==='session.heartbeat');equal(heartbeats[0].key,heartbeats[1].key);
 equal(status.at(-1)?.problem,null);await runtime.close();equal(store.closed,true);
});
Deno.test('recovered event streams remain independently ordered in batches of at most 100',async()=>{
 const store=new Store();store.entries=Array.from({length:205},(_,index)=>({stream_id:'older-stream',sequence:index+1,kind:'client_loaded',occurred_at:'2030-01-01T11:00:00Z'}));
 store.entries.push({stream_id:'new-stream',sequence:1,kind:'focus_return',occurred_at:'2030-01-01T11:00:00Z'});
 const batches:number[]=[],streams:string[]=[];
 const runtime=new ProctorRuntime('session-1',store,{state:()=>Promise.resolve(initial()),command:(_action,data)=>{batches.push((data.events as unknown[]).length);streams.push(String(data.stream_id));return Promise.resolve({});}},()=>{},()=>{});
 await runtime.flush();equal(batches,[100,100,5,1]);equal(streams,['older-stream','older-stream','older-stream','new-stream']);equal(store.entries.length,0);await runtime.close();
});
Deno.test('a lost event acknowledgement retries the identical batch without discarding evidence',async()=>{
 const store=new Store(),keys:string[]=[];let failure=true;
 const runtime=new ProctorRuntime('session-1',store,{state:()=>Promise.resolve(initial()),command:(_action,_data,key)=>{keys.push(key);return failure?Promise.reject(new Error('lost receipt')):Promise.resolve({});}},()=>{},()=>{});
 await runtime.emit('paste');try{await runtime.flush();}catch{}equal(store.entries.length,1);failure=false;await runtime.flush();equal(keys[0],keys[1]);equal(store.entries.length,0);await runtime.close();
});
Deno.test('authoritative pause/resume state and notices are exposed without client invalidation',async()=>{
 const store=new Store(),observed:string[]=[],commands:string[]=[];let state=initial();state.attempt.state='paused';state.session!.state='paused';
 const runtime=new ProctorRuntime('session-1',store,{state:()=>Promise.resolve(state),command:(action)=>{commands.push(action);return Promise.resolve({});}},snapshot=>observed.push(snapshot.attempt.state),()=>{},()=>Date.parse('2030-01-01T11:00:00Z'));
 await runtime.tick();state={...state,attempt:{...state.attempt,state:'active'},session:{...state.session!,state:'active'}};await runtime.tick();
 equal(observed,['paused','active']);await runtime.acknowledge('notice-1');equal(commands.includes('notice.acknowledge'),true);equal(commands.some(action=>action.includes('invalidate')),false);await runtime.close();
});
Deno.test('finalized sessions stop collecting new events but drain existing evidence',async()=>{
 const store=new Store(),state=initial();state.session!.state='completed';state.attempt.state='submitted';const commands:string[]=[];
 const runtime=new ProctorRuntime('session-1',store,{state:()=>Promise.resolve(state),command:action=>{commands.push(action);return Promise.resolve({});}},()=>{},()=>{});
 await runtime.emit('offline');await runtime.tick();await runtime.emit('copy');equal(store.entries.length,0);equal(commands,['events.append']);await runtime.close();
});
Deno.test('local storage failure remains explicit and is never reported as synced success',async()=>{
 const store=new Store();store.failSave=true;const statuses:MonitoringStatus[]=[];
 const runtime=new ProctorRuntime('session-1',store,{state:()=>Promise.resolve(initial()),command:()=>Promise.resolve({})},()=>{},value=>statuses.push(value));
 await runtime.emit('copy');await runtime.tick();equal(statuses.at(-1)!.problem!.includes('could not be saved'),true);await runtime.close();
});
