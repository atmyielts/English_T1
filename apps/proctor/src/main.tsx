import React, { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { configured, proctorRequest, supabase, observeAccount, type Row } from '../../../packages/assessment-web/src/client';
import { ServiceHeader } from '../../../packages/service-design/src/ServiceHeader';
import { WorkspaceNavigation } from '../../../packages/service-design/src/WorkspaceNavigation';
import { I18nProvider, LocaleSwitcher } from '../../../packages/service-i18n/src/i18n.tsx';
import { accountLink } from '../../../packages/assessment-web/src/account-links';
import { catalogs, useAppT, useErrorText, type AppKey } from './i18n/index.ts';
import { PolicyScreen } from './PolicyScreen';
import { IdentityScreen } from './IdentityScreen';
import { TeamScreen } from './TeamScreen';
import { SessionScreen } from './SessionScreen';
import { WorkloadScreen } from './WorkloadScreen';
import { identifier, type SessionDetail } from './types';
import '../../../packages/service-design/src/platform.css';
import './style.css';

type Tab = 'sessions' | 'workload' | 'policies' | 'identity' | 'team';
const tabLabels: Record<Tab, AppKey> = { workload: 'nav.workload', sessions: 'nav.sessions', policies: 'nav.policies', identity: 'nav.identity', team: 'nav.team' };
// Day-to-day monitoring first, then the supervisor-only setup that precedes a sitting.
const sections: { id: string; label: AppKey; tabs: Tab[] }[] = [
  { id: 'monitoring', label: 'nav.group.monitoring', tabs: ['workload', 'sessions'] },
  { id: 'setup', label: 'nav.group.setup', tabs: ['policies', 'identity', 'team'] },
];
const managerTabs: Tab[] = ['policies', 'identity', 'team'];
const isTab = (value: string | null): value is Tab => value !== null && (Object.keys(tabLabels) as string[]).includes(value);
/** Deep links from Assessment Cloud: `?tenant_id=<uuid>&tab=<tab>`. Read once. */
function readDeepLink(): { tenant: string; tab: Tab | null } {
  try {
    const params = new URLSearchParams(location.search), tab = params.get('tab');
    return { tenant: params.get('tenant_id')?.trim() ?? '', tab: isTab(tab) ? tab : null };
  } catch { return { tenant: '', tab: null }; }
}
function App() {
  const t = useAppT(), problem = useErrorText();
  const [user, setUser] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [workspaces, setWorkspaces] = useState<Row[]>([]), [tenant, setTenant] = useState(''), [tab, setTab] = useState<Tab>('workload');
  const [permissions, setPermissions] = useState<string[]>([]), [rows, setRows] = useState<Record<string, Row[]>>({});
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [detailLoading, setDetailLoading] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [workspaceActor,setWorkspaceActor]=useState(''),[loadedScope,setLoadedScope]=useState('');
  const selectedSession = useRef(''), scope = useRef(''), commandKeys = useRef(new Map<string, string>()), detailRequest = useRef(0),loadRequest=useRef(0);
  const deepLink = useRef(readDeepLink());
  scope.current = `${user}:${tenant}`;
  const manager = permissions.includes('proctor.manage');
  useEffect(() => {
    return observeAccount(setUser);
  }, []);
  useEffect(() => {
    let active = true;
    setWorkspaces([]); setTenant(''); setRows({}); setPermissions([]); setDetail(null); selectedSession.current = '';
    setWorkspaceActor('');setLoadedScope('');
    if (user) proctorRequest<Row[]>('workspaces',undefined,undefined,undefined,user).then(data => {
      if (!active) return;
      const linked = deepLink.current.tenant;
      deepLink.current.tenant = '';
      setWorkspaces(data);
      setTenant(linked && data.some(row => identifier(row.tenant_id) === linked) ? linked : identifier(data[0]?.tenant_id));
      setWorkspaceActor(user);
    }).catch(cause => { if (active) setError(problem(cause)); });
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
    // The first institution opened after sign-in may honour a deep-linked tab;
    // every later institution change starts on the monitoring board.
    const linkedTab = user && tenant ? deepLink.current.tab : null;
    if (user && tenant) deepLink.current.tab = null;
    setPermissions([]); setRows({}); setDetail(null); setDetailLoading(false); setError(''); setNotice(''); setTab(linkedTab ?? 'workload'); selectedSession.current = ''; detailRequest.current++;
    loadRequest.current++;
  }, [user, tenant]);
  useEffect(()=>{
    if (!user || !tenant) return;
    const expectedScope = `${user}:${tenant}`,request=++loadRequest.current;
    setLoading(true);
    void load(expectedScope,request).catch(cause => { if (scope.current === expectedScope&&loadRequest.current===request) setError(problem(cause)); }).finally(() => { if (scope.current === expectedScope&&loadRequest.current===request) setLoading(false); });
  },[user,tenant,tab]);
  // A supervisor-only tab (for example from a deep link) falls back to the
  // board once confirmed permissions show this account cannot supervise.
  useEffect(() => {
    if (tenant && loadedScope === `${user}:${tenant}` && !manager && managerTabs.includes(tab)) setTab('workload');
  }, [user, tenant, loadedScope, manager, tab]);
  async function run(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (cause) { setError(problem(cause)); } finally { setBusy(false); }
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
      try { await load(expectedScope); } catch { if (scope.current === expectedScope) setError(t('app.savedNotLoaded')); }
    });
  }
  async function selectSession(id: string) {
    const expectedScope = scope.current, request = ++detailRequest.current;
    setDetailLoading(true); setError('');setDetail(null);selectedSession.current='';
    try {
      const result = await proctorRequest<SessionDetail>(`sessions/${id}`, tenant,undefined,undefined,user);
      if (scope.current === expectedScope && detailRequest.current === request) { selectedSession.current = id; setDetail(result); }
    } catch (cause) { if (scope.current === expectedScope && detailRequest.current === request) setError(problem(cause, 'app.sessionLoadFailed')); }
    finally { if (scope.current === expectedScope && detailRequest.current === request) setDetailLoading(false); }
  }
  if (!configured) return <main className="configuration"><h1>{t('app.title')}</h1><p>{t('app.notConfigured')}</p></main>;
  if (!user) return <main className="signin"><div className="brand">Schood <span>{t('app.name')}</span></div><LocaleSwitcher label={t('locale.label')}/><h1>{t('signin.title')}</h1><p>{t('signin.lead')}</p><form onSubmit={(event: FormEvent) => { event.preventDefault(); void run(async () => { const { error } = await supabase!.auth.signInWithPassword({ email, password }); if (error) throw error; }); }}><label>{t('signin.email')}<input type="email" required autoComplete="username" value={email} onChange={event => setEmail(event.target.value)}/></label><label>{t('signin.password')}<input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)}/></label><button disabled={busy}>{t('signin.submit')}</button></form><p className="account-links"><a href={accountLink('signup')}>{t('account.create')}</a><a href={accountLink('forgot')}>{t('account.forgot')}</a></p>{error && <p className="error" role="alert">{error}</p>}</main>;
  const availableTabs = (Object.keys(tabLabels) as Tab[]).filter(item => manager || !managerTabs.includes(item));
  if(workspaceActor!==user)return <main className="configuration"><p role="status">{t('workspace.loadingAccount')}</p>{error&&<p role="alert" className="error">{error}</p>}<button className="quiet" onClick={()=>void supabase!.auth.signOut({scope:'local'})}>{t('header.signOut')}</button></main>;
  const contextLoading=loading||Boolean(tenant&&loadedScope!==scope.current);
  const props = { rows, busy: busy || loading, command };
  const workspace = workspaces.find(row => row.tenant_id === tenant);
  return <div className="workspace">
    <ServiceHeader service={t('app.name')} labels={{ skip: t('header.skip'), home: t('header.home'), menu: t('header.menu'), workspace: t('header.workspace') }}>
      <label className="tenant"><span className="visually-hidden">{t('header.institution')}</span><select aria-label={t('header.institution')} disabled={busy || loading} value={tenant} onChange={event => setTenant(event.target.value)}>{workspaces.map(row => <option key={identifier(row.tenant_id)} value={identifier(row.tenant_id)}>{identifier((row.tenants as Row)?.name) || identifier(row.tenant_id)}</option>)}</select></label>
      <button className="quiet" disabled={busy} onClick={() => void run(async () => { const { error } = await supabase!.auth.signOut({ scope: 'local' }); if (error) throw error; setPassword(''); })}>{t('header.signOut')}</button>
      <LocaleSwitcher label={t('locale.label')}/>
    </ServiceHeader>
    <div className="workspace-layout">
      <WorkspaceNavigation
        label={t('header.workspace', { service: t('app.name') })}
        menuLabel={t('nav.menu')}
        sections={sections.map(section => ({
          id: section.id,
          label: t(section.label),
          items: availableTabs.filter(item => section.tabs.includes(item)).map(item => ({ id: item, label: t(tabLabels[item]), active: item === tab, onClick: () => setTab(item) })),
        }))}
      />
      <main id="workspace-main" tabIndex={-1} aria-busy={loading}>
        {error && <p role="alert" className="error">{error}</p>}{notice && <p role="status" className="notice">{notice}</p>}
        {!tenant ? <><h1>{t('workspace.title')}</h1><p>{t('workspace.noTenant')}</p></> : contextLoading ? <p role="status">{t('workspace.loading')}</p> : <>
          <div className="workspace-toolbar"><span>{t('workspace.toolbar')}</span><button className="quiet" disabled={busy || detailLoading} onClick={() => void run(() => load(scope.current))}>{t('workspace.refresh')}</button></div>
          {tab === 'sessions' && <SessionScreen key={`${user}:${tenant}:${detail?.session.id??''}`} {...props} detail={detail} detailLoading={detailLoading} selectSession={id => void selectSession(id)} canObserve={detail?.permissions.observe === true} canReview={detail?.permissions.review === true} reviewerId={user} tenantId={tenant}/>}
          {tab==='workload'&&<WorkloadScreen key={`${user}:${tenant}`} actor={user} tenant={tenant} manager={manager} openSession={id=>{setTab('sessions');void selectSession(id);}}/>}
          {manager && tab === 'policies' && <PolicyScreen {...props}/>}{manager && tab === 'identity' && <IdentityScreen {...props}/>}{manager && tab === 'team' && <TeamScreen {...props} canGrant={['owner','admin'].includes(identifier(workspace?.role))}/>}
        </>}
      </main>
    </div>
    <footer>{t('workspace.footer')}</footer>
  </div>;
}
createRoot(document.getElementById('root')!).render(<I18nProvider catalogs={catalogs}><App/></I18nProvider>);
