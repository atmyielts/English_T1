import { formatLocaleDateTime, getLocaleTag, translate } from '../../i18n';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { UpdatesButton } from '../UpdatesButton';
import { GuardianMistakeFeed } from './GuardianMistakeFeed';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BellRing,
  BookOpenCheck,
  CalendarDays,
  CreditCard,
  HelpCircle,
  LogOut,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import {
  teacherStudioClaimGuardianLink,
  teacherStudioGuardianDashboard,
  teacherStudioGuardianHistory,
  teacherStudioGuardianServiceRequests,
  teacherStudioCreateGuardianServiceRequest,
  teacherStudioGuardianSendMessage,
  teacherStudioGuardianUpdatePreferences,
  teacherStudioSubmitSensitiveReport,
  type AcademyServiceRequest,
  type AcademyGuardianDashboard,
} from '../../lib/client';

type Props = { actorId:string;onSignOut: () => Promise<void> };
type Tab = 'overview' | 'attendance' | 'learning' | 'schedule' | 'billing' | 'messages' | 'requests' | 'preferences';
const label = (value: unknown) => translate(String(value ?? '').replaceAll('_', ' '));
const money = (value: unknown, currency = 'UZS') => {
  if(typeof value==='number'&&!Number.isSafeInteger(value))return '—';
  const text=String(value??'');const amount=/^-?\d+$/.test(text)?BigInt(text):Number(value);
  return `${new Intl.NumberFormat(getLocaleTag()).format(amount)} ${currency}`;
};
export function GuardianPortalView({ actorId,onSignOut }: Props) {
  const [data, setData] = useState<AcademyGuardianDashboard | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [selectedRelationshipId, setSelectedRelationshipId] = useState('');
  const selectedRelationship = useRef('');
  const [busy, setBusy] = useState(false);
  const [historyLoading,setHistoryLoading]=useState(false);
  const historyLock=useRef(false);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const dashboardRequest = useRef(0);
  const requestsRequest = useRef(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const params = new URLSearchParams(window.location.search);
  const telegramInitData=window.Telegram?.WebApp?.initData||params.get('initData')||'';
  const [claimToken,setClaimToken]=useState(params.get('token')??'');
  const [confirmLink,setConfirmLink]=useState(false);
  const actionLock=useRef(false);
  const retryKeys=useRef(new Map<string,string>());
  const write = async <T,>(command:string,payload:Record<string,unknown>,send:(body:Record<string,unknown>,actor:string)=>Promise<T>) => {
    const identity=JSON.stringify([actorId,command,payload]);
    const key=retryKeys.current.get(identity)??crypto.randomUUID();
    retryKeys.current.set(identity,key);
    const result=await send({...payload,idempotency_key:key},actorId);
    retryKeys.current.delete(identity);
    return result;
  };
  const [message, setMessage] = useState('');
  const [requestResponse, setRequestResponse] = useState<{ relationshipId:string;requests:AcademyServiceRequest[];hasMore?:boolean } | null>(null);
  const [requestForm, setRequestForm] = useState({
    request_type: 'support',
    subject: '',
    details: '',
  });
  const [privateReport, setPrivateReport] = useState({
    case_type: 'complaint',
    title: '',
    description: '',
    severity: 'medium',
  });
  const [preference, setPreference] = useState({
    event_type: '*',
    enabled: true,
    inapp_enabled: true,
    telegram_enabled: true,
    email_enabled: false,
    sms_enabled: false,
    locale: 'uz',
    timezone: 'Asia/Tashkent',
    quiet_hours_start: '22:00',
    quiet_hours_end: '07:00',
    allow_critical_override: true,
  });
  const load = useCallback(async (relationshipId=selectedRelationship.current) => {
    const request = ++dashboardRequest.current;
    setDashboardLoading(true);
    setError('');
    try {
      const response = await teacherStudioGuardianDashboard(relationshipId||undefined,actorId);
      if (request !== dashboardRequest.current) return;
      const selection=relationshipId||response.children.find(c=>c.details_loaded)?.relationship_id||response.children[0]?.relationship_id||'';
      selectedRelationship.current=selection;
      setSelectedRelationshipId(selection);
      setData(response);
    } catch (next) {
      if (request === dashboardRequest.current) {
        setData(null);
        setError(next instanceof Error ? next.message : 'Unable to load parent portal.');
      }
    } finally {
      if (request === dashboardRequest.current) setDashboardLoading(false);
    }
  }, [actorId]);
  useEffect(() => {
    void load();
    return () => { dashboardRequest.current += 1; };
  }, [load]);
  const child = data?.children.find((item) => item.relationship_id === selectedRelationshipId) ?? data?.children[0];
  const guardianId = String(child?.guardian_id??data?.guardians.find((guardian) => guardian.academy_id === child?.academy_id)?.id ?? '');
  const requests = requestResponse && requestResponse.relationshipId === child?.relationship_id ? requestResponse.requests : [];
  const actionBlocked = busy || dashboardLoading || historyLoading;
  const loadHistory=async(section:string) => {
    if(!child||actionBlocked||historyLock.current)return;
    const relationship=child.relationship_id,generation=dashboardRequest.current;
    const fields:Record<string,string>={attendance:'session_date',grades:'submitted_at',homework:'due_at',schedule:'starts_at',charges:'due_on',messages:'created_at',announcements:'created_at',resources:'sort_order',progress_reports:'created_at',notifications:'created_at',requests:'created_at'};
    const records=section==='requests'?requests:section==='notifications'?data?.notifications.filter(n=>n.relationship_id===relationship)??[]:(child as unknown as Record<string,Record<string,unknown>[]>)[section]??[];
    const last=records.at(-1);
    const after=last?{relationship_id:relationship,section,key:String(last[fields[section]]??(section==='resources'?'0':'infinity')),id:last.id}:null;
    historyLock.current=true;setHistoryLoading(true);setError('');
    try{
      const page=await teacherStudioGuardianHistory(relationship,section,after,actorId);
      if(generation!==dashboardRequest.current||selectedRelationship.current!==relationship)return;
      const merge=(old:Record<string,unknown>[])=>[...new Map([...old,...page.records].map(row=>[String(row.id),row])).values()];
      if(section==='requests')setRequestResponse(current=>current?.relationshipId===relationship?{...current,requests:merge(current.requests) as AcademyServiceRequest[],hasMore:page.has_more}:current);
      else setData(current=>current?{...current,
        notifications:section==='notifications'?merge(current.notifications):current.notifications,
        children:current.children.map(row=>row.relationship_id!==relationship?row:{...row,
          ...(section==='notifications'?{}:{[section]:merge((row as unknown as Record<string,Record<string,unknown>[]>)[section]??[])}),
          history_has_more:{...row.history_has_more,[section]:page.has_more}})}:current);
    }catch(next){if(generation===dashboardRequest.current)setError(next instanceof Error?next.message:'Unable to load parent portal.');}
    finally{historyLock.current=false;setHistoryLoading(false);}
  };
  const selectChild = (relationshipId:string) => {
    dashboardRequest.current+=1;
    requestsRequest.current+=1;
    selectedRelationship.current=relationshipId;
    setSelectedRelationshipId(relationshipId);
    setDashboardLoading(true);
    setMessage('');
    setRequestForm({request_type:'support',subject:'',details:''});
    setPrivateReport({case_type:'complaint',title:'',description:'',severity:'medium'});
    setNotice('');
    setTab('overview');
    void load(relationshipId);
  };
  const run = async (work: () => Promise<unknown>, messageText: string) => {
    if (actionBlocked || actionLock.current) return;
    actionLock.current=true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      setNotice(messageText);
      await load();
    } catch (next) {
      setError(next instanceof Error ? next.message : 'Operation failed.');
    } finally {
      actionLock.current=false;
      setBusy(false);
    }
  };
  const orderedSchedule = useMemo(
    () =>
      [...(child?.schedule ?? [])].sort((a, b) => Date.parse(String(a.starts_at)) - Date.parse(String(b.starts_at))),
    [child?.schedule],
  );
  const nextLesson=orderedSchedule.find(lesson=>Date.parse(String(lesson.starts_at))>=Date.now()&&!['cancelled','completed','missed'].includes(String(lesson.status)));
  const loadRequests = useCallback(async () => {
    const request = ++requestsRequest.current;
    if (!child?.relationship_id) return;
    try {
      const response = await teacherStudioGuardianServiceRequests(child.relationship_id,actorId);
      if (request === requestsRequest.current) setRequestResponse({ relationshipId:child.relationship_id,requests:response.requests??[],hasMore:response.history_has_more });
    } catch (next) {
      if (request === requestsRequest.current) setError(next instanceof Error ? next.message : 'Unable to load support requests.');
    }
  }, [child?.relationship_id,actorId]);
  useEffect(() => {
    void loadRequests();
    return () => { requestsRequest.current += 1; };
  }, [loadRequests]);
  const savedPreference = data?.preferences.find((item) => item.guardian_id === guardianId && item.event_type === '*');
  useEffect(() => {
    setPreference({
      event_type: String(savedPreference?.event_type ?? '*'),
      enabled: savedPreference?.enabled !== false,
      inapp_enabled: savedPreference?.inapp_enabled !== false,
      telegram_enabled: savedPreference?.telegram_enabled !== false,
      email_enabled: savedPreference?.email_enabled === true,
      sms_enabled: savedPreference?.sms_enabled === true,
      locale: String(savedPreference?.locale ?? 'uz'),
      timezone: String(savedPreference?.timezone ?? 'Asia/Tashkent'),
      quiet_hours_start: String(savedPreference?.quiet_hours_start ?? '22:00'),
      quiet_hours_end: String(savedPreference?.quiet_hours_end ?? '07:00'),
      allow_critical_override: savedPreference?.allow_critical_override !== false,
    });
  }, [guardianId, savedPreference]);
  if (!data)
    return (
      <div className="ts-loading">
        <div className="auth-card">
          <h2>{translate('Parent Portal')}</h2>
          <p>{translate(error || 'Loading your parent portal...')}</p>
          {error ? <button className="primary-btn" disabled={dashboardLoading} onClick={() => selectChild('')}>{translate('Retry')}</button> : null}
        </div>
      </div>
    );
  if (!data.children.length)
    return (
      <div className="market-page parent-workspace">
        <div className="market-wrap">
          <div className="market-nav">
            <span className="market-badge">{translate('Secure parent access')}</span>
            <LanguageSwitcher inline />
            <UpdatesButton variant="inline" />
            <button className="ghost-btn" onClick={() => void onSignOut()}>
              <LogOut size={16} /> {translate('Sign out')}
            </button>
          </div>
          <section className="market-hero">
            <div className="market-copy">
              <div className="market-eyebrow">
                <ShieldCheck size={14} /> {translate('An invitation is needed')}
              </div>
              <h1>{translate('Connect with your child’s academy')}</h1>
              <p>
                {translate(
                  'Your academy controls which information is shared with you.',
                )}
              </p>
            </div>
            {telegramInitData ? <form className="market-card compact-form" onSubmit={(event:FormEvent)=>{
              event.preventDefault();void run(()=>teacherStudioClaimGuardianLink({token:claimToken,init_data:telegramInitData,confirm_access:confirmLink},actorId),'Guardian access verified and connected.');
            }}>
              <label>{translate('Invitation code')}<input className="input" value={claimToken} onChange={event=>setClaimToken(event.target.value)} required/></label>
              <label className="check-row"><input type="checkbox" checked={confirmLink} onChange={event=>setConfirmLink(event.target.checked)}/>{translate('I agree to connect this account to my child’s academy updates.')}</label>
              {error?<p className="form-error">{translate(error)}</p>:null}
              {notice?<p className="form-success">{translate(notice)}</p>:null}
              <button className="primary-btn" disabled={actionBlocked||!confirmLink}>{translate('Connect family updates')}</button>
            </form> : <article className="market-card"><h2>{translate('Ask your academy for an invitation')}</h2><p>{translate('Open the parent invitation link sent by your academy. Sign in using the email they invited.')}</p><button className="ghost-btn" disabled={actionBlocked} onClick={()=>void load()}>{translate('Refresh')}</button></article>}

          </section>
        </div>
      </div>
    );
  return (
    <div className="market-page parent-workspace">
      <div className="market-wrap">
        <div className="market-nav">
          <span className="market-badge">{translate('Parent Portal')}</span>
          <LanguageSwitcher inline />
          <UpdatesButton variant="inline" />
          <button className="ghost-btn" onClick={() => void load()} disabled={busy || dashboardLoading}>
            <RefreshCw size={16} /> {translate('Refresh')}
          </button>
          <button className="ghost-btn" onClick={() => void onSignOut()}>
            <LogOut size={16} /> {translate('Sign out')}
          </button>
        </div>
        <section className="market-hero">
          <div className="market-copy">
            <div className="market-eyebrow">
              <ShieldCheck size={14} /> {translate('Your family dashboard')}
            </div>
            <h1>{child?.student.name}</h1>
            <p>
              {label(child?.relationship_type)} ·{' '}
              {translate(child?.is_primary_contact ? 'Primary contact' : 'Authorized contact')}{' '}
            </p>
            <label className="parent-child-switcher">
            <span>{translate('Choose your child')}</span>
            <select className="input" value={child?.relationship_id ?? ''} disabled={actionBlocked} onChange={(e) => selectChild(e.target.value)}>
              {data.children.map((item) => (
                <option key={item.relationship_id} value={item.relationship_id}>
                  {item.student.name}
                </option>
              ))}
            </select>
            </label>
          </div>
          <div className="academy-command-card">
            <div className="academy-command-grid">
              <article>
                <UsersRound size={18} />
                <strong>{translate('Status')}</strong>
                <span>
                  {child?.permissions.status ? label(child.student.status ?? 'active') : translate('Not shared')}
                </span>
              </article>
              <article>
                <CalendarDays size={18} />
                <strong>{translate('Next lesson')}</strong>
                <span>
                  {child?.permissions.schedule
                    ? nextLesson?formatLocaleDateTime(String(nextLesson.starts_at)):translate('Not scheduled')
                    : translate('Not shared')}
                </span>
              </article>
              <article>
                <CreditCard size={18} />
                <strong>{translate('Balance')}</strong>
                <span>
                  {child?.permissions.payments && child.permissions.debt
                    ? child.balances.length?money(child.balances[0]?.balance, String(child.balances[0]?.currency ?? 'UZS')):translate('No balance recorded')
                    : translate('Not shared')}
                </span>
              </article>
              <article>
                <BellRing size={18} />
                <strong>{translate('Updates')}</strong>
                <span>
                  {data.notifications.filter(n=>n.relationship_id===child?.relationship_id).length}
                </span>
              </article>
            </div>
          </div>
        </section>
        {dashboardLoading || child?.details_loaded===false ? <p className="info-banner" role="status">{translate('Updating student information...')}</p> : null}
        <div className="market-actions" aria-live="polite">
          {Object.entries({attendance:['attendance'],learning:['grades','homework','resources'],schedule:['schedule'],billing:['charges'],messages:['messages'],overview:['announcements','progress_reports','notifications'],requests:['requests']}).filter(([key])=>key===tab).flatMap(([,sections])=>sections).filter(section=>section==='requests'?requestResponse?.hasMore:child?.history_has_more?.[section]).map(section=>(
            <button key={section} className="ghost-btn" disabled={actionBlocked} onClick={()=>void loadHistory(section)}>{translate('Load more')} � {label(section)}</button>
          ))}
        </div>
        {error ? <p className="form-error">{translate(error)}</p> : null}
        {notice ? <p className="form-success">{translate(notice)}</p> : null}
        <nav className="business-tabs" aria-label={translate('Parent portal sections')}>
          {(
            [
              ['overview', 'Overview'],
              ['attendance', 'Attendance'],
              ['learning', 'Grades & homework'],
              ['schedule', 'Schedule'],
              ['billing', 'Payments'],
              ['messages', 'Messages'],
              ['requests', 'Ask for help'],
              ['preferences', 'Preferences'],
            ] as Array<[Tab, string]>
          )
            .filter(
              ([id]) =>
                id === 'overview' ||
                id === 'requests' ||
                id === 'preferences' ||
                (id === 'attendance' && child?.permissions.attendance) ||
                (id === 'learning' && (child?.permissions.grades || child?.permissions.homework)) ||
                (id === 'schedule' && child?.permissions.schedule) ||
                (id === 'billing' && child?.permissions.payments) ||
                (id === 'messages' && child?.permissions.messages),
            )
            .map(([id, text]) => (
              <button key={id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>
                {translate(text)}
              </button>
            ))}
        </nav>
        {tab === 'overview' ? (
          <section className="market-grid market-grid--wide">
            <article className="market-card">
              <BookOpenCheck size={20} />
              <h3>{translate('Authorized learning snapshot')}</h3>
              <p>
                {child?.homework.length ?? 0} {translate('homework items ·')} {child?.grades.length ?? 0}{' '}
                {translate('grade records ·')} {child?.attendance.length ?? 0} {translate('attendance records.')}
              </p>
            </article>
            <article className="market-card">
              <MessageSquare size={20} />
              <h3>{translate('Announcements and reports')}</h3>
              <p>
                {child?.announcements.length ?? 0} {translate('announcements ·')} {child?.progress_reports.length ?? 0}{' '}
                {translate('progress reports.')}
              </p>
            </article>
            <p className="parent-sharing-note"><ShieldCheck size={16} aria-hidden="true" />{translate('Your academy controls which information is shared with you.')}</p>
          </section>
        ) : null}
        {tab === 'attendance' ? (
          <section className="market-card">
            <h2>{translate('Attendance')}</h2>
            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>{translate('Date')}</th>
                    <th>{translate('Status')}</th>
                    <th>{translate('Note')}</th>
                  </tr>
                </thead>
                <tbody>
                  {child?.attendance.map((item) => (
                    <tr key={String(item.id)}>
                      <td>{String(item.session_date)}</td>
                      <td>{label(item.status)}</td>
                      <td>{String(item.notes ?? '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
        {tab === 'learning' ? (
          <section className="market-grid market-grid--wide">
            <article className="market-card">
              <h2>{translate('Grades')}</h2>
              <div className="record-list">
                {child?.grades.map((item) => (
                  <article key={String(item.id)}>
                    <strong>
                      {item.score === null
                        ? translate('Awaiting grade')
                        : translate('{score} points', {
                            score: String(item.score),
                          })}
                    </strong>
                    <p>{typeof item.feedback==='string'&&item.feedback.trim()?item.feedback:label(item.status)}</p>
                  </article>
                ))}
              </div>
            </article>
            <article className="market-card">
              <h2>{translate('Homework')}</h2>
              <div className="record-list">
                {child?.homework.map((item) => (
                  <article key={String(item.id)}>
                    <strong>{String(item.title)}</strong>
                    <p>
                      {translate('Due')}{' '}
                      {item.due_at ? formatLocaleDateTime(String(item.due_at)) : translate('Not set')} ·{' '}
                      {label(item.status)}
                    </p>
                  </article>
                ))}
              </div>
            </article>
            {child?.permissions.homework ? (
              <GuardianMistakeFeed academyId={child.academy_id} relationshipId={child.relationship_id} actorId={actorId} studentName={child.student.name} />
            ) : null}
          </section>
        ) : null}
        {tab === 'schedule' ? (
          <section className="market-card">
            <h2>{translate('Lesson schedule')}</h2>
            <div className="record-list">
              {orderedSchedule.map((item) => (
                <article key={String(item.id)}>
                  <strong>{String(item.title)}</strong>
                  <p>
                    {formatLocaleDateTime(String(item.starts_at))} · {label(item.delivery_mode)} · {label(item.status)}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
        {tab === 'billing' ? (
          <section className="market-card">
            <h2>{translate(child?.permissions.debt?'Payments and debt':'Payments')}</h2>
            <p className="muted">
              {translate(
                child?.permissions.debt?'View your child’s charges, payments and balance here.':'View your child’s charges and payments here.',
              )}
            </p>
            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>{translate('Charge')}</th>
                    <th>{translate('Due')}</th>
                    <th>{translate('Amount')}</th>
                    {child?.permissions.debt?<><th>{translate('Outstanding')}</th><th>{translate('Status')}</th></>:null}
                  </tr>
                </thead>
                <tbody>
                  {child?.charges.map((item) => (
                    <tr key={String(item.id)}>
                      <td>{String(item.charge_number)}</td>
                      <td>{String(item.due_on)}</td>
                      <td>{money(item.effective_amount, String(item.currency))}</td>
                      {child?.permissions.debt?<><td>{money(item.outstanding_amount, String(item.currency))}</td><td>{label(item.calculated_status)}</td></>:null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
        {tab === 'messages' ? (
          <section className="market-grid market-grid--wide">
            <article className="market-card">
              <h2>{translate('Teacher and academy messages')}</h2>
              <div className="record-list">
                {child?.messages.map((item) => (
                  <article key={String(item.id)}>
                    <strong>{label(item.direction)}</strong>
                    <p>
                      {String(item.body)} · {formatLocaleDateTime(String(item.created_at))}
                    </p>
                  </article>
                ))}
              </div>
            </article>
            {child?.permissions.message_academy ? (
              <form
                className="market-card compact-form"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  void run(
                    async () => {
                      await write('message',{
                        relationship_id: child.relationship_id,
                        body: message,
                      },teacherStudioGuardianSendMessage);
                      setMessage('');
                    },
                    'Message sent to the academy.',
                  );
                }}
              >
                <h2>{translate('Message academy')}</h2>
                <textarea className="input" value={message} disabled={actionBlocked} onChange={(e) => setMessage(e.target.value)} required />
                <button className="primary-btn" disabled={actionBlocked}>
                  {translate('Send message')}
                </button>
              </form>
            ) : null}
          </section>
        ) : null}
        {tab === 'requests' ? (
          <section className="market-grid market-grid--wide">
            <article className="market-card">
              <HelpCircle size={20} />
              <h2>{translate('Requests for the academy')}</h2>
              <p className="muted">
                {translate(
                  'Ask about attendance, payments, scheduling, documents, or learning support. The academy can assign and track each request.',
                )}
              </p>
              <div className="record-list">
                {requests.length ? (
                  requests.map((item) => (
                    <article key={item.id}>
                      <strong>{item.subject}</strong>
                      <p>
                        {label(item.request_type)} · {label(item.status)} · {formatLocaleDateTime(item.created_at)}
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="empty-copy">{translate('You have no open requests for this academy.')}</p>
                )}
              </div>
            </article>
            <form
              className="market-card compact-form"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                if (!child) return;
                void run(async () => {
                  await write('request',{
                    academy_id: child.academy_id,
                    relationship_id: child.relationship_id,
                    ...requestForm,
                  },teacherStudioCreateGuardianServiceRequest);
                  setRequestForm({
                    request_type: 'support',
                    subject: '',
                    details: '',
                  });
                  await loadRequests();
                }, 'Your request was sent to the academy.');
              }}
            >
              <h2>{translate('Ask the academy')}</h2>
              <label>
                {translate('What do you need help with?')}
                <select
                  className="input"
                  value={requestForm.request_type}
                  onChange={(event) =>
                    setRequestForm({
                      ...requestForm,
                      request_type: event.target.value,
                    })
                  }
                >
                  <option value="support">{translate('General question')}</option>
                  <option value="make_up">{translate('Make-up lesson')}</option>
                  <option value="schedule_change">{translate('Schedule')}</option>
                  <option value="refund">{translate('Payment or balance')}</option>
                  <option value="document">{translate('Document')}</option>
                  <option value="transfer">{translate('Transfer')}</option>
                  <option value="freeze">{translate('Freeze')}</option>
                  <option value="other">{translate('Other')}</option>
                </select>
              </label>
              <label>
                {translate('Short title')}
                <input
                  className="input"
                  value={requestForm.subject}
                  onChange={(event) =>
                    setRequestForm({
                      ...requestForm,
                      subject: event.target.value,
                    })
                  }
                  required
                />
              </label>
              <label>
                {translate('Details')}
                <textarea
                  className="input"
                  value={requestForm.details}
                  onChange={(event) =>
                    setRequestForm({
                      ...requestForm,
                      details: event.target.value,
                    })
                  }
                  required
                />
              </label>
              <button className="primary-btn" disabled={actionBlocked}>
                {translate('Send request')}
              </button>
              <details className="private-report">
                <summary>{translate('Report a private or serious concern')}</summary>
                <p>
                  {translate("This goes to the academy's authorized safeguarding team, not the general request queue.")}
                </p>
                <label>
                  {translate('Concern')}
                  <input
                    className="input"
                    value={privateReport.title}
                    onChange={(event) =>
                      setPrivateReport({
                        ...privateReport,
                        title: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  {translate('What happened?')}
                  <textarea
                    className="input"
                    value={privateReport.description}
                    onChange={(event) =>
                      setPrivateReport({
                        ...privateReport,
                        description: event.target.value,
                      })
                    }
                  />
                </label>
                <button
                  className="ghost-btn"
                  type="button"
                  disabled={actionBlocked || !privateReport.title || !privateReport.description}
                  onClick={() => {
                    if (!child) return;
                    void run(async () => {
                      await teacherStudioSubmitSensitiveReport({
                        academy_id: child.academy_id,
                        relationship_id: child.relationship_id,
                        reporter_kind: 'guardian',
                        ...privateReport,
                      });
                      setPrivateReport({ case_type: 'complaint', title: '', description: '', severity: 'medium' });
                    }, 'Your private report was sent securely.');
                  }}
                >
                  {translate('Send private report')}
                </button>
              </details>
            </form>
          </section>
        ) : null}
        {tab === 'preferences' ? (
          <section className="market-grid market-grid--wide">
            <form
              className="market-card compact-form"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (!guardianId) return;
                void run(
                  () =>
                    write('preferences',{
                      relationship_id: child?.relationship_id,
                      guardian_id: guardianId,
                      ...preference,
                    },teacherStudioGuardianUpdatePreferences),
                  'Notification preferences updated.',
                );
              }}
            >
              <h2>{translate('Notification preferences')}</h2>
              <label>
                {translate('Event type')}
                <input
                  className="input"
                  value={preference.event_type}
                  onChange={(e) => setPreference({ ...preference, event_type: e.target.value })}
                />
              </label>
              <div className="form-grid two-col">
                <label>
                  {translate('Quiet from')}
                  <input
                    className="input"
                    type="time"
                    value={preference.quiet_hours_start}
                    onChange={(e) =>
                      setPreference({
                        ...preference,
                        quiet_hours_start: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  {translate('Quiet until')}
                  <input
                    className="input"
                    type="time"
                    value={preference.quiet_hours_end}
                    onChange={(e) =>
                      setPreference({
                        ...preference,
                        quiet_hours_end: e.target.value,
                      })
                    }
                  />
                </label>
              </div>
              {(
                [
                  ['telegram_enabled', 'Telegram'],
                  ['inapp_enabled', 'In-app'],
                  ['email_enabled', 'Email'],
                  ['sms_enabled', 'SMS'],
                  ['allow_critical_override', 'Allow critical override'],
                ] as Array<[keyof typeof preference, string]>
              ).map(([key, text]) => (
                <label className="check-row" key={key}>
                  <input
                    type="checkbox"
                    checked={Boolean(preference[key])}
                    onChange={(e) => setPreference({ ...preference, [key]: e.target.checked })}
                  />
                  {translate(text)}
                </label>
              ))}
              <button className="primary-btn" disabled={actionBlocked || !guardianId}>
                {translate('Save preferences')}
              </button>
            </form>
            <article className="market-card">
              <h2>{translate('Notification history')}</h2>
              <div className="record-list">
                {data.notifications.filter((item) => item.guardian_id === guardianId).map((item) => (
                  <article key={String(item.id)}>
                    <strong>{String(item.title ?? label(item.event_key))}</strong>
                    <p>
                      {String(item.body)} · {label(item.status)}
                    </p>
                  </article>
                ))}
              </div>
            </article>
          </section>
        ) : null}
      </div>
    </div>
  );
}
