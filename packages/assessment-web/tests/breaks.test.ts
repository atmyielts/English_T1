import {breakAvailability,breakCommands,breakProblem,breakSecondsLeft,formatDuration,type BreakJournal} from '../src/breaks.ts';
import type {BreakState} from '../../assessment-core/src/accommodations.ts';
const equal=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);};
const policy={schema_version:'assessment.break-policy.v1' as const,clock:'stopped' as const,max_breaks:3,max_seconds:300,total_seconds:600};
const state=(overrides:Partial<BreakState>={}):BreakState=>({policy,revision:1,extra_seconds:0,used_breaks:0,used_seconds:0,active:null,...overrides});
class Journal implements BreakJournal{rows:{response:unknown;command_key:string}[]=[];count=0;closed=false;pending(){return Promise.resolve([...this.rows]);}append(_s:number,_k:string,value:unknown){const row={response:value,command_key:`break-key-${++this.count}`};this.rows=[row];return Promise.resolve(row);}acknowledge(){this.rows=[];return Promise.resolve();}close(){this.closed=true;}}
const lock=<T>(work:()=>Promise<T>)=>work();

Deno.test('no policy, a disabled policy and an active break never offer a new break',()=>{
 equal(breakAvailability(undefined).enabled,false);
 equal(breakAvailability(state({policy:{...policy,max_breaks:0,max_seconds:0,total_seconds:0}})).canBegin,false);
 equal(breakAvailability(state({active:{id:'b',started_at:'2026-10-22T10:00:00Z',ends_at:'2026-10-22T10:05:00Z',clock:'stopped'}})).canBegin,false);
});
Deno.test('allowance shrinks by both count and used time, matching the server rule',()=>{
 const half=breakAvailability(state({used_breaks:1,used_seconds:450}));
 equal([half.canBegin,half.remainingBreaks,half.remainingSeconds,half.nextBreakSeconds],[true,2,150,150]);
 equal(breakAvailability(state({used_breaks:3,used_seconds:10})).canBegin,false);
 equal(breakAvailability(state({used_breaks:1,used_seconds:599.6})).canBegin,false);
});
Deno.test('countdown uses server-corrected time and never goes negative',()=>{
 const active=state({active:{id:'b',started_at:'2026-10-22T10:00:00Z',ends_at:'2026-10-22T10:05:00Z',clock:'stopped'}});
 equal(breakSecondsLeft(active,Date.parse('2026-10-22T10:03:59.200Z')),61);
 equal(breakSecondsLeft(active,Date.parse('2026-10-22T10:06:00Z')),0);
 equal([formatDuration(61),formatDuration(3725)],['1:01','1:02:05']);
});
Deno.test('a lost break reply retries the same key and a different change waits for it',async()=>{
 const journal=new Journal(),keys:string[]=[];
 try{await breakCommands(journal,intent=>{keys.push(intent.key);return Promise.reject(new Error('offline'));},lock).execute('break.begin',{});}catch{/* uncertain */}
 let blocked=false;try{await breakCommands(journal,()=>Promise.resolve({}),lock).execute('break.end',{break_id:'x'});}catch{blocked=true;}equal(blocked,true);
 await breakCommands(journal,intent=>{keys.push(intent.key);return Promise.resolve({id:'canonical-break'});},lock).retry();
 equal(keys,['break-key-1','break-key-1']);equal(journal.rows.length,0);equal(journal.count,1);
});
Deno.test('a definitive refusal clears the intent; a timeout keeps it',async()=>{
 for(const [status,kept] of [[422,false],[403,false],[408,true],[503,true]] as const){const journal=new Journal();try{await breakCommands(journal,()=>Promise.reject({status}),lock).execute('break.begin',{});}catch{/* expected */}equal(journal.rows.length>0,kept);}
});
Deno.test('server refusal codes become candidate-readable explanations',()=>{
 equal(breakProblem(new Error('break_allowance_exhausted')),'Your approved break allowance has been used.');
 equal(breakProblem(new Error('attempt_not_active')).includes('proctor'),true);
});
