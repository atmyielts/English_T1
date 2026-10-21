import type { BrowserEvent, BrowserEventKind, EventStore } from './types.ts';
type Envelope = { id: string; scope: string; stream: string; sequence: number; iv: Uint8Array; encrypted: ArrayBuffer };
const read = <T>(store: IDBObjectStore, key: IDBValidKey) => new Promise<T | undefined>((resolve,reject) => { const req=store.get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error); });
const complete = (tx: IDBTransaction) => new Promise<void>((resolve,reject) => { tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error); });
function open() {
  return new Promise<IDBDatabase>((resolve,reject) => {
    const req=indexedDB.open('schood-proctor-journal',1);
    req.onupgradeneeded=()=>{req.result.createObjectStore('keys');const entries=req.result.createObjectStore('events',{keyPath:'id'});entries.createIndex('scope','scope');};
    req.onerror=()=>reject(req.error);req.onsuccess=()=>resolve(req.result);
  });
}
/** One random stream per document instance. Pending older streams survive reload and are drained in order. */
export class ProctorJournal implements EventStore {
  private sequence=0;
  private writes: Promise<void>=Promise.resolve();
  private constructor(private db: IDBDatabase,private scope: string,private key: CryptoKey,private stream=crypto.randomUUID()) {}
  static async create(scope: string) {
    const db=await open();
    try {
      let key=await read<CryptoKey>(db.transaction('keys').objectStore('keys'),scope);
      if(!key) {
        const generated=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
        const tx=db.transaction('keys','readwrite'),done=complete(tx);
        const stored=await read<CryptoKey>(tx.objectStore('keys'),scope);key=stored??generated;
        if(!stored)tx.objectStore('keys').put(key,scope);
        await done;
      }
      return new ProctorJournal(db,scope,key);
    } catch(cause) { db.close();throw cause; }
  }
  append(kind: BrowserEventKind,occurredAt: string) {
    const work=this.writes.then(async()=>{
      const sequence=this.sequence+1,event: BrowserEvent={stream_id:this.stream,sequence,kind,occurred_at:occurredAt};
      const id=`${this.scope}:${this.stream}:${sequence}`,iv=crypto.getRandomValues(new Uint8Array(12));
      const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(id)},this.key,new TextEncoder().encode(JSON.stringify(event)));
      const tx=this.db.transaction('events','readwrite'),done=complete(tx);
      tx.objectStore('events').add({id,scope:this.scope,stream:this.stream,sequence,iv,encrypted} satisfies Envelope);
      await done;this.sequence=sequence;
    });
    this.writes=work.catch(()=>{});return work;
  }
  async pending() {
    await this.writes;
    const envelopes=await new Promise<Envelope[]>((resolve,reject)=>{const req=this.db.transaction('events').objectStore('events').index('scope').getAll(this.scope);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
    const entries=await Promise.all(envelopes.map(async envelope=>{
      const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:envelope.iv as Uint8Array<ArrayBuffer>,additionalData:new TextEncoder().encode(envelope.id)},this.key,envelope.encrypted);
      return JSON.parse(new TextDecoder().decode(plaintext)) as BrowserEvent;
    }));
    return entries.sort((a,b)=>a.stream_id.localeCompare(b.stream_id)||a.sequence-b.sequence);
  }
  async acknowledge(stream: string,sequences: number[]) {
    const tx=this.db.transaction('events','readwrite'),done=complete(tx);
    for(const sequence of sequences)tx.objectStore('events').delete(`${this.scope}:${stream}:${sequence}`);
    await done;
  }
  close() { this.db.close(); }
}
