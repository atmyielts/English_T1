import {digest,RuntimeError,type Backend,type Binding,type Invocation,type Result,type Storage,type RecoveryTicket} from './protocol.ts';
/** Serializes network-yielding work; canonical PostgreSQL leases also fence split/restarted coordinators. */
export class CoordinatorEngine {
 private tail:Promise<unknown>=Promise.resolve();private queued=0;
 constructor(private store:Storage,private backend:Backend,private now=()=>Date.now()){}
 private serial<T>(work:()=>Promise<T>):Promise<T>{
  if(this.queued>=64)return Promise.reject(new RuntimeError(429,'attempt_busy','This attempt has too many pending requests. Retry using the same command key.'));
  this.queued++;const result=this.tail.then(work);this.tail=result.catch(()=>{}).finally(()=>{this.queued--;});return result;
 }
 invoke(input:Invocation){return this.serial(()=>this.operate(input));}
 private async operate(input:Invocation):Promise<Result>{
  let binding=await this.store.get<Binding>('binding');
  if(binding&&(binding.actor!==input.actor||binding.tenant!==input.tenant||binding.attempt!==input.attempt))throw new RuntimeError(404,'not_found','Attempt not found');
  if(!binding){
   const proof=await this.backend.invoke({...input,action:'snapshot',data:{},key:''});
   binding={actor:input.actor,tenant:input.tenant,attempt:input.attempt};await this.store.put('binding',binding);await this.schedule(proof.snapshot);
  }
  if(input.action==='snapshot'){
   const response=await this.backend.invoke(input);await this.schedule(response.snapshot);return response;
  }
  const {lease:_lease,...semantic}=input.data;
  const id=`command:${input.actor}:${input.key}`,hash=await digest({action:input.action,data:semantic});
  const prior=await this.store.get<{hash:string;result?:unknown;committed:boolean}>(id);
  if(prior&&prior.hash!==hash)throw new RuntimeError(409,'idempotency_conflict','The command key was already used for different data');
  if(prior?.committed){
   const state=await this.backend.invoke({...input,action:'snapshot',data:{},key:''});await this.schedule(state.snapshot);return {result:prior.result,snapshot:state.snapshot};
  }
  // Persist command identity only. Answers and bearer/lease tokens never enter DO storage.
  await this.store.put(id,{hash,committed:false});
  const response=await this.backend.invoke(input);
  await this.store.put(id,{hash,committed:true,result:response.result});
  await this.schedule(response.snapshot);return response;
 }
 alarm(){return this.serial(async()=>{
  const binding=await this.store.get<Binding>('binding');if(!binding)return;
  const response=await this.backend.expire(binding);await this.schedule(response.snapshot);
 });}
 recover(ticket:RecoveryTicket){return this.serial(async()=>{
  if(!this.backend.recover)throw new RuntimeError(503,'recovery_unconfigured','Recovery is not configured');
  const prior=await this.store.get<Binding>('binding');
  if(prior&&(prior.tenant!==ticket.tenant_id||prior.attempt!==ticket.attempt_id))throw new RuntimeError(409,'recovery_scope_conflict','Recovery ticket does not match the attempt');
  const result=await this.backend.recover(ticket);if(!result.accepted)return;
  const binding=result.binding,snapshot=result.snapshot;
  if(!binding||!snapshot||binding.tenant!==ticket.tenant_id||binding.attempt!==ticket.attempt_id||snapshot.attempt_id!==ticket.attempt_id||(prior&&binding.actor!==prior.actor))throw new RuntimeError(502,'invalid_recovery','Canonical recovery returned inconsistent ownership');
  await this.store.put('binding',binding);await this.schedule(snapshot);
 });}
 private async schedule(snapshot:Result['snapshot']){
  await this.store.put('snapshot',snapshot);
  if(!snapshot.next_deadline_at){await this.store.deleteAlarm();return;}
  const due=Date.parse(snapshot.next_deadline_at);if(!Number.isFinite(due))throw new RuntimeError(502,'invalid_snapshot','The canonical exam deadline is invalid');
  // A past canonical deadline retries in one second, without a hot alarm loop.
  await this.store.setAlarm(Math.max(this.now()+1000,due));
 }
}
