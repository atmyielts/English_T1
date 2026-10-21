import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import ts from'typescript';
const code=ts.transpileModule(readFileSync('apps/academy/src/lib/telegramCommand.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const api=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')),store=new Map();Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)}});
const payload={academy_id:'owned-academy',session_id:'owned-lesson',records:[{contact_id:'owned-child',status:'absent'}],idempotency_key:'owned-key',initData:'must-not-be-retained'};
const receipt={actor_id:'owned-actor',academy_id:'owned-academy',request_key:'owned-key',command:'teacher_lesson_attendance',replayed:true};
test('Telegram retry retains original intent and key across reload without retaining provider authentication',async()=>{
 store.clear();await assert.rejects(api.telegramCommand('owned-actor','owned-academy','teacher_lesson_attendance',payload,async()=>{throw Object.assign(Error('Lost reply'),{status:503});}));
 const saved=api.pendingTelegramCommand('owned-actor','owned-academy');assert(saved);assert.equal(saved.payload.records[0].status,'absent');assert(!JSON.stringify(saved).includes('must-not-be-retained'));assert.equal(saved.payload._expected_actor,'owned-actor');
 let captured;const result=await api.telegramCommand('owned-actor','owned-academy',saved.action,{...payload,idempotency_key:'new-button-key'},async(_action,value)=>{captured=value;return receipt;});assert.equal(result,receipt);assert.equal(captured.idempotency_key,'owned-key');assert.equal(api.pendingTelegramCommand('owned-actor','owned-academy'),null);
});
test('uncertain Telegram requests cannot switch account, academy, command or attendance contents',async()=>{
 store.clear();await assert.rejects(api.telegramCommand('owned-actor','owned-academy','teacher_lesson_attendance',payload,async()=>{throw Error('Transport interrupted');}));assert.equal(api.pendingTelegramCommand('other-actor','owned-academy'),null);assert.equal(api.pendingTelegramCommand('owned-actor','other-academy'),null);
 let sent=false;await assert.rejects(api.telegramCommand('owned-actor','owned-academy','teacher_lesson_attendance',{...payload,records:[{contact_id:'owned-child',status:'present'}]},async()=>{sent=true;}),/pending change/);assert(!sent);await assert.rejects(api.telegramCommand('owned-actor','owned-academy','teacher_lesson_finish',{idempotency_key:'different'},async()=>{sent=true;}),/pending change/);assert(!sent);
});
test('foreign receipts remain uncertain and current access rejection releases the local pending request',async()=>{
 store.clear();await assert.rejects(api.telegramCommand('owned-actor','owned-academy','teacher_lesson_attendance',payload,async()=>({...receipt,actor_id:'foreign'})));assert(api.pendingTelegramCommand('owned-actor','owned-academy'));
 await assert.rejects(api.telegramCommand('owned-actor','owned-academy','teacher_lesson_attendance',payload,async()=>({...receipt,academy_id:'foreign-academy'})));assert(api.pendingTelegramCommand('owned-actor','owned-academy'));
 await assert.rejects(api.telegramCommand('owned-actor','owned-academy','teacher_lesson_attendance',payload,async()=>{throw Object.assign(Error('Current assignment revoked'),{status:403});}));assert.equal(api.pendingTelegramCommand('owned-actor','owned-academy'),null);
});
