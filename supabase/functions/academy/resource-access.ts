import { LegacyBoundaryError } from './legacy-boundary.ts';
type Row = Record<string, unknown>;
type Db = {rpc:(name:string,args:Row)=>PromiseLike<{data:unknown;error:{code?:string}|null}>};
export type FileKind='resource'|'submission'|'assignment';
const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export function validClassroomStorage(storage:Row, row:Row, kind:FileKind, bucket:string|null):boolean {
 if(!bucket || storage.provider!=='s3'||storage.bucket!==bucket||typeof storage.path!=='string')return false;
 if(!new RegExp('^'+uuid+'$','i').test(String(row.academy_id))||!new RegExp('^'+uuid+'$','i').test(String(row.classroom_id)))return false;
 const purpose=kind==='submission'?'submission':'resource';
 const prefix=`academy/${row.academy_id}/classrooms/${row.classroom_id}/${purpose}/`;
 return storage.path.startsWith(prefix)&&new RegExp('^'+uuid+'(?:\\.[a-zA-Z0-9_-]{1,30})?$','i').test(storage.path.slice(prefix.length));
}
export function retainedStorage(candidate:unknown,stored:unknown):boolean {
 const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)])):v;
 return JSON.stringify(canonical(candidate))===JSON.stringify(canonical(stored));
}
type Pending={record:Row;resolve:()=>void;reject:(e:unknown)=>void};
const queues=new WeakMap<object,Map<string,Pending[]>>();
export function verifyCurrentFile(db:Db,actor:string,row:Row,kind:FileKind,storage:Row):Promise<void> {
 let actors=queues.get(db);if(!actors){actors=new Map();queues.set(db,actors);}
 let queue=actors.get(actor);if(!queue){queue=[];actors.set(actor,queue);const pending=queue;setTimeout(()=>{actors!.delete(actor);void flush(db,actor,pending);},0);}
 return new Promise((resolve,reject)=>queue!.push({record:{record_key:crypto.randomUUID(),record_id:row.id,record_kind:kind,expected_storage:storage},resolve,reject}));
}
async function flush(db:Db,actor:string,pending:Pending[]) {
 for(let i=0;i<pending.length;i+=200){const batch=pending.slice(i,i+200);try{
  const {data,error}=await db.rpc('academy_files_access_context',{p_actor:actor,p_records:batch.map(p=>p.record)});
  if(error)throw new LegacyBoundaryError(error.code==='42501'?403:error.code==='23505'?409:503,'Unable to open this file. Refresh its current classroom.');
  const value=data as {actor_id?:string;records?:Row[]};if(value?.actor_id!==actor||value.records?.length!==batch.length)throw new LegacyBoundaryError(503);
  for(const entry of batch){const current=value.records.find(r=>r.record_key===entry.record.record_key);if(!current||!retainedStorage(current.storage,entry.record.expected_storage))throw new LegacyBoundaryError(409);}
  batch.forEach(p=>p.resolve());
 }catch(error){batch.forEach(p=>p.reject(error));}}
}
