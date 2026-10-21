export interface DraftRecord<T>{version:string;source:string;value:T|null;updatedAt:string}
export interface DraftStore<T>{read():Promise<DraftRecord<T>|null>;head?():Promise<string|null>;replace(expected:string|null,next:DraftRecord<T>):Promise<boolean>}
export class DraftConflict extends Error{constructor(public kind:'conflict'|'changed'){super(kind==='changed'?'The source changed. Review the saved draft before restoring it.':'Another tab changed this draft. Load its saved version before continuing.');}}
export function draftReceiptBinding(value:unknown,tenant:string,actor:string){if(!value)return null;const token=value as {scope?:unknown;version?:unknown},scope=token.scope;if(typeof scope!=='string'||scope.length>300||!['authoring','grading'].some(kind=>scope.startsWith(`${kind}:${tenant}:${actor}:`))||!(token.version===null||typeof token.version==='string'&&/^[0-9a-f-]{36}$/.test(token.version)))throw new Error('Invalid device draft receipt binding.');return {scope,version:token.version as string|null};}
/** Opaque revisions (including deletion tombstones) prevent stale tabs and queued writes from resurrecting old drafts. */
export class DraftSession<T>{
 private version:string|null=null;private blocked:'conflict'|'changed'|null=null;private tail:Promise<unknown>=Promise.resolve();
 constructor(private store:DraftStore<T>,private source:string,private validate:(value:unknown)=>T){}
 private ordered<R>(work:()=>Promise<R>):Promise<R>{const result=this.tail.catch(()=>{}).then(work);this.tail=result;return result;}
 load(){return this.ordered(async()=>{const row=await this.store.read();this.version=row?.version??null;this.blocked=null;if(!row||row.value===null)return null;if(row.source!==this.source){this.blocked='changed';throw new DraftConflict('changed');}return this.validate(structuredClone(row.value));});}
 save(value:T){const copy=structuredClone(value);return this.ordered(()=>this.write(copy));}
 private async write(value:T|null){if(this.blocked)throw new DraftConflict(this.blocked);const next={version:crypto.randomUUID(),source:this.source,value,updatedAt:new Date().toISOString()};if(!await this.store.replace(this.version,next)){this.blocked='conflict';throw new DraftConflict('conflict');}this.version=next.version;return next;}
 clear(){return this.ordered(()=>this.write(null));}
 checkpoint(){return this.ordered(async()=>{if(this.blocked)throw new DraftConflict(this.blocked);return this.version;});}
 /** Explicit user adoption revalidates the newest saved value and fences concurrent changes. */
 adopt(){return this.ordered(async()=>{const row=await this.store.read();this.version=row?.version??null;const value=row?.value===null||!row?null:this.validate(structuredClone(row.value));this.blocked=null;await this.write(value);return value;});}
 discard(){return this.ordered(async()=>{this.version=this.store.head?await this.store.head():(await this.store.read())?.version??null;this.blocked=null;await this.write(null);});}
}
