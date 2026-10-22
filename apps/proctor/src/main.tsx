import React, { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { configured, proctorRequest, supabase, observeAccount, type Row } from '../../../packages/assessment-web/src/client';
import { ServiceHeader } from '../../../packages/service-design/src/ServiceHeader';
import { PolicyScreen } from './PolicyScreen';
import { IdentityScreen } from './IdentityScreen';
import { TeamScreen } from './TeamScreen';
import { SessionScreen } from './SessionScreen';
import { WorkloadScreen } from './WorkloadScreen';
import { identifier, type SessionDetail } from './types';
import '../../../packages/service-design/src/platform.css';
import './style.css';

type Tab = 'sessions' | 'workload' | 'policies' | 'identity' | 'team';
const tabs: { id: Tab; label: string }[] = [{id:'workload',label:'Monitoring board'}, { id: 'sessions', label: 'Exam sessions' }, { id: 'policies', label: 'Monitoring policies' }, { id: 'identity', label: 'Identity checks' }, { id: 'team', label: 'Proctor team' }];
function App() {
  const [user, setUser] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [workspaces, setWorkspaces] = useState<Row[]>([]), [tenant, setTenant] = useState(''), [tab, setTab] = useState<Tab>('workload');
  const [permissions, setPermissions] = useState<string[]>([]), [rows, setRows] = useState<Record<string, Row[]>>({});
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [detailLoading, setDetailLoading] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [workspaceActor,setWorkspaceActor]=useState(''),[loadedScope,setLoadedScope]=useState('');
  const selectedSession = useRef(''), scope = useRef(''), commandKeys = useRef(new Map<string, string>()), detailRequest = useRef(0),loadRequest=useRef(0);
  scope.current = `${user}:${tenant}`;
  const manager = permissions.includes('proctor.manage');
  useEffect(() => {
    return observeAccount(setUser);
  }, []);
  useEffect(() => {
    let active = true;
    setWorkspaces([]); setTenant(''); setRows({}); setPermissions([]); setDetail(null); selectedSession.current = '';
    setWorkspaceActor('');setLoadedScope('');
    if (user) proctorRequest<Row[]>('workspaces',undefined,undefined,undefined,user).then(data => { if (active) { setWorkspaces(data); setTenant(identifier(data[0]?.tenant_id));setWorkspaceActor(user); } }).catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [user]);
  async function load(expectedScope: string,request=++loadRequest.current) {
    try{
    const grants = await proctorRequest<string[]>('permissions', tenant,undefined,undefined,user);
    const resources = tab==='workload'?[]:tab==='sessions'?['sessions']:!grants.includes('proctor.manage')?[]:tab==='policies'?['policies','bindings','windows']:tab==='identity'?['registrations','windows']:['sessions','assignments'];
    const entries = await Promise.all(resources.map(async resource => [resource, await proctorRequest<Row[]>(resource, tenant,undefined,undefined,user)] as const));
    if (scope.current !== expectedScope||loadRequest.current!==request) return;
    setPermissions(grants); setRows(Object.fromEntries(entries));setLoadedScope(expectedScope);
    if (selectedSession.current) {
      const selected=selectedSession.current,detailVersion=detailRequest.current;
      const result = await proctorRequest<SessionDetail>(`sessions/${selected}`, tenant,undefined,undefined,user);
      if (scope.current === expectedScope&&loadRequest.current===request&&detailVersion===detailRequest.current&&selectedSession.current===selected) setDetail(result);
    }
    }catch(cause){
      if(scope.current===expectedScope&&loadRequest.current===request){setRows({});setPermissions([]);setDetail(null);selectedSession.current='';detailRequest.current++;setLoadedScope(expectedScope);}
      throw cause;
    }
  }
  useEffect(() => {
    setPermissions([]); setRows({}); setDetail(null); setDetailLoading(false); setError(''); setNotice(''); setTab('workload'); selectedSession.current = ''; detailRequest.current++;
    loadRequest.current++;
  }, [user, tenant]);
  useEffect(()=>{
    if (!user || !tenant) return;
    const expectedScope = `${user}:${tenant}`,request=++loadRequest.current;
    setLoading(true);
    void load(expectedScope,request).catch(cause => { if (scope.current === expectedScope&&loadRequest.current===request) setError(cause.message); }).finally(() => { if (scope.current === expectedScope&&loadRequest.current===request) setLoading(false); });
  },[user,tenant,tab]);
  async function run(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not complete this action.'); } finally { setBusy(false); }
  }
  async function command(action: string, data: Record<string, unknown>, success: string) {
    const expectedScope = scope.current;
    await run(async () => {
      const signature = JSON.stringify([expectedScope, action, data]);
      const key = commandKeys.current.get(signature) ?? crypto.randomUUID(); commandKeys.current.set(signature, key);
      await proctorRequest('commands', tenant, { action, data }, key,user);
      commandKeys.current.delete(signature);
      if (scope.current !== expectedScope) return;
      setNotice(success);
      try { await load(expectedScope); } catch { if (scope.current === expectedScope) setError('The action was saved, but the latest records could not be loaded. Refresh to retrieve them.'); }
    });
  }
  async function selectSession(id: string) {
    const expectedScope = scope.current, request = ++detailRequest.current;
    setDetailLoading(true); setError('');setDetail(null);selectedSession.current='';
    try {
      const result = await proctorRequest<SessionDetail>(`sessions/${id}`, tenant,undefined,undefined,user);
      if (scope.current === expectedScope && detailRequest.current === request) { selectedSession.current = id; setDetail(result); }
    } catch (cause) { if (scope.current === expectedScope && detailRequest.current === request) setError(cause instanceof Error ? cause.message : 'Could not load the session.'); }
    finally { if (scope.current === expectedScope && detailRequest.current === request) setDetailLoading(false); }
  }
  if (!configured) return <main className="configuration"><h1>Schood Proctor</h1><p>The proctor service has not been configured.</p></main>;
  if (!user) return <main className="signin"><div className="brand">Schood <span>Proctor</span></div><h1>Sign in to your proctor workspace</h1><p>Institution-operated monitoring, identity checks and human review.</p><form onSubmit={(event: FormEvent) => { event.preventDefault(); void run(async () => { const { error } = await supabase!.auth.signInWithPassword({ email, password }); if (error) throw error; }); }}><label>Email<input type="email" required autoComplete="username" value={email} onChange={event => setEmail(event.target.value)}/></label><label>Password<input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)}/></label><button disabled={busy}>Sign in</button></form>{error && <p className="error" role="alert">{error}</p>}</main>;
  const availableTabs = manager ? tabs : tabs.filter(item => item.id === 'sessions'||item.id==='workload');
  if(workspaceActor!==user)return <main className="configuration"><p role="status">Loading the signed-in institution workspace…</p>{error&&<p role="alert" className="error">{error}</p>}<button className="quiet" onClick={()=>void supabase!.auth.signOut({scope:'local'})}>Sign out</button></main>;
  const contextLoading=loading||Boolean(tenant&&loadedScope!==scope.current);
  const props = { rows, busy: busy || loading, command };
  const workspace = workspaces.find(row => row.tenant_id === tenant);
  return <div className="workspace"><ServiceHeader service="Proctor" nav={availableTabs.map(item => ({ ...item, active: item.id === tab, onClick: () => setTab(item.id) }))}><label className="tenant">Institution<select disabled={busy || loading} value={tenant} onChange={event => setTenant(event.target.value)}>{workspaces.map(row => <option key={identifier(row.tenant_id)} value={identifier(row.tenant_id)}>{identifier((row.tenants as Row)?.name) || identifier(row.tenant_id)}</option>)}</select></label><button className="quiet" disabled={busy} onClick={() => void run(async () => { const { error } = await supabase!.auth.signOut({ scope: 'local' }); if (error) throw error; setPassword(''); })}>Sign out</button></ServiceHeader>
    <main id="workspace-main" tabIndex={-1} aria-busy={loading}>
      {error && <p role="alert" className="error">{error}</p>}{notice && <p role="status" className="notice">{notice}</p>}
      {!tenant ? <><h1>Your institution workspace</h1><p>No institutions are linked to your account. Ask your institution administrator to add you.</p></> : contextLoading ? <p role="status">Loading your institution workspace…</p> : <>
        <div className="workspace-toolbar"><span>Institution-operated proctoring</span><button className="quiet" disabled={busy || detailLoading} onClick={() => void run(() => load(scope.current))}>Refresh records</button></div>
        {tab === 'sessions' && <SessionScreen key={`${user}:${tenant}:${detail?.session.id??''}`} {...props} detail={detail} detailLoading={detailLoading} selectSession={id => void selectSession(id)} canObserve={detail?.permissions.observe === true} canReview={detail?.permissions.review === true} reviewerId={user} tenantId={tenant}/>}
        {tab==='workload'&&<WorkloadScreen key={`${user}:${tenant}`} actor={user} tenant={tenant} manager={manager} openSession={id=>{setTab('sessions');void selectSession(id);}}/>}
        {manager && tab === 'policies' && <PolicyScreen {...props}/>}{manager && tab === 'identity' && <IdentityScreen {...props}/>}{manager && tab === 'team' && <TeamScreen {...props} canGrant={['owner','admin'].includes(identifier(workspace?.role))}/>}
      </>}
    </main><footer>Schood Proctor · Human review remains separate from academic grading.</footer>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
