import {LocalizedError,english} from './i18n/translate.ts';
/** Browser protocol only. PostgreSQL and the coordinator remain the authority. */
export interface RuntimeSnapshot {
  accommodations?:import('../../assessment-core/src/accommodations.ts').BreakState;
  attempt_id:string;state:string;deadline_at:string;section_deadline_at:string;closes_at:string;
  section_index:number;last_sequence:number;lease_epoch:number|null;lease_expires_at:string|null;server_time:string;next_deadline_at:string|null;
  capture?:{session_id:string;ready:boolean;loss_since:string|null;action:'warning'|'paused'|null;next_check_at:string|null};
}
export interface RuntimeResult {result?:unknown;snapshot:RuntimeSnapshot}
export interface LeaseCredentials {device_id:string;token:string;epoch?:number;acquire_key?:string;renew_key?:string}
export interface CredentialStore {read():LeaseCredentials;write(value:LeaseCredentials):void}
export interface CoordinatorTransport {state():Promise<RuntimeResult>;command(action:string,data:Record<string,unknown>,key:string):Promise<RuntimeResult>}
export interface RuntimeStatus {ready:boolean;problem:string|null;expires_at:string|null}
export class AttemptRuntime {
  private chain:Promise<unknown>=Promise.resolve();
  private snapshot:RuntimeSnapshot|null=null;
  private credentials:LeaseCredentials;
  private offset=0;
  private stopped=false;
  private problem:string|null=null;
  constructor(private transport:CoordinatorTransport,private store:CredentialStore,private changed:(snapshot:RuntimeSnapshot)=>void,private status:(status:RuntimeStatus)=>void,private now=()=>Date.now(),private key:()=>string=()=>crypto.randomUUID()) {this.credentials=store.read();}
  private persist(){this.store.write({...this.credentials});}
  private valid(){return !!this.credentials.epoch&&!!this.snapshot&&['active','paused'].includes(this.snapshot.state)&&!!this.snapshot.lease_expires_at&&this.snapshot.lease_epoch===this.credentials.epoch&&Date.parse(this.snapshot.lease_expires_at)>this.now()+this.offset;}
  private report(){if(!this.stopped)this.status({ready:this.valid(),problem:this.problem,expires_at:this.snapshot?.lease_expires_at??null});}
  private accept(value:RuntimeResult){
    if(this.stopped)return;
    this.snapshot=value.snapshot;this.offset=Date.parse(value.snapshot.server_time)-this.now();this.problem=null;
    this.changed(value.snapshot);this.report();
  }
  private serialize<T>(work:()=>Promise<T>):Promise<T>{
    const result=this.chain.then(async()=>{if(this.stopped)throw new LocalizedError("runtime.examConnectionClosed");try{return await work();}catch(cause){this.problem=cause instanceof Error?cause.message:english('runtime.unreachable');this.report();throw cause;}});
    this.chain=result.catch(()=>{});return result;
  }
  private async acquire(){
    // A lost receipt reuses this key. A successful (possibly stale) receipt is never reused for another renewal.
    this.credentials.acquire_key??=this.key();this.persist();
    const value=await this.transport.command('lease.acquire',{device_id:this.credentials.device_id,token:this.credentials.token},this.credentials.acquire_key);
    const epoch=(value.result as {epoch?:number}|undefined)?.epoch;
    if(!Number.isSafeInteger(epoch)||Number(epoch)<1)throw new LocalizedError("runtime.coordinatorReturnedInvalidDevice");
    this.credentials.epoch=epoch;delete this.credentials.acquire_key;delete this.credentials.renew_key;this.persist();this.accept(value);
    if(!this.valid()){
      // An acquisition committed before a network outage may already have expired. Start a new operation, not a new token.
      this.credentials.acquire_key=this.key();this.persist();
      const renewed=await this.transport.command('lease.acquire',{device_id:this.credentials.device_id,token:this.credentials.token},this.credentials.acquire_key);
      const next=(renewed.result as {epoch?:number}|undefined)?.epoch;
      if(!Number.isSafeInteger(next)||Number(next)<1)throw new LocalizedError("runtime.coordinatorReturnedInvalidDevice");
      this.credentials.epoch=next;delete this.credentials.acquire_key;this.persist();this.accept(renewed);
      if(!this.valid())throw new LocalizedError("runtime.examActiveAnotherDevice");
    }
  }
  private lease(){return {device_id:this.credentials.device_id,token:this.credentials.token,epoch:this.credentials.epoch};}
  async withAnswerLease<T>(work:(lease:{device_id:string;token:string;epoch:number})=>Promise<T>):Promise<T>{return this.serialize(async()=>{
    if(!this.snapshot)await this.tickUnqueued();
    if(this.snapshot&&['active','paused'].includes(this.snapshot.state)&&!this.valid())await this.acquire();
    if(this.stopped||!this.valid()||this.snapshot?.state!=='active'||this.snapshot.accommodations?.active||Math.min(Date.parse(this.snapshot.deadline_at),Date.parse(this.snapshot.section_deadline_at))<=this.now()+this.offset)throw new LocalizedError("runtime.newAnswerAdmissionRequires");
    return await work({device_id:this.credentials.device_id,token:this.credentials.token,epoch:this.credentials.epoch!});
  });}
  async tick(){return this.serialize(async()=>{
    const current=await this.transport.state();this.accept(current);
    if(!['active','paused'].includes(current.snapshot.state))return;
    if(!this.valid()){await this.acquire();return;}
    if(Date.parse(current.snapshot.lease_expires_at!)-(this.now()+this.offset)<=30000||this.credentials.renew_key){
      this.credentials.renew_key??=this.key();this.persist();
      const value=await this.transport.command('lease.renew',{lease:this.lease()},this.credentials.renew_key);
      delete this.credentials.renew_key;this.persist();this.accept(value);
      if(!this.valid())await this.acquire();
    }
  });}
  async command(action:'response.append'|'section.advance'|'attempt.submit'|'break.begin'|'break.end',data:Record<string,unknown>,key:string){return this.serialize(async()=>{
    if(!this.snapshot)await this.tickUnqueued();
    if(this.snapshot&&['active','paused'].includes(this.snapshot.state)&&!this.valid())await this.acquire();
    // Stable response keys may recover an already committed receipt even after finalization or lease rotation.
    const value=await this.transport.command(action,{...data,lease:this.lease()},key);this.accept(value);return value.result;
  });}
  private async tickUnqueued(){const value=await this.transport.state();this.accept(value);if(['active','paused'].includes(value.snapshot.state))await this.acquire();}
  close(){this.stopped=true;}
}
