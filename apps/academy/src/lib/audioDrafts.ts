import type {AudioDraft} from './assignmentAudio';
const database='schood.academy.audio.v1';
type StoredDraft={file:Blob;name:string;lastModified:number;text:string;requestKey:string;pending:boolean;revision:number};
function open(){return new Promise<IDBDatabase>((resolve,reject)=>{
 const request=indexedDB.open(database,1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});}
async function transaction<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore)=>IDBRequest<T>){
 const db=await open();try{return await new Promise<T>((resolve,reject)=>{const tx=db.transaction('drafts',mode),request=work(tx.objectStore('drafts'));tx.oncomplete=()=>resolve(request.result);tx.onabort=tx.onerror=()=>reject(tx.error??new Error('Audio draft storage is unavailable.'));});}finally{db.close();}
}
export const audioDraftKey=(actor:string,academy:string,assignment:string,kind:string,submission?:string,attempt?:number)=>JSON.stringify([actor,academy,assignment,kind,kind==='feedback'?submission??null:null,kind==='feedback'?attempt??null:null]);
export async function readAudioDraft(key:string):Promise<AudioDraft|null>{
 const row=await transaction<StoredDraft|undefined>('readonly',store=>store.get(key));if(!row)return null;
 if(!(row.file instanceof Blob)||row.file.size>20*1024*1024||typeof row.text!=='string'||typeof row.requestKey!=='string')throw Error('The saved audio draft could not be read.');
 return {...row,file:new File([row.file],row.name,{type:row.file.type,lastModified:row.lastModified})};
}
export async function saveAudioDraft(key:string,draft:AudioDraft,expectedPendingRevision?:number){
 const db=await open();try{return await new Promise<boolean>((resolve,reject)=>{
  const tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts'),request=store.get(key);let saved=false;
  request.onsuccess=()=>{const old=request.result as StoredDraft|undefined;
   if(old&&old.requestKey!==draft.requestKey){tx.abort();return;}
   if(old?.pending){
    const frozen=old.text===draft.text&&old.name===draft.file.name&&old.lastModified===draft.file.lastModified&&old.file.size===draft.file.size&&old.file.type===draft.file.type;
    if(!frozen||(!draft.pending&&expectedPendingRevision!==old.revision)){tx.abort();return;}
   }
   if((old?.revision??0)>draft.revision)return;
   store.put({file:draft.file,name:draft.file.name,lastModified:draft.file.lastModified,text:draft.text,requestKey:draft.requestKey,pending:draft.pending,revision:draft.revision} satisfies StoredDraft,key);saved=true;
  };
  tx.oncomplete=()=>resolve(saved);tx.onabort=tx.onerror=()=>reject(tx.error??new Error('Confirm the pending recording before starting another.'));
 });}finally{db.close();}
}
export async function removeAudioDraft(key:string,requestKey:string,expectedRevision:number){
 const db=await open();try{return await new Promise<boolean>((resolve,reject)=>{const tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts'),request=store.get(key);let removed=false;request.onsuccess=()=>{if(request.result===undefined){removed=true;return;}if(request.result?.requestKey===requestKey&&request.result.revision===expectedRevision){store.delete(key);removed=true;}};tx.oncomplete=()=>resolve(removed);tx.onabort=tx.onerror=()=>reject(tx.error);});}finally{db.close();}
}
