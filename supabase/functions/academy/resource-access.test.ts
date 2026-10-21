import{validClassroomStorage,retainedStorage,verifyCurrentFile}from'./resource-access.ts';
import{LegacyBoundaryError}from'./legacy-boundary.ts';
const a='11111111-1111-4111-8111-111111111111',c='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
const row={id,academy_id:a,classroom_id:c},storage={provider:'s3',bucket:'owned',path:`academy/${a}/classrooms/${c}/resource/${id}.pdf`};
const assert=(value:unknown)=>{if(!value)throw Error('Assertion failed');};
Deno.test('private files require the configured bucket, exact classroom and safe upload purpose',()=>{
 assert(validClassroomStorage(storage,row,'resource','owned'));
 for(const candidate of [{...storage,provider:'supabase'},{...storage,bucket:'foreign'},{...storage,path:storage.path.replace(c,a)},{...storage,path:storage.path.replace('/resource/','/submission/')},{...storage,path:storage.path+'/../secret'},{...storage,path:storage.path+'?query'}])assert(!validClassroomStorage(candidate,row,'resource','owned'));
 assert(!validClassroomStorage(storage,row,'submission','owned'));
 assert(!validClassroomStorage(storage,row,'resource',null));
 assert(retainedStorage({path:'a',bucket:'b'},{bucket:'b',path:'a'}));assert(!retainedStorage({path:'b'},{path:'a'}));
});
Deno.test('current file checks batch at 200 without caching settled authority',async()=>{
 let calls=0;const db={rpc:(_name:string,args:Record<string,unknown>)=>{calls++;const records=args.p_records as Record<string,unknown>[];assert(records.length<=200);return Promise.resolve({data:{actor_id:a,records:records.map(r=>({...r,storage:r.expected_storage}))},error:null});}};
 await Promise.all(Array.from({length:450},()=>verifyCurrentFile(db,a,row,'resource',storage)));assert(calls===3);
 await verifyCurrentFile(db,a,row,'resource',storage);assert(calls===4);
});
Deno.test('revoked or replaced stored files never produce an authorization success',async()=>{
 for(const code of ['42501','23505']){let status=0;try{await verifyCurrentFile({rpc:()=>Promise.resolve({data:null,error:{code}})},a,row,'resource',storage);}catch(e){status=(e as LegacyBoundaryError).status;}assert(status===(code==='42501'?403:409));}
});
