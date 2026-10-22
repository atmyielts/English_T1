import type { BrowserEventKind, CandidateProctorState, EventStore, MonitoringStatus } from './types.ts';

export interface RuntimeTransport {
  state(): Promise<CandidateProctorState>;
  command(action: string,data: Record<string,unknown>,key: string): Promise<unknown>;
}
export class ProctorRuntime {
  private running: Promise<void> | null=null;
  private draining: Promise<void> | null=null;
  private lastHeartbeat=0;
  private heartbeatKey: string | null=null;
  private completed=false;
  private closed=false;
  private offset=0;
  private localProblem: string | null=null;
  private writes: Promise<void>=Promise.resolve();
  constructor(private sessionId: string,private store: EventStore,private transport: RuntimeTransport,private onState: (state: CandidateProctorState)=>void,private onStatus: (status: MonitoringStatus)=>void,private clock=()=>Date.now()) {}
  emit(kind: BrowserEventKind) {
    if(this.closed||this.completed)return Promise.resolve();
    const occurred=new Date(this.clock()+this.offset).toISOString();
    const work=this.writes.then(()=>this.store.append(kind,occurred)).then(()=>this.report());
    this.writes=work.catch(cause=>{this.localProblem=`Monitoring events could not be saved on this device: ${cause instanceof Error?cause.message:'storage unavailable'}`;this.onStatus({pending:0,problem:this.localProblem});});
    return this.writes;
  }
  tick() {
    if(this.closed)return Promise.resolve();
    if(this.running)return this.running;
    this.running=this.pollAndSync().finally(()=>{this.running=null;});return this.running;
  }
  private async pollAndSync() {
    let problem: string | null=null;
    try {
      const state=await this.transport.state();
      if(this.closed)return;
      if(!state.session||state.session.id!==this.sessionId)throw new Error('Monitoring session changed. Contact your institution.');
      const server=Date.parse(state.server_time);if(Number.isFinite(server))this.offset=server-this.clock();
      this.completed=state.session.state==='completed';this.onState(state);
      if(!this.completed&&this.clock()-this.lastHeartbeat>=15000) {
        this.heartbeatKey??=crypto.randomUUID();
        await this.transport.command('session.heartbeat',{session_id:this.sessionId},this.heartbeatKey);
        this.heartbeatKey=null;this.lastHeartbeat=this.clock();
      }
    } catch(cause) { problem=cause instanceof Error?cause.message:'Monitoring connection unavailable'; }
    try { await this.flush(); } catch(cause) { problem=cause instanceof Error?cause.message:'Monitoring events remain saved on this device'; }
    if(!this.closed)await this.report(problem);
  }
  flush() {
    if(this.closed)return Promise.resolve();
    if(this.draining)return this.draining;
    this.draining=this.drain().finally(()=>{this.draining=null;});return this.draining;
  }
  private async drain() {
    await this.writes;
    const entries=await this.store.pending(),streams=[...new Set(entries.map(entry=>entry.stream_id))];
    for(const stream of streams) {
      const streamEvents=entries.filter(entry=>entry.stream_id===stream);
      for(let offset=0;offset<streamEvents.length;offset+=100) {
        if(this.closed)return;
        const events=streamEvents.slice(offset,offset+100);
        const key=`events:${stream}:${events[0].sequence}-${events[events.length-1].sequence}`;
        await this.transport.command('events.append',{session_id:this.sessionId,stream_id:stream,events:events.map(({stream_id:_stream,...event})=>event)},key);
        await this.store.acknowledge(stream,events.map(event=>event.sequence));
      }
    }
  }
  async acknowledge(noticeId: string) {
    await this.transport.command('notice.acknowledge',{session_id:this.sessionId,notice_ids:[noticeId]},`notice:${this.sessionId}:${noticeId}`);
    await this.tick();
  }
  private async report(problem: string | null=null) {
    if(this.closed)return;
    try { this.onStatus({pending:(await this.store.pending()).length,problem:this.localProblem??problem}); }
    catch(cause) { this.localProblem=`Monitoring storage could not be read: ${cause instanceof Error?cause.message:'unavailable'}`;this.onStatus({pending:0,problem:this.localProblem}); }
  }
  async close() { this.closed=true;await Promise.allSettled([this.writes,this.running,this.draining]);this.store.close(); }
}
