import {decodeStudentImportConfig,decodeStudentImportRows,StudentImportInputError} from './student-import-input.ts';

type Db = {rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{code?:string;message:string}|null}>};
const actions={student_import_options:'options',student_import_stage:'stage',student_import_preview:'preview',student_import_commit:'commit',student_import_recover:'recover',student_import_job:'job',student_import_rows:'rows',student_import_list:'list',student_import_lookup:'lookup',student_import_cancel:'cancel'} as const;
export const studentImportActions=new Set(Object.keys(actions));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
export class StudentImportServiceError extends Error {
 constructor(public status:number,message:string,public retryable=false){super(message);this.name='StudentImportServiceError';}
}
const invalid=(message:string):never=>{throw new StudentImportServiceError(400,message);};
const key=(value:unknown)=>{
 if(typeof value!=='string'||!value.trim()||value.length>180)return invalid('A valid import request key is required.');
 return value.trim();
};

// The query action identifies the bounded JSON endpoint before any body is
// buffered. Reading a huge or multipart import request cannot exhaust the
// generic Academy media decoder.
export async function readStudentImportRequest(req:Request):Promise<Record<string,unknown>>{
 if(req.method!=='POST')throw new StudentImportServiceError(405,'Use POST for student imports.');
 if(!req.headers.get('content-type')?.toLowerCase().includes('application/json'))return invalid('Student imports require JSON data.');
 const max=2*1024*1024,declared=Number(req.headers.get('content-length'));
 if(Number.isFinite(declared)&&declared>max)throw new StudentImportServiceError(413,'The upload batch is too large.');
 const reader=req.body?.getReader();if(!reader)return invalid('Import data is required.');
 const chunks:Uint8Array[]=[];let size=0;
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
   if(size>max){await reader.cancel();throw new StudentImportServiceError(413,'The upload batch is too large.');}chunks.push(value);}
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!object(body))return invalid('Import data is required.');return body;}
 catch(error){if(error instanceof StudentImportServiceError)throw error;return invalid('The import request contains invalid JSON.');}
}

export async function handleStudentImportService(db:Db,action:string,raw:unknown,actorId:string):Promise<Record<string,unknown>>{
 if(!Object.hasOwn(actions,action)||!uuid.test(actorId))throw new StudentImportServiceError(403,'Forbidden');
 if(!object(raw)||typeof raw.academy_id!=='string'||!uuid.test(raw.academy_id))return invalid('Choose a valid academy.');
 const command=actions[action as keyof typeof actions],payload:Record<string,unknown>={};
 if(command==='stage'){
  try{
   const config=decodeStudentImportConfig(raw.settings),rows=decodeStudentImportRows(raw.rows,config,raw.offset);
   if(typeof raw.seal!=='boolean')return invalid('Choose whether the upload is complete.');
   Object.assign(payload,{key:key(raw.key),settings:config,rows,offset:raw.offset,seal:raw.seal});
  }catch(error){if(error instanceof StudentImportInputError)throw new StudentImportServiceError(error.status,error.message);throw error;}
 }else if(!['options','list','lookup'].includes(command)){
  if(typeof raw.job_id!=='string'||!uuid.test(raw.job_id))return invalid('Choose a valid import.');
  payload.job_id=raw.job_id.toLowerCase();
 }
 if(command==='lookup')payload.key=key(raw.key);
 if(command==='commit'){
  if(typeof raw.preview_hash!=='string'||!/^[0-9a-f]{64}$/.test(raw.preview_hash))return invalid('Review the current import preview before importing.');
  payload.key=key(raw.key);payload.preview_hash=raw.preview_hash;
 }
 if(command==='recover'){
  if(typeof raw.reason!=='string'||!raw.reason.trim()||raw.reason.length>1000)return invalid('Explain why this import needs correction.');
  payload.key=key(raw.key);payload.reason=raw.reason.trim();
 }
 if(command==='rows'){
  const offset=raw.offset??0,limit=raw.limit??50;
  if(typeof offset!=='number'||!Number.isInteger(offset)||offset<0||offset>5000||typeof limit!=='number'||!Number.isInteger(limit)||limit<1||limit>100)return invalid('Choose a valid preview page.');
  payload.offset=offset;payload.limit=limit;
 }
 if(command==='list'&&(raw.before_time!==undefined||raw.before_id!==undefined)){
  if(typeof raw.before_time!=='string'||raw.before_time.length>40||!Number.isFinite(Date.parse(raw.before_time))||typeof raw.before_id!=='string'||!uuid.test(raw.before_id))return invalid('Choose a valid import-history page.');
  payload.before_time=raw.before_time;payload.before_id=raw.before_id.toLowerCase();
 }
 const {data,error}=await db.rpc('academy_student_import_command',{
  p_academy_id:raw.academy_id.toLowerCase(),p_actor_id:actorId.toLowerCase(),p_action:command,p_payload:payload,
 });
 if(error){
  if(error.code==='42501')throw new StudentImportServiceError(403,'Your current access does not cover this import. Ask an academy owner to review it.');
  if(['PGRST202','PGRST205','57014','55P03','40001','40P01'].includes(error.code??''))throw new StudentImportServiceError(503,'The import is temporarily unavailable. Keep this request and try again.',true);
  if(error.code==='P0001'||error.code?.startsWith('22'))throw new StudentImportServiceError(400,'The import could not be applied. Check the file settings and current preview.');
  throw new StudentImportServiceError(503,'We could not confirm the import result. Keep this request and check its status before trying again.',true);
 }
 if(!object(data))throw new StudentImportServiceError(503,'We could not confirm the import result. Check its status before trying again.',true);
 if(command==='lookup'&&(typeof data.found!=='boolean'||(data.found===false&&data.job!==undefined&&data.job!==null)))throw new StudentImportServiceError(503,'Import status is unavailable. Try again.',true);
 if(command==='options'){
  if(!Array.isArray(data.branches)||!Array.isArray(data.groups)||!object(data.limits))throw new StudentImportServiceError(503,'Import setup is unavailable. Try again.',true);
 }else if(command==='list'){
  if(!Array.isArray(data.jobs)||typeof data.has_more!=='boolean')throw new StudentImportServiceError(503,'Import history is unavailable. Try again.',true);
 }else if(command!=='lookup'||data.found!==false){
  if(!object(data.job)||typeof data.job.id!=='string'||!uuid.test(data.job.id)||data.job.academy_id!==raw.academy_id.toLowerCase()
   ||(payload.job_id!==undefined&&data.job.id!==payload.job_id))throw new StudentImportServiceError(503,'The import returned an incomplete result. Check its status before trying again.',true);
  if(command==='rows'&&(!Array.isArray(data.rows)||typeof data.has_more!=='boolean'))throw new StudentImportServiceError(503,'The import preview is unavailable. Try again.',true);
 }
 return data;
}
