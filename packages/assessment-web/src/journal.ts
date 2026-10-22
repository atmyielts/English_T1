/** Candidate response spool. No credentials or plaintext answers are stored in the database. */
export interface PendingResponse { sequence: number; item_version_id: string; response: unknown; command_key: string }
type Envelope = { id: string; scope: string; sequence: number; iv: Uint8Array; encrypted: ArrayBuffer };
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('schood-assessment-journal', 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('keys'); const entries = req.result.createObjectStore('entries', { keyPath: 'id' }); entries.createIndex('scope', 'scope'); };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}
const read = <T>(store: IDBObjectStore, key: IDBValidKey) => new Promise<T | undefined>((resolve, reject) => { const req = store.get(key); req.onsuccess = () => resolve(req.result as T); req.onerror = () => reject(req.error); });
const complete = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
export class ResponseJournal {
  private constructor(private db: IDBDatabase, private scope: string, private key: CryptoKey) {}
  static async create(scope: string) {
    const db = await open();
    let key = await read<CryptoKey>(db.transaction('keys').objectStore('keys'), scope);
    if (!key) {
      const generated = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt']);
      const tx = db.transaction('keys','readwrite');
      const stored = await read<CryptoKey>(tx.objectStore('keys'), scope);
      key = stored ?? generated;
      if (!stored) tx.objectStore('keys').put(key, scope);
      await complete(tx);
    }
    return new ResponseJournal(db,scope,key);
  }
  async pending(): Promise<PendingResponse[]> {
    const envelopes = await new Promise<Envelope[]>((resolve,reject) => { const req = this.db.transaction('entries').objectStore('entries').index('scope').getAll(this.scope); req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error); });
    const result = await Promise.all(envelopes.map(async envelope => {
      const plaintext = await crypto.subtle.decrypt({name:'AES-GCM',iv:envelope.iv as Uint8Array<ArrayBuffer>,additionalData:new TextEncoder().encode(envelope.id)},this.key,envelope.encrypted);
      return JSON.parse(new TextDecoder().decode(plaintext)) as PendingResponse;
    }));
    return result.sort((a,b)=>a.sequence-b.sequence);
  }
  async append(sequence: number, item_version_id: string, response: unknown) {
    const entry: PendingResponse = {sequence,item_version_id,response,command_key:crypto.randomUUID()};
    const id = `${this.scope}:${sequence}`;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(id)},this.key,new TextEncoder().encode(JSON.stringify(entry)));
    const tx = this.db.transaction('entries','readwrite');
    tx.objectStore('entries').add({id,scope:this.scope,sequence,iv,encrypted} satisfies Envelope);
    await complete(tx);
    return entry;
  }
  async acknowledge(sequence: number) {
    const tx = this.db.transaction('entries','readwrite');tx.objectStore('entries').delete(`${this.scope}:${sequence}`);await complete(tx);
  }
  close() { this.db.close(); }
}
