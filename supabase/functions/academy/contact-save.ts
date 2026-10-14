type Row={id:string;primary_branch_id:string|null;user_id:string|null;created_by:string|null};
type Query={eq:(column:string,value:unknown)=>Query;maybeSingle:()=>PromiseLike<{data:Row|null;error:unknown}>};
type Db={from:(table:string)=>{select:(columns:string)=>Query}};
export class ContactSaveTargetError extends Error{
 constructor(public status:number,message:string){super(message);this.name='ContactSaveTargetError';}
}
// Resolve all identity keys, not whichever matches first. An explicit update
// cannot silently borrow another contact's phone/email or switch its login.
export async function resolveAcademyContactSaveTarget(db:Db,academyId:string,contactId:string,email:string|null,phone:string|null):Promise<Row|null>{
 const keys:[string,string][]=[];
 if(contactId)keys.push(['id',contactId]);if(email)keys.push(['email',email]);if(phone)keys.push(['phone',phone]);
 const results=await Promise.all(keys.map(([key,value])=>db.from('academy_contacts').select('id,primary_branch_id,user_id,created_by').eq('academy_id',academyId).eq(key,value).maybeSingle()));
 if(results.some(result=>result.error))throw new ContactSaveTargetError(503,'Contact verification is temporarily unavailable. Try again.');
 if(contactId&&!results[0]?.data)throw new ContactSaveTargetError(404,'Contact not found');
 const matches=results.flatMap(result=>result.data?[result.data]:[]);
 if(new Set(matches.map(row=>row.id)).size>1)throw new ContactSaveTargetError(409,'The email and phone belong to different contacts. Ask an administrator to resolve them.');
 return matches[0]??null;
}
export function academyContactSavePayload(fields:Record<string,unknown>,target:Row|null,actorId:string,matchedUserId:string|null,branchId:string|null){
 return {...fields,user_id:target?.user_id??matchedUserId,
  ...(target?{}:{created_by:actorId}),
  ...(branchId?{primary_branch_id:branchId}:{})};
}
