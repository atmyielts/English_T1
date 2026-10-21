import type {DraftRecord,DraftStore} from './draft';
import {draftReceiptBinding} from './draft';
interface Envelope{scope:string;version:string;iv:Uint8Array;encrypted:ArrayBuffer}
const open=()=>new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('schood-assessment-drafts',1);request.onupgradeneeded=()=>{request.result.createObjectStore('keys');request.result.createObjectStore('drafts',{keyPath:'scope'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
const read=<T>(store:IDBObjectStore,key:IDBValidKey)=>new Promise<T|undefined>((resolve,reject)=>{const req=store.get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
const complete=(tx:IDBTransaction)=>new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
/** Independent connections per operation remain usable after a component unmounts; no plaintext value/source is persisted. */
export async function openDraftStore<T>(scope:string):Promise<DraftStore<T>>{
 const db=await open();let key:CryptoKey|undefined;
 try{key=await read<CryptoKey>(db.transaction('keys').objectStore('keys'),scope);if(!key){const generated=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);const tx=db.transaction('keys','readwrite'),done=complete(tx),stored=await read<CryptoKey>(tx.objectStore('keys'),scope);key=stored??generated;if(!stored)tx.objectStore('keys').put(key,scope);await done;}}finally{db.close();}
 const aad=(version:string)=>new TextEncoder().encode(JSON.stringify([scope,version]));
 return {
  async head(){const connection=await open();try{return (await read<Envelope>(connection.transaction('drafts').objectStore('drafts'),scope))?.version??null;}finally{connection.close();}},
  async read(){const connection=await open();let row:Envelope|undefined;try{row=await read<Envelope>(connection.transaction('drafts').objectStore('drafts'),scope);}finally{connection.close();}if(!row)return null;const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:row.iv as Uint8Array<ArrayBuffer>,additionalData:aad(row.version)},key!,row.encrypted);const value=JSON.parse(new TextDecoder().decode(bytes)) as DraftRecord<T>;if(value.version!==row.version||typeof value.source!=='string'||typeof value.updatedAt!=='string')throw new Error('The encrypted draft envelope is invalid.');return value;},
  async replace(expected,next){const iv=crypto.getRandomValues(new Uint8Array(12)),encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(next.version)},key!,new TextEncoder().encode(JSON.stringify(next)));const connection=await open();const tx=connection.transaction('drafts','readwrite'),done=complete(tx);try{const store=tx.objectStore('drafts'),current=await read<Envelope>(store,scope);const match=(current?.version??null)===expected;if(match)store.put({scope,version:next.version,iv,encrypted} satisfies Envelope);await done;return match;}catch(cause){await done.catch(()=>{});throw cause;}finally{connection.close();}}
 };
}
export async function acknowledgeCommittedDraft(value:unknown,tenant:string,actor:string){
 const token=draftReceiptBinding(value,tenant,actor);if(!token)return true;const store=await openDraftStore(token.scope);if(await store.replace(token.version,{version:crypto.randomUUID(),source:'canonical-receipt',value:null,updatedAt:new Date().toISOString()}))return true;try{return (await store.read())?.value===null;}catch{return false;}
}
