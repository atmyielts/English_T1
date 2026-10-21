import{runBookingCommand}from'./booking-command.ts';import{runStudentCollection}from'./collection-command.ts';import{LegacyImportCommandError}from'./legacy-import-command.ts';
const assert=(v:unknown)=>{if(!v)throw Error('Assertion failed');},actor='owned-actor',academy='owned-academy';
const booking={idempotency_key:'owned-booking',classroom_id:'owned-class',title:'Owned lesson',_expected_actor:actor};
Deno.test('booking binds verified identity and removes untrusted server fields',async()=>{
 let args:Record<string,unknown>={};const result={actor_id:actor,request_key:booking.idempotency_key,command:'create_lesson_session',replayed:false,session:{id:'owned-session',academy_id:academy,classroom_id:booking.classroom_id}};
 assert(await runBookingCommand({rpc:(name,value)=>{assert(name==='academy_booking_command');args=value;return Promise.resolve({data:result,error:null});}},academy,actor,{...booking,actor_id:'forged',metadata:{forged:true}})===result);assert(args.p_actor===actor&&!('metadata'in(args.p_payload as object))&&!('actor_id'in(args.p_payload as object)));
});
Deno.test('booking actor switch is refused before transport and clash is a decisive conflict',async()=>{
 try{await runBookingCommand({rpc:()=>{throw Error('Unexpected RPC');}},academy,actor,{...booking,_expected_actor:'foreign'});throw Error('Actor switch accepted');}catch(e){assert(e instanceof LegacyImportCommandError&&e.status===409);}
 for(const[code,status]of[['23P01',409],['42501',403],['P0001',400],['57014',503]]as const){try{await runBookingCommand({rpc:()=>Promise.resolve({data:null,error:{code}})},academy,actor,booking);throw Error('Accepted failure');}catch(e){assert(e instanceof LegacyImportCommandError&&e.status===status&&e.retryable===(status===503));}}
});
const collection={idempotency_key:'owned-collection',contact_id:'owned-student',shift_id:'owned-shift',amount:'0010',currency:'UZS',payment_method:'cash',reason:'Owned receipt',_expected_actor:actor};
Deno.test('collection canonicalizes whole units and accepts only coherent linked receipts',async()=>{
 let args:Record<string,unknown>={};const result={actor_id:actor,request_key:collection.idempotency_key,command:'collect_student_payment',replayed:false,payment:{id:'owned-payment',academy_id:academy,contact_id:collection.contact_id,status:'paid',amount:'10'},cash_movement:{academy_payment_id:'owned-payment',shift_id:collection.shift_id,amount:'10'},ledger_entry:{payment_id:'owned-payment',amount:'-10'}};
 assert(await runStudentCollection({rpc:(name,value)=>{assert(name==='academy_collect_student_payment');args=value;return Promise.resolve({data:result,error:null});}},academy,actor,{...collection,metadata:{forged:true}})===result);assert((args.p_payload as Record<string,unknown>).amount==='10'&&!('metadata'in(args.p_payload as object)));
 for(const patch of [{cash_movement:{...result.cash_movement,academy_payment_id:'foreign'}},{ledger_entry:{payment_id:'foreign',amount:'-10'}},{actor_id:'foreign'}]){try{await runStudentCollection({rpc:()=>Promise.resolve({data:{...result,...patch},error:null})},academy,actor,collection);throw Error('Accepted unlinked receipt');}catch(e){assert(e instanceof LegacyImportCommandError&&e.status===503);}}
});
Deno.test('collection cannot forge Click settlement, accept decimals, overflow or switch actors',async()=>{
 for(const patch of [{payment_method:'click'},{amount:'1.5'},{amount:'0'},{amount:'2147483648'},{_expected_actor:'foreign'}]){let called=false;try{await runStudentCollection({rpc:()=>{called=true;throw Error('Unexpected RPC');}},academy,actor,{...collection,...patch});throw Error('Accepted invalid collection');}catch(e){assert(!called&&e instanceof LegacyImportCommandError&&[400,409].includes(e.status));}}
});
