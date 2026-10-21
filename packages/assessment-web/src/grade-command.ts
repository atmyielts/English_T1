import {canonicalJson} from '../../assessment-core/src/mod.ts';
import {LocalizedError,isWebKey} from './i18n/translate.ts';
export interface GradeIntent {action:string;data:Record<string,unknown>;key:string}
export interface IntentStore {pending():Promise<GradeIntent|null>;save(action:string,data:Record<string,unknown>):Promise<GradeIntent>;acknowledge():Promise<void>}
/** The request kind is shown inside command messages; known kinds are translated. */
const commandTerm=(label:string)=>{const key=`command.kind.${label.replaceAll(' ','_')}`;return isWebKey(key)?{label:key}:{};};
/** Durable command identity, not optimistic grading. Only a canonical receipt clears a network-uncertain intent. */
export class GradeCommands {
 private flight:Promise<unknown>|null=null;private flightHash='';
 constructor(private store:IntentStore,private transport:(intent:GradeIntent)=>Promise<unknown>,private lock:<T>(work:()=>Promise<T>)=>Promise<T>,private label='grading'){}
 pending(){return this.store.pending();}
 execute(action:string,data:Record<string,unknown>){const fingerprint=canonicalJson({action,data});if(this.flight)return this.flightHash===fingerprint?this.flight:Promise.reject(new LocalizedError('command.wait',{label:this.label},commandTerm(this.label)));this.flightHash=fingerprint;return this.track(this.lock(async()=>{
  let intent=await this.store.pending();if(intent&&canonicalJson({action:intent.action,data:intent.data})!==canonicalJson({action,data}))throw new LocalizedError('command.retry',{label:this.label},commandTerm(this.label));
  intent??=await this.store.save(action,structuredClone(data));return this.send(intent);
 }));}
 retry(){if(this.flight)return this.flight;this.flightHash='retry';return this.track(this.lock(async()=>{const intent=await this.store.pending();if(!intent)return null;return this.send(intent);}));}
 private track(result:Promise<unknown>){this.flight=result;void result.finally(()=>{if(this.flight===result)this.flight=null;}).catch(()=>{});return result;}
 private async send(intent:GradeIntent){try{const result=await this.transport(intent);await this.store.acknowledge();return result;}catch(cause){const status=(cause as {status?:number})?.status;if(status&&status>=400&&status<500&&status!==408&&status!==429)await this.store.acknowledge();throw cause;}}
}
