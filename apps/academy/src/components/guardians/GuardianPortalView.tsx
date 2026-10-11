import { formatLocaleDateTime, getLocaleTag, translate } from '../../i18n';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { UpdatesButton } from '../UpdatesButton';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
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
  teacherStudioGuardianServiceRequests,
  teacherStudioCreateGuardianServiceRequest,
  teacherStudioGuardianSendMessage,
  teacherStudioGuardianUpdatePreferences,
  teacherStudioSubmitSensitiveReport,
  type AcademyServiceRequest,
  type AcademyGuardianDashboard,
} from '../../lib/client';

type Props = { onSignOut: () => Promise<void> };
type Tab = 'overview' | 'attendance' | 'learning' | 'schedule' | 'billing' | 'messages' | 'requests' | 'preferences';
const label = (value: unknown) => translate(String(value ?? '').replaceAll('_', ' '));
const money = (value: unknown, currency = 'UZS') =>
  `${new Intl.NumberFormat(getLocaleTag()).format(Number(value ?? 0))} ${currency}`;
export function GuardianPortalView({ onSignOut }: Props) {
  const [data, setData] = useState<AcademyGuardianDashboard | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [childIndex, setChildIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const params = new URLSearchParams(window.location.search);
  const [claim, setClaim] = useState({
    token: params.get('token') ?? '',
    telegram_user_id: '',
    telegram_chat_id: '',
    telegram_username: '',
  });
  const [message, setMessage] = useState('');
  const [requests, setRequests] = useState<AcademyServiceRequest[]>([]);
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
  const load = useCallback(async () => {
    setError('');
    try {
      setData(await teacherStudioGuardianDashboard());
    } catch (next) {
      setError(next instanceof Error ? next.message : 'Unable to load parent portal.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const child = data?.children[childIndex] ?? data?.children[0];
  const guardianId = String(data?.guardians[0]?.id ?? '');
  const run = async (work: () => Promise<unknown>, messageText: string) => {
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
      setBusy(false);
    }
  };
  const upcoming = useMemo(
    () =>
      [...(child?.schedule ?? [])].sort((a, b) => Date.parse(String(a.starts_at)) - Date.parse(String(b.starts_at))),
    [child?.schedule],
  );
  const loadRequests = useCallback(async () => {
    if (!child?.academy_id) return;
    try {
      const response = await teacherStudioGuardianServiceRequests(child.academy_id);
      setRequests(response.requests ?? []);
    } catch (next) {
      setError(next instanceof Error ? next.message : 'Unable to load support requests.');
    }
  }, [child?.academy_id]);
  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);
  if (!data)
    return (
      <div className="ts-loading">
        <div className="auth-card">
          <h2>{translate('Parent Portal')}</h2>
          <p>{error || 'Loading securely authorized family access…'}</p>
        </div>
      </div>
    );
  if (!data.children.length)
    return (
      <div className="market-page">
        <div className="market-wrap">
          <div className="market-nav">
            <span className="market-badge">{translate('Secure parent access')}</span>
            <UpdatesButton variant="inline" />
            <button className="ghost-btn" onClick={() => void onSignOut()}>
              <LogOut size={16} /> {translate('Sign out')}
            </button>
          </div>
          <section className="market-hero">
            <div className="market-copy">
              <div className="market-eyebrow">
                <ShieldCheck size={14} /> {translate('Account linking required')}
              </div>
              <h1>{translate('Connect an authorized guardian relationship')}</h1>
              <p>
                {translate(
                  'Ask the academy for a one-time link. A Telegram username alone never grants student access.',
                )}
              </p>
            </div>
            <form
              className="market-card compact-form"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void run(() => teacherStudioClaimGuardianLink(claim), 'Guardian access verified and connected.');
              }}
            >
              <label>
                {translate('One-time token')}
                <input
                  className="input"
                  value={claim.token}
                  onChange={(e) => setClaim({ ...claim, token: e.target.value })}
                  required
                />
              </label>
              <label>
                {translate('Verified Telegram user ID')}
                <input
                  className="input"
                  value={claim.telegram_user_id}
                  onChange={(e) => setClaim({ ...claim, telegram_user_id: e.target.value })}
                  required
                />
              </label>
              <label>
                {translate('Telegram chat ID')}
                <input
                  className="input"
                  value={claim.telegram_chat_id}
                  onChange={(e) => setClaim({ ...claim, telegram_chat_id: e.target.value })}
                  required
                />
              </label>
              <label>
                {translate('Telegram username (display only)')}
                <input
                  className="input"
                  value={claim.telegram_username}
                  onChange={(e) => setClaim({ ...claim, telegram_username: e.target.value })}
                />
              </label>
              {error ? <p className="form-error">{translate(error)}</p> : null}
              {notice ? <p className="form-success">{translate(notice)}</p> : null}
              <button className="primary-btn" disabled={busy}>
                {translate('Verify one-time link')}
              </button>
            </form>
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
          <button className="ghost-btn" onClick={() => void load()} disabled={busy}>
            <RefreshCw size={16} /> {translate('Refresh')}
          </button>
          <button className="ghost-btn" onClick={() => void onSignOut()}>
            <LogOut size={16} /> {translate('Sign out')}
          </button>
        </div>
        <section className="market-hero">
          <div className="market-copy">
            <div className="market-eyebrow">
              <ShieldCheck size={14} /> {translate('Consent-based family access')}
            </div>
            <h1>{child?.student.name}</h1>
            <p>
              {label(child?.relationship_type)} ·{' '}
              {translate(child?.is_primary_contact ? 'Primary contact' : 'Authorized contact')}{' '}
            </p>
            <label className="parent-child-switcher">
            <span>{translate('Choose your child')}</span>
            <select className="input" value={childIndex} onChange={(e) => { setChildIndex(Number(e.target.value)); setTab('overview'); }}>
              {data.children.map((item, index) => (
                <option key={item.relationship_id} value={index}>
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
                  {child?.permissions.schedule && upcoming[0]
                    ? formatLocaleDateTime(String(upcoming[0].starts_at))
                    : translate('Not shared')}
                </span>
              </article>
              <article>
                <CreditCard size={18} />
                <strong>{translate('Balance')}</strong>
                <span>
                  {child?.permissions.payments
                    ? money(child.balances[0]?.balance, String(child.balances[0]?.currency ?? 'UZS'))
                    : translate('Not shared')}
                </span>
              </article>
              <article>
                <BellRing size={18} />
                <strong>{translate('Updates')}</strong>
                <span>
                  {data.notifications.length} {translate('authorized notifications')}
                </span>
              </article>
            </div>
          </div>
        </section>
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
                    <p>{String(item.feedback ?? label(item.status))}</p>
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
          </section>
        ) : null}
        {tab === 'schedule' ? (
          <section className="market-card">
            <h2>{translate('Lesson schedule')}</h2>
            <div className="record-list">
              {upcoming.map((item) => (
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
            <h2>{translate('Payments and debt')}</h2>
            <p className="muted">
              {translate(
                'Only account-facing charges and balances are shown. Provider reconciliation evidence remains private.',
              )}
            </p>
            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>{translate('Charge')}</th>
                    <th>{translate('Due')}</th>
                    <th>{translate('Amount')}</th>
                    <th>{translate('Outstanding')}</th>
                    <th>{translate('Status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {child?.charges.map((item) => (
                    <tr key={String(item.id)}>
                      <td>{String(item.charge_number)}</td>
                      <td>{String(item.due_on)}</td>
                      <td>{money(item.effective_amount, String(item.currency))}</td>
                      <td>{money(item.outstanding_amount, String(item.currency))}</td>
                      <td>{label(item.calculated_status)}</td>
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
                    () =>
                      teacherStudioGuardianSendMessage({
                        relationship_id: child.relationship_id,
                        body: message,
                      }),
                    'Message sent to the academy.',
                  );
                  setMessage('');
                }}
              >
                <h2>{translate('Message academy')}</h2>
                <textarea className="input" value={message} onChange={(e) => setMessage(e.target.value)} required />
                <button className="primary-btn" disabled={busy}>
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
                  await teacherStudioCreateGuardianServiceRequest({
                    academy_id: child.academy_id,
                    relationship_id: child.relationship_id,
                    ...requestForm,
                  });
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
              <button className="primary-btn" disabled={busy}>
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
                  disabled={busy || !privateReport.title || !privateReport.description}
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
                void run(
                  () =>
                    teacherStudioGuardianUpdatePreferences({
                      guardian_id: guardianId,
                      ...preference,
                    }),
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
              <button className="primary-btn" disabled={busy}>
                {translate('Save preferences')}
              </button>
            </form>
            <article className="market-card">
              <h2>{translate('Notification history')}</h2>
              <div className="record-list">
                {data.notifications.map((item) => (
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
