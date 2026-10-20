import {runFinanceCommand,runFinanceRead} from './finance-command.ts';
const assert=(condition:unknown)=>{if(!condition)throw Error('Finance adapter assertion failed');};
const rejected=async(action:()=>Promise<unknown>,status:number)=>{try{await action();}catch(error){assert((error as {status:number}).status===status);return;}throw Error('Expected refusal');};
Deno.test('finance dispatch binds the authenticated actor, excludes transport fields and preserves exact units',async()=>{
 let calls=0;
 const db={rpc:(name:string,args:Record<string,unknown>)=>{
  calls++;assert(name==='academy_finance_command'&&args.p_actor_id==='owned-actor');
  const p=args.p_payload as Record<string,unknown>;assert(p.amount==='9007199254740993'&&!('actor_id'in p)&&!('academy_id'in p)&&!('action'in p));
  return Promise.resolve({data:{actor_id:args.p_actor_id,request_key:args.p_request_key,replayed:false},error:null});
 }};
 await runFinanceCommand(db,'owned-academy','owned-actor','post_account_adjustment',{action:'finance_command',actor_id:'forged',academy_id:'forged',idempotency_key:'owned-key',amount:'9007199254740993'});
 await rejected(()=>runFinanceCommand(db,'owned-academy','owned-actor','delete_payment',{}),400);
 await rejected(()=>runFinanceCommand(db,'owned-academy','owned-actor','post_account_adjustment',{idempotency_key:42}),400);assert(calls===1);
});
Deno.test('legacy finance identities canonicalize payload order and bind actor and command',async()=>{
 const keys:string[]=[];const db={rpc:(_name:string,args:Record<string,unknown>)=>{keys.push(String(args.p_request_key));return Promise.resolve({data:{actor_id:args.p_actor_id,request_key:args.p_request_key,replayed:false},error:null});}};
 await runFinanceCommand(db,'a','actor','create_cashbox',{name:'Owned',branch_id:'b'});
 await runFinanceCommand(db,'a','actor','create_cashbox',{branch_id:'b',name:'Owned'});
 await runFinanceCommand(db,'a','other','create_cashbox',{branch_id:'b',name:'Owned'});assert(keys[0]===keys[1]&&keys[0]!==keys[2]);
});
Deno.test('finance errors distinguish authority/conflict/invalid input from uncertain outcomes',async()=>{
 for(const [code,status]of [['42501',403],['23505',409],['22023',400],['23514',400],['57014',503]]as const){
  await rejected(()=>runFinanceCommand({rpc:()=>Promise.resolve({data:null,error:{code}})},'a','actor','record_cash_movement',{idempotency_key:'owned'}),status);
 }
 await rejected(()=>runFinanceCommand({rpc:()=>Promise.resolve({data:{actor_id:'other',request_key:'owned',replayed:false},error:null})},'a','actor','record_cash_movement',{idempotency_key:'owned'}),503);
});
Deno.test('financial reads refuse foreign or incomplete snapshots and propagate current scope denials',async()=>{
 await rejected(()=>runFinanceRead({rpc:()=>Promise.resolve({data:{actor_id:'other',schema_version:1,totals:{},has_more:{}},error:null})},'a','actor','commercial_core',{}),503);
 await rejected(()=>runFinanceRead({rpc:()=>Promise.resolve({data:null,error:{code:'42501'}})},'a','actor','operations_finance',{}),403);
 const result=await runFinanceRead({rpc:()=>Promise.resolve({data:{actor_id:'actor',schema_version:1,totals:{},has_more:{}},error:null})},'a','actor','commercial_core',{});assert(result.actor_id==='actor');
});
