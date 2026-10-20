type Db={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{code?:string}|null}>};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export class ScopedDirectoryError extends Error{constructor(public status:number,message:string){super(message);this.name='ScopedDirectoryError';}}
export async function readAcademyScopedDirectory(db:Db,actorId:string,academyId:string,action:'contacts'|'classrooms'|'classroom-memberships',input:unknown={}){
 if(!uuid.test(actorId)||!uuid.test(academyId))throw new ScopedDirectoryError(403,'Forbidden');
 if(!object(input))throw new ScopedDirectoryError(400,'Choose a valid directory page.');
 const maximum=action==='classroom-memberships'?1000:300;
 const payload:Record<string,unknown>={limit:maximum};
 const key=action==='classroom-memberships'?'classroom_memberships':action;
 if(input.classroom_id!==undefined&&input.classroom_id!==null){if(typeof input.classroom_id!=='string'||!uuid.test(input.classroom_id))throw new ScopedDirectoryError(400,'Choose a valid classroom.');payload.classroom_id=input.classroom_id.toLowerCase();}
 if(input.limit!==undefined){const limit=typeof input.limit==='number'||typeof input.limit==='string'?Number(input.limit):NaN;if(!Number.isInteger(limit)||limit<1||limit>maximum)throw new ScopedDirectoryError(400,'Choose a valid directory page.');payload.limit=limit;}
 if(input.query!==undefined&&input.query!==null){if(typeof input.query!=='string'||input.query.length>120)throw new ScopedDirectoryError(400,'Search is limited to 120 characters.');payload.query=input.query.trim();}
 if(input.before_time!==undefined||input.before_id!==undefined){
  if(typeof input.before_time!=='string'||input.before_time.length>40||!Number.isFinite(Date.parse(input.before_time))||typeof input.before_id!=='string'||!uuid.test(input.before_id))throw new ScopedDirectoryError(400,'Choose a valid directory page.');
  payload.before_time=input.before_time;payload.before_id=input.before_id.toLowerCase();
 }
 const {data,error}=await db.rpc('academy_scoped_directory',{p_actor_id:actorId,p_academy_id:academyId,p_action:action,p_payload:payload});
 if(error){if(error.code==='42501')throw new ScopedDirectoryError(403,'Your current access does not cover these records.');
  if(error.code?.startsWith('22')||error.code==='P0001')throw new ScopedDirectoryError(400,'Choose a valid directory page.');
  throw new ScopedDirectoryError(503,'The directory is temporarily unavailable. Try again.');}
 if(!object(data)||!Array.isArray(data[key])||typeof data.has_more!=='boolean'
  ||data[key].some((row:unknown)=>!object(row)||row.academy_id!==academyId||typeof row.id!=='string'||!uuid.test(row.id)))throw new ScopedDirectoryError(503,'The directory returned an incomplete response. Try again.');
 if(data.has_more){
  const cursor=data.cursor,rows=data[key] as Record<string,unknown>[];
  if(!object(cursor)||typeof cursor.before_time!=='string'||!Number.isFinite(Date.parse(cursor.before_time))
   ||cursor.before_id!==rows.at(-1)?.id)throw new ScopedDirectoryError(503,'The directory returned an incomplete response. Try again.');
 }else if(data.cursor!==null)throw new ScopedDirectoryError(503,'The directory returned an incomplete response. Try again.');
 if(action==='classrooms'&&(data[key] as Record<string,unknown>[]).some(row=>typeof row.roster_visible!=='boolean'
   ||(row.roster_visible===false?row.member_count!==null:typeof row.member_count!=='number'||!Number.isInteger(row.member_count)||row.member_count<0)))throw new ScopedDirectoryError(503,'The directory returned an incomplete response. Try again.');
 return data;
}
