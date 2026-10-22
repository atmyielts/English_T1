import { ContractError, hash, object, text, uuid, validatePolicy } from "../../../packages/assessment-core/src/mod.ts";
import {recordingReferences} from '../../../packages/assessment-core/src/recording-citations.ts';
// Proctor owns its persistence boundary; it never imports an Assessment API implementation.
export interface ProctorRepository {
  user(token: string): Promise<string | null>;
  workspaces(user: string): Promise<Record<string, unknown>[]>;
  capability(tenant: string, user: string, capability: string): Promise<boolean>;
  list(table: string, tenant: string, filters?: Record<string, string>): Promise<Record<string, unknown>[]>;
  get(table: string, tenant: string, id: string): Promise<Record<string, unknown> | null>;
  command(actor: string, tenant: string, key: string, action: string, data: Record<string, unknown>): Promise<unknown>;
  access(tenant: string, session: string, user: string, assignment?: string): Promise<boolean>;
}
export const BROWSER_EVENTS = ["focus_loss","focus_return","tab_hidden","tab_visible","fullscreen_enter","fullscreen_exit","copy","paste","cut","context_menu","online","offline","client_loaded"] as const;
const CAPABILITIES = ['banks.read','items.write','items.approve','assessments.publish','exams.manage','grades.manage','results.read','audit.read','proctor.manage','proctor.observe','proctor.review'];
const reject = (status: number, code: string, message: string): never => { throw new ContractError(code, message, status); };
function integer(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) reject(422,'invalid_number',`${label} must be an integer between ${min} and ${max}`);
  return value as number;
}
export function createProctorHandler(repository: ProctorRepository, allowedOrigins: string[], options:{captureLaunchEnabled?:boolean;liveLaunchEnabled?:boolean}={}) {
  return async(req: Request): Promise<Response> => {
    const requestId = crypto.randomUUID(), origin = req.headers.get('origin');
    const headers: Record<string,string> = {'Content-Type':'application/json','Cache-Control':'no-store','X-Request-ID':requestId,'Vary':'Origin'};
    if (origin && allowedOrigins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
    if (origin && !allowedOrigins.includes(origin)) return json(403,{code:'origin_denied',error:'Origin is not allowed'});
    if (req.method==='OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, idempotency-key, x-client-info'}});
    try {
      if(!['GET','POST'].includes(req.method))reject(405,'method_not_allowed','Method not allowed');
      const bearer=/^Bearer (\S+)$/.exec(req.headers.get('authorization')??'');
      const actor=bearer?await repository.user(bearer[1]):null;
      if(!actor)reject(401,'unauthorized','Sign in to continue');
      const url=new URL(req.url), path=url.pathname.slice(url.pathname.indexOf('/proctor')+8).replace(/^\//,'');
      if(req.method==='GET' && path==='workspaces')return json(200,{data:await repository.workspaces(actor!)});
      const tenant=uuid(url.searchParams.get('tenant_id'),'Tenant ID');
      const manager=await repository.capability(tenant,actor!,'proctor.manage');
      if(req.method==='GET') {
        if(path==='permissions') {
          const granted=await Promise.all(CAPABILITIES.map(async cap=>await repository.capability(tenant,actor!,cap)?cap:null));
          return json(200,{data:granted.filter(Boolean)});
        }
        if(path==='candidate/preflight') {
          const registration=await repository.get('assessment_registrations',tenant,uuid(url.searchParams.get('registration_id')));
          if(!registration || registration.candidate_id!==actor)reject(404,'not_found','Registration not found');
          const bindings=await repository.list('proctor_window_policies',tenant,{window_id:String(registration!.window_id)});
          if(!bindings.length)return json(200,{data:{required:false}});
          const policy=await repository.get('proctor_policies',tenant,String(bindings[0].policy_id));
          const preparation=await repository.list('proctor_preparations',tenant,{registration_id:String(registration!.id),candidate_id:actor!});
          const rules=validatePolicy(policy!.policy);
          const identityChecks=await repository.list('proctor_identity_checks',tenant,{registration_id:String(registration!.id)});
          let identityVerified=rules.identity_level===0;
          for(const check of identityChecks)if(Number(check.level)>=rules.identity_level && rules.identity_level!==2 && await repository.capability(tenant,String(check.verified_by),'proctor.manage'))identityVerified=true;
          const hasSources=rules.camera||rules.microphone||rules.screen,captureRequired=hasSources||['record_review','live'].includes(rules.mode),captureEnabled=options.captureLaunchEnabled===true&&hasSources&&(['browser','record_review'].includes(rules.mode)||rules.mode==='live'&&options.liveLaunchEnabled===true)&&!rules.second_camera&&rules.identity_level!==2;
          const runtimeReady=(rules.mode==='browser'&&!hasSources&&!rules.second_camera&&rules.identity_level!==2)||captureEnabled;
          return json(200,{data:{required:true,policy_id:policy!.id,title:policy!.title,policy:rules,consented:preparation.some(p=>p.policy_id===policy!.id),identity_verified:identityVerified,runtime_ready:runtimeReady,consent_version:'proctor.consent.v1',capture_required:captureRequired,capture_enabled:captureEnabled,capture_protocol:'proctor.capture.v1'}});
        }
        if(path==='candidate/session') {
          const attempt=await repository.get('assessment_attempts',tenant,uuid(url.searchParams.get('attempt_id')));
          if(!attempt || attempt.candidate_id!==actor)reject(404,'not_found','Attempt not found');
          const sessions=await repository.list('proctor_sessions',tenant,{attempt_id:String(attempt!.id),candidate_id:actor!});
          const notices=sessions.length?await repository.list('proctor_candidate_notices',tenant,{session_id:String(sessions[0].id)}):[];
          const acknowledgements=await repository.list('proctor_notice_acknowledgements',tenant,{candidate_id:actor!});
          const acknowledged=new Set(acknowledgements.map(row=>row.notice_id));
          return json(200,{data:{session:sessions[0]??null,attempt:{state:attempt!.state,deadline_at:attempt!.deadline_at,section_deadline_at:attempt!.section_deadline_at},notices:notices.sort((a,b)=>String(a.issued_at).localeCompare(String(b.issued_at))).map(row=>({id:row.id,kind:row.kind,reason:row.reason,issued_at:row.issued_at,issuer_kind:row.issuer_kind==='system'?'system':'user',acknowledged:acknowledged.has(row.id)})),server_time:new Date().toISOString()}});
        }
        if(/^sessions\/[^/]+$/.test(path)) {
          const sessionId=uuid(path.split('/')[1]);
          if(!await repository.access(tenant,sessionId,actor!))reject(404,'not_found','Session not found');
          const session=await repository.get('proctor_sessions',tenant,sessionId);
          if(!session)reject(404,'not_found','Session not found');
          const events=await repository.list('proctor_integrity_events',tenant,{session_id:sessionId});
          const cases=await repository.list('proctor_review_cases',tenant,{session_id:sessionId});
          const canObserve=await repository.access(tenant,sessionId,actor!,'observer');
          const canReview=await repository.capability(tenant,actor!,'proctor.review') && await repository.access(tenant,sessionId,actor!,'reviewer');
          const findings=canReview?(await Promise.all(cases.map(c=>repository.list('proctor_case_findings',tenant,{case_id:String(c.id)})))).flat():[];
          const recording_citations=canReview?(await Promise.all(cases.map(c=>repository.list('proctor_recording_citations',tenant,{case_id:String(c.id)})))).flat():[];
          return json(200,{data:{session,events:events.sort((a,b)=>String(a.received_at).localeCompare(String(b.received_at))),cases,findings,recording_citations,permissions:{observe:canObserve,review:canReview}}});
        }
        if(path==='sessions'||path==='cases') {
          const table=path==='sessions'?'proctor_sessions':'proctor_review_cases';
          if(manager)return json(200,{data:await repository.list(table,tenant)});
          const assignments=await repository.list('proctor_assignments',tenant,{user_id:actor!,active:'true'});
          const allowed=new Set<string>();
          for(const assignment of assignments)if(await repository.access(tenant,String(assignment.session_id),actor!))allowed.add(String(assignment.session_id));
          const rows=await repository.list(table,tenant);
          return json(200,{data:rows.filter(row=>allowed.has(String(path==='sessions'?row.id:row.session_id)))});
        }
        const resources:Record<string,string>={policies:'proctor_policies',bindings:'proctor_window_policies',windows:'assessment_exam_windows',registrations:'assessment_registrations',assignments:'proctor_assignments'};
        if(!resources[path])reject(404,'not_found','Resource not found');
        if(!manager)reject(403,'forbidden','A proctor supervisor manages this resource');
        return json(200,{data:await repository.list(resources[path],tenant)});
      }
      if(path!=='commands')reject(404,'not_found','Resource not found');
      const commandKey=text(req.headers.get('idempotency-key'),'Idempotency-Key',200);
      if(commandKey.length<8)reject(422,'invalid_key','Use an idempotency key of at least eight characters');
      const content=await req.text();
      if(new TextEncoder().encode(content).length>200000)reject(413,'payload_too_large','Request exceeds 200 KB');
      let body:Record<string,unknown>;try{body=object(JSON.parse(content));}catch{reject(400,'invalid_json','Expected a JSON object');}
      const action=text(body!.action,'Action',80),data=object(body!.data);
      const supervisorActions=['policy.create','policy.attach','session.assign','identity.verify','capability.grant','capability.revoke'];
      if(supervisorActions.includes(action)&&!manager)reject(403,'forbidden','A proctor supervisor manages this action');
      let input:Record<string,unknown>;
      switch(action) {
        case 'policy.create':input={title:text(data.title,'Policy title',200),policy:validatePolicy(data.policy)};break;
        case 'policy.attach':input={policy_id:uuid(data.policy_id),window_id:uuid(data.window_id)};break;
        case 'capability.grant':case 'capability.revoke':
          if(!CAPABILITIES.includes(String(data.capability)))reject(422,'invalid_capability','Unknown capability');
          input={user_id:uuid(data.user_id),capability:data.capability};break;
        case 'preparation.accept':
          if(data.acknowledged!==true)reject(422,'consent_required','Acknowledge the exam monitoring policy before continuing');
          input={registration_id:uuid(data.registration_id),policy_id:uuid(data.policy_id),acknowledged:true};break;
        case 'identity.verify':
          if(!['onsite_attended','remote_attended'].includes(String(data.method)))reject(422,'invalid_method','Choose an attended verification method');
          input={registration_id:uuid(data.registration_id),method:data.method,notes:text(data.notes,'Identity verification notes',5000)};break;
        case 'session.assign':
          if(!['observer','reviewer'].includes(String(data.assignment_role)))reject(422,'invalid_assignment','Choose observer or reviewer');
          input={session_id:uuid(data.session_id),user_id:uuid(data.user_id),assignment_role:data.assignment_role};break;
        case 'session.pause':case 'session.resume':case 'session.warn':
          input={session_id:uuid(data.session_id),reason:text(data.reason,'Reason',2000)};break;
        case 'session.heartbeat':input={session_id:uuid(data.session_id)};break;
        case 'notice.acknowledge':
          if(!Array.isArray(data.notice_ids)||!data.notice_ids.length||data.notice_ids.length>100)reject(422,'invalid_notices','Acknowledge 1–100 notices');
          input={session_id:uuid(data.session_id),notice_ids:[...new Set((data.notice_ids as unknown[]).map(value=>uuid(value)))].sort()};break;
        case 'case.create':input={session_id:uuid(data.session_id),title:text(data.title,'Case title',200)};break;
        case 'case.finding': {
          if(!['clear','confirmed','insufficient_evidence'].includes(String(data.disposition)))reject(422,'invalid_disposition','Choose a review disposition');
          if(!Array.isArray(data.evidence_event_ids)||data.evidence_event_ids.length>100)reject(422,'invalid_evidence','Select at most 100 evidence events');
          const evidence=(data.evidence_event_ids as unknown[]).map(id=>uuid(id));
          const references=recordingReferences(data.evidence_recording_refs);
          input={case_id:uuid(data.case_id),disposition:data.disposition,rationale:text(data.rationale,'Finding rationale',10000),evidence_event_ids:[...new Set(evidence)],...(references.length?{evidence_recording_refs:references}:{})};break;
        }
        case 'events.append': {
          if(!Array.isArray(data.events)||!data.events.length||data.events.length>100)reject(422,'invalid_events','Send 1–100 events per batch');
          const events=await Promise.all((data.events as unknown[]).map(async value=>{
            const event=object(value),kind=text(event.kind,'Event kind',60);
            if(!(BROWSER_EVENTS as readonly string[]).includes(kind))reject(422,'invalid_browser_event','This event source cannot report that event kind');
            const occurred=text(event.occurred_at,'Event time',80);
            if(!/(Z|[+-]\d{2}:\d{2})$/.test(occurred)||!Number.isFinite(Date.parse(occurred)))reject(422,'invalid_timestamp','Use an ISO event time with timezone');
            const normalized={sequence:integer(event.sequence,'Event sequence',1,1000000),kind,occurred_at:new Date(occurred).toISOString()};
            return {...normalized,payload_hash:await hash(normalized)};
          }));
          input={session_id:uuid(data.session_id),stream_id:uuid(data.stream_id),events};break;
        }
        default:reject(422,'unknown_action','Unknown proctor action');
      }
      return json(200,{data:await repository.command(actor!,tenant,commandKey,action,input!),request_id:requestId});
    }catch(cause){
      if(cause instanceof ContractError)return json(cause.status,{code:cause.code,error:cause.message,request_id:requestId});
      console.error('proctor request failed',{request_id:requestId,error:cause instanceof Error?cause.message:'Unknown failure'});
      return json(500,{code:'internal_error',error:'The proctor service could not complete this request',request_id:requestId});
    }
  };
}
