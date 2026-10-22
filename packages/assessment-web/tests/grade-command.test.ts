import {GradeCommands,type GradeIntent,type IntentStore} from '../src/grade-command.ts';
const equal=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);};
class Store implements IntentStore{value:GradeIntent|null=null;count=0;pending(){return Promise.resolve(this.value);}save(action:string,data:Record<string,unknown>){this.value={action,data,key:`stable-key-${++this.count}`};return Promise.resolve(this.value);}acknowledge(){this.value=null;return Promise.resolve();}}
const lock=<T>(work:()=>Promise<T>)=>work();
Deno.test('lost grading replies preserve one encrypted-store intent and stable key across runtime recreation',async()=>{
 const store=new Store(),keys:string[]=[];try{await new GradeCommands(store,intent=>{keys.push(intent.key);return Promise.reject(new Error('offline'));},lock).execute('mark.submit',{criteria:{a:6}});}catch{}
 equal(store.count,1);await new GradeCommands(store,intent=>{keys.push(intent.key);return Promise.resolve({id:'canonical-mark'});},lock).retry();equal(keys,['stable-key-1','stable-key-1']);equal(store.value,null);
});
Deno.test('an unresolved grading command cannot silently become a different mark or action',async()=>{
 const store=new Store(),commands=new GradeCommands(store,()=>Promise.reject(new Error('offline')),lock);try{await commands.execute('mark.submit',{criteria:{a:6}});}catch{}
 let failed=false;try{await commands.execute('grade.release',{run_id:'different'});}catch{failed=true;}equal(failed,true);equal(store.count,1);equal(store.value?.action,'mark.submit');
});
Deno.test('definitive review/validation failure clears intent while rate limits and timeouts retain it',async()=>{
 for(const status of [403,409,422,429,408,503]){const store=new Store(),commands=new GradeCommands(store,()=>Promise.reject({status}),lock);try{await commands.execute('grade.approve',{run_id:'run'});}catch{}equal(store.value!==null,[429,408,503].includes(status));}
});
Deno.test('command data is cloned and semantically reordered retries preserve intent identity',async()=>{
 const store=new Store(),data={criteria:{a:6,b:7}},commands=new GradeCommands(store,()=>Promise.reject(new Error('offline')),lock);try{await commands.execute('mark.submit',data);}catch{}data.criteria.a=9;equal((store.value?.data.criteria as {a:number}).a,6);
 const restored=new GradeCommands(store,()=>Promise.resolve({id:'mark'}),lock);await restored.execute('mark.submit',{criteria:{b:7,a:6}});equal(store.count,1);equal(store.value,null);
});
Deno.test('overlapping duplicate submissions share a receipt instead of creating another marking revision',async()=>{
 const store=new Store();let sends=0,release!:(value:unknown)=>void;const response=new Promise(resolve=>{release=resolve;});const commands=new GradeCommands(store,()=>{sends++;return response;},lock);
 const first=commands.execute('mark.submit',{criteria:{a:6}}),second=commands.execute('mark.submit',{criteria:{a:6}});await Promise.resolve();await Promise.resolve();release({id:'mark'});equal(await first,await second);equal(sends,1);equal(store.count,1);
});
