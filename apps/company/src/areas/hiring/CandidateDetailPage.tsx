// One candidate (/w/:org/candidates/:candidate): stage, benchmark against the role, ready
// messages, interview kit, feedback report to share, notes timeline and deleting their data.
import React, { useEffect, useState, type FormEvent } from 'react';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link, navigate } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { BenchmarkTable, MessageBox, STAGES, StageBadge, TrackBadge, VerdictBadge } from './AtsUi.tsx';
import { recallInvite, rememberInvite, telegramShare } from './candidates.ts';
import { candidateName } from './PipelinePanel.tsx';
import type { AllCandidates, CandidateDetail, InterviewKit, NoteRow, ShareLink, Stage } from './types.ts';
import { CopyButton, LevelBadge, skillText, useFormat, useHiringError, useLoad } from './ui.tsx';

const LOCALES = ['ru', 'uz', 'en'] as const;
type MessageLocale = (typeof LOCALES)[number];
const KINDS = ['invite', 'reminder', 'interview', 'offer', 'rejection', 'feedback'] as const;
type Kind = (typeof KINDS)[number];
const startLocale = (locale: string): MessageLocale => locale === 'en' || locale === 'uz' ? locale : 'ru';

export function CandidateDetailPage({ candidateId }: { candidateId: string }) {
  const t = useAppT(), problem = useHiringError(), format = useFormat();
  const { org } = useWorkspace();
  const { data, error, setData, reload } = useLoad(() => api<CandidateDetail>(`orgs/${org.id}/candidates/${candidateId}`), [org.id, candidateId]);
  const [busy, setBusy] = useState(false), [actionError, setActionError] = useState(''), [notice, setNotice] = useState('');
  const [erasing, setErasing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [feedbackLink, setFeedbackLink] = useState<string | null>(null);

  if (error) return <section><p className="error" role="alert">{error}</p><p><Link to={`/w/${org.id}/hiring`}>{t('hiring.detail.back')}</Link></p></section>;
  if (!data) return <p role="status">{t('app.loading')}</p>;
  const { candidate, assessment } = data;
  const erased = Boolean(candidate.anonymised_at);
  const backTo = `/w/${org.id}/hiring/${assessment.id}`;

  async function run(work: () => Promise<void>) {
    setBusy(true); setActionError(''); setNotice('');
    try {
      await work();
    } catch (cause) {
      setActionError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  const moveStage = (stage: Stage) => run(async () => {
    await api(`orgs/${org.id}/candidates/${candidate.id}`, { method: 'PATCH', body: { stage } });
    await reload();
  });
  const erase = () => run(async () => {
    await api(`orgs/${org.id}/candidates/${candidate.id}/erase`, { method: 'POST' });
    setErasing(false);
    setNotice(t('hiring.ats.erasedOne'));
    await reload();
  });

  return <div className="hiring-stack">
    <p className="no-print"><Link to={backTo}>← {assessment.title}</Link></p>
    <section className="hiring-report-head" aria-labelledby="candidate-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{assessment.title}</p>
          <h1 id="candidate-title">{candidateName(t, candidate)}</h1>
          <p className="hiring-card-meta">
            <StageBadge stage={candidate.stage}/>
            <TrackBadge track={candidate.track}/>
            <VerdictBadge verdict={candidate.benchmark.verdict}/>
            {candidate.email && <a href={`mailto:${candidate.email}`}>{candidate.email}</a>}
            {candidate.phone && <a href={`tel:${candidate.phone.replace(/[^+\d]/g, '')}`}>{candidate.phone}</a>}
          </p>
        </div>
        {candidate.attempt_id && (candidate.status === 'graded' || candidate.status === 'submitted') && <Link className="button-link quiet no-print" to={`/w/${org.id}/hiring/${assessment.id}/${candidate.attempt_id}`}>{t('hiring.ats.fullReport')}</Link>}
      </div>
      {erased && <p className="notice" role="status">{t('hiring.ats.erasedNote', { date: format.date(candidate.anonymised_at) })}</p>}
      {!erased && <>
        <ol className="hiring-steps no-print">{STAGES.map((stage) => <li key={stage}>
          <button type="button" className={candidate.stage === stage ? '' : 'quiet'} aria-pressed={candidate.stage === stage} disabled={busy} onClick={() => { if (candidate.stage !== stage) void moveStage(stage); }}>{t(`hiring.stage.${stage}` as AppKey)}</button>
        </li>)}</ol>
        <TrackingLine candidate={candidate}/>
        {editing ? <ContactForm candidate={candidate} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); void reload(); }}/>
          : <button type="button" className="quiet hiring-small no-print" onClick={() => setEditing(true)}>{t('hiring.ats.editContact')}</button>}
      </>}
    </section>
    {notice && <p className="notice" role="status">{notice}</p>}
    {actionError && <p className="error" role="alert">{actionError}</p>}

    {candidate.track !== 'invited' && candidate.track !== 'opened' && <section aria-labelledby="benchmark-title">
      <h2 id="benchmark-title">{t('hiring.ats.benchmark')}</h2>
      <BenchmarkTable benchmark={candidate.benchmark}/>
      <p className="hint">{t('hiring.report.estimateNote')}</p>
    </section>}

    {data.other_applications.length > 0 && <section aria-labelledby="others-title">
      <h2 id="others-title">{t('hiring.ats.otherApplications')}</h2>
      <ul className="hiring-problems">{data.other_applications.map((row) => <li key={row.id}><Link to={`/w/${org.id}/candidates/${row.id}`}>{row.test_title}</Link> · {format.date(row.created_at)} · <StageBadge stage={row.stage}/> {row.overall_level && <LevelBadge level={row.overall_level} short/>}</li>)}</ul>
    </section>}

    {!erased && <MessagesSection key={`messages-${candidate.id}`} candidateId={candidate.id} email={candidate.email} finished={candidate.track === 'graded' || candidate.track === 'finished'} feedbackLink={feedbackLink} onUsed={() => void reload()}/>}
    {!erased && <KitSection candidateId={candidate.id} kit={data.interview_kit} onKit={(kit) => setData({ ...data, interview_kit: kit })} disabled={candidate.status !== 'graded'}/>}
    {!erased && candidate.status === 'graded' && <FeedbackShare candidateId={candidate.id} name={candidate.name} onCreated={setFeedbackLink}/>}
    <Timeline candidateId={candidate.id} notes={data.notes} erased={erased} onChange={(notes) => setData({ ...data, notes })}/>

    {!erased && <div className="no-print hiring-danger">
      {erasing ? <div className="hiring-confirm" role="alertdialog" aria-labelledby="erase-text">
        <p id="erase-text">{t('hiring.ats.eraseConfirm')}</p>
        <div className="company-actions">
          <button type="button" className="hiring-danger-button" disabled={busy} onClick={() => void erase()}>{t('hiring.ats.erase')}</button>
          <button type="button" className="quiet" onClick={() => setErasing(false)}>{t('common.cancel')}</button>
        </div>
      </div> : <button type="button" className="quiet hiring-small" onClick={() => setErasing(true)}>{t('hiring.ats.erase')}</button>}
    </div>}
    {erased && <p className="no-print"><button type="button" className="quiet hiring-small" onClick={() => navigate(backTo)}>{t('common.back')}</button></p>}
  </div>;
}

function TrackingLine({ candidate }: { candidate: CandidateDetail['candidate'] }) {
  const t = useAppT(), format = useFormat();
  const steps: [AppKey, string | null][] = [['hiring.track.invited', candidate.invited_at], ['hiring.track.opened', candidate.opened_at], ['hiring.track.started', candidate.started_at], ['hiring.track.finished', candidate.submitted_at]];
  return <ul className="hiring-tracking">{steps.filter(([, at]) => at).map(([label, at]) => <li key={label}><strong>{t(label)}</strong> <span className="hiring-muted">{format.dateTime(at)}</span></li>)}
    {candidate.minutes !== null && <li><strong>{t('hiring.ats.timeTaken')}</strong> <span className="hiring-muted">{t('common.minutes', { count: candidate.minutes })}</span></li>}
    {candidate.reminders > 0 && <li><strong>{t('hiring.ats.reminders', { count: candidate.reminders })}</strong> <span className="hiring-muted">{format.dateTime(candidate.reminded_at)}</span></li>}
  </ul>;
}

function ContactForm({ candidate, onCancel, onSaved }: { candidate: CandidateDetail['candidate']; onCancel: () => void; onSaved: () => void }) {
  const t = useAppT(), problem = useHiringError();
  const { org } = useWorkspace();
  const [form, setForm] = useState({ name: candidate.name ?? '', email: candidate.email ?? '', phone: candidate.phone ?? '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await api(`orgs/${org.id}/candidates/${candidate.id}`, { method: 'PATCH', body: form });
      onSaved();
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  return <form onSubmit={submit} className="hiring-form hiring-subpanel">
    <div className="hiring-form-row">
      <label>{t('hiring.candidate.name')}<input required minLength={2} maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></label>
      <label>{t('hiring.candidate.email')}<input type="email" maxLength={200} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })}/></label>
      <label>{t('hiring.candidate.phone')}<input type="tel" maxLength={40} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })}/></label>
    </div>
    <div className="company-actions">
      <button disabled={busy}>{t('common.save')}</button>
      <button type="button" className="quiet" onClick={onCancel}>{t('common.cancel')}</button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
  </form>;
}

function MessagesSection({ candidateId, email, finished, feedbackLink, onUsed }: { candidateId: string; email: string | null; finished: boolean; feedbackLink: string | null; onUsed: () => void }) {
  const t = useAppT(), problem = useHiringError();
  const { locale } = useI18n();
  const { org } = useWorkspace();
  const [kind, setKind] = useState<Kind>(finished ? 'interview' : 'reminder');
  const [language, setLanguage] = useState<MessageLocale>(startLocale(locale));
  const [link, setLink] = useState<string | null>(() => recallInvite(candidateId));
  const [shareLink, setShareLink] = useState('');
  const [message, setMessage] = useState<{ subject: string; text: string; needs_link: boolean } | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const usesInvite = kind === 'invite' || kind === 'reminder';
  const usedLink = usesInvite ? link : kind === 'feedback' ? shareLink || null : null;
  // Someone who finished needs no invitation; someone who did not has no feedback yet.
  const kinds = KINDS.filter((entry) => finished ? entry !== 'invite' && entry !== 'reminder' : entry !== 'feedback');
  useEffect(() => {
    if (feedbackLink) { setShareLink(feedbackLink); setKind('feedback'); }
  }, [feedbackLink]);

  useEffect(() => {
    let live = true;
    void api<{ subject: string; text: string; needs_link: boolean }>(`orgs/${org.id}/candidates/${candidateId}/message`, { method: 'POST', body: { kind, locale: language, link: usedLink } })
      .then((value) => { if (live) { setMessage(value); setError(''); } })
      .catch((cause) => { if (live) setError(problem(cause)); });
    return () => { live = false; };
  }, [org.id, candidateId, kind, language, usedLink]); // eslint-disable-line react-hooks/exhaustive-deps

  async function newLink() {
    setBusy(true); setError('');
    try {
      const response = await api<{ link: string }>(`orgs/${org.id}/candidates/${candidateId}/link`, { method: 'POST' });
      rememberInvite(candidateId, response.link);
      setLink(response.link);
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  const mark = () => {
    void api(`orgs/${org.id}/candidates/${candidateId}/message`, { method: 'POST', body: { kind, locale: language, link: usedLink, mark: true } }).then(onUsed).catch(() => undefined);
  };
  return <section aria-labelledby="messages-title" className="no-print">
    <h2 id="messages-title">{t('hiring.ats.messagesTitle')}</h2>
    <div className="hiring-form-row">
      <label>{t('hiring.ats.messageKind')}<select value={kind} onChange={(event) => setKind(event.target.value as Kind)}>
        {kinds.map((entry) => <option key={entry} value={entry}>{t(`hiring.message.${entry}` as AppKey)}</option>)}
      </select></label>
      <label>{t('hiring.ats.messageLanguage')}<select value={language} onChange={(event) => setLanguage(event.target.value as MessageLocale)}>
        {LOCALES.map((entry) => <option key={entry} value={entry}>{t(`hiring.language.${entry}` as AppKey)}</option>)}
      </select></label>
      {kind === 'feedback' && <label>{t('hiring.ats.feedbackLink')}<input type="url" value={shareLink} placeholder="https://" onChange={(event) => setShareLink(event.target.value.trim())}/></label>}
    </div>
    {usesInvite && !link && <div className="hiring-confirm">
      <p>{t('hiring.ats.noLinkHere')}</p>
      <div className="company-actions"><button type="button" className="hiring-small" disabled={busy} onClick={() => void newLink()}>{t('hiring.ats.makeLink')}</button></div>
    </div>}
    {error && <p className="error" role="alert">{error}</p>}
    {message && <MessageBox subject={message.subject} text={message.text} link={usedLink} email={email} onUsed={mark}/>}
  </section>;
}

function KitSection({ candidateId, kit, onKit, disabled }: { candidateId: string; kit: InterviewKit | null; onKit: (kit: InterviewKit) => void; disabled: boolean }) {
  const t = useAppT(), problem = useHiringError(), format = useFormat();
  const { locale } = useI18n();
  const { org } = useWorkspace();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  const [ratings, setRatings] = useState<Record<string, number>>(kit?.ratings ?? {});
  const [summary, setSummary] = useState(kit?.summary ?? '');
  const scored = Object.keys(kit?.ratings ?? {}).length > 0;
  const scores = Object.values(ratings);
  const average = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length * 10) / 10 : null;
  async function saveScores(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setSaved(false);
    try {
      const response = await api<{ kit: InterviewKit }>(`orgs/${org.id}/candidates/${candidateId}/interview-kit`, { method: 'PATCH', body: { ratings, summary } });
      onKit(response.kit);
      setSaved(true);
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  async function generate(fresh: boolean) {
    setBusy(true); setError('');
    try {
      const response = await api<{ kit: InterviewKit }>(`orgs/${org.id}/candidates/${candidateId}/interview-kit`, { method: 'POST', body: { locale, fresh }, timeoutMs: 90_000 });
      onKit(response.kit);
      setRatings(response.kit.ratings ?? {});
      setSummary(response.kit.summary ?? '');
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  return <section aria-labelledby="kit-title" className="hiring-kit">
    <div className="page-heading">
      <h2 id="kit-title">{t('hiring.kit.title')}</h2>
      <div className="company-actions no-print">
        {kit ? <>
          {!scored && <button type="button" className="quiet hiring-small" disabled={busy} onClick={() => void generate(true)}>{busy ? t('hiring.run.working') : t('hiring.kit.again')}</button>}
          <button type="button" className="quiet hiring-small" onClick={() => print()}>{t('common.print')}</button>
        </> : <button type="button" disabled={busy || disabled} onClick={() => void generate(false)}>{busy ? t('hiring.run.working') : t('hiring.kit.generate')}</button>}
      </div>
    </div>
    {!kit && <p className="hint">{disabled ? t('hiring.kit.needsResult') : t('hiring.kit.lead')}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {kit && <>
      <p className="hint">
        {kit.source === 'ai' ? t('hiring.kit.fromAi', { date: format.date(kit.created_at) }) : kit.reason === 'ai_limit' ? t('hiring.kit.fromBankLimit') : kit.reason === 'ai_unavailable' ? t('hiring.kit.fromBankOff') : t('hiring.kit.fromBank')}
        {kit.weak.length > 0 && ` ${t('hiring.kit.focus', { skills: kit.weak.map((skill) => skillText(t, skill)).join(', ') })}`}
      </p>
      <ol className="hiring-kit-list">{kit.questions.map((question, index) => <li key={index}>
        <span className="company-badge">{question.skill === 'role' ? t('hiring.kit.fromJob') : skillText(t, question.skill)}</span>
        <p className="hiring-kit-q">{question.question}</p>
        {question.follow_up && <p className="hiring-muted">{t('hiring.kit.followUp')}: {question.follow_up}</p>}
        {question.listen_for && <p className="hiring-muted">{t('hiring.kit.listenFor')}: {question.listen_for}</p>}
        <fieldset className="hiring-score">
          <legend>{t('hiring.kit.scoreLabel')}</legend>
          {[1, 2, 3, 4, 5].map((value) => <label key={value} className="check"><input type="radio" name={`kit-${candidateId}-${index}`} checked={ratings[String(index)] === value} onChange={() => { setRatings({ ...ratings, [String(index)]: value }); setSaved(false); }}/> {value}</label>)}
        </fieldset>
      </li>)}</ol>
      <form onSubmit={saveScores} className="hiring-notes">
        <label>{t('hiring.kit.summary')}<textarea rows={3} maxLength={2000} value={summary} onChange={(event) => { setSummary(event.target.value); setSaved(false); }}/></label>
        <div className="company-actions">
          <button className="no-print" disabled={busy}>{t('hiring.kit.saveScores')}</button>
          {average !== null && <strong>{t('hiring.kit.average', { score: average })}</strong>}
          {saved && <span role="status" className="hiring-muted">{t('common.saved')}</span>}
        </div>
      </form>
    </>}
  </section>;
}

function FeedbackShare({ candidateId, name, onCreated }: { candidateId: string; name: string | null; onCreated: (link: string) => void }) {
  const t = useAppT(), problem = useHiringError(), format = useFormat();
  const { org } = useWorkspace();
  const { data, reload } = useLoad(() => api<{ shares: ShareLink[] }>(`orgs/${org.id}/candidates/${candidateId}/shares`), [org.id, candidateId]);
  const [includeFeedback, setIncludeFeedback] = useState(true);
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function create() {
    setBusy(true); setError('');
    try {
      const response = await api<{ link: string }>(`orgs/${org.id}/candidates/${candidateId}/shares`, { method: 'POST', body: { include_feedback: includeFeedback } });
      setCreated(response.link);
      onCreated(response.link);
      await reload();
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true); setError('');
    try {
      await api(`orgs/${org.id}/shares/${id}`, { method: 'DELETE' });
      await reload();
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  const active = (data?.shares ?? []).filter((share) => share.active);
  return <section aria-labelledby="feedback-title" className="no-print">
    <h2 id="feedback-title">{t('hiring.ats.feedbackTitle')}</h2>
    <p className="hint">{t('hiring.ats.feedbackLead')}</p>
    <label className="check"><input type="checkbox" checked={includeFeedback} onChange={(event) => setIncludeFeedback(event.target.checked)}/> {t('hiring.ats.feedbackInclude')}</label>
    <div className="company-actions"><button type="button" className="quiet" disabled={busy} onClick={() => void create()}>{t('hiring.ats.feedbackCreate')}</button></div>
    {created && <div className="hiring-link-row">
      <label className="hiring-link-field"><span className="visually-hidden">{t('hiring.ats.feedbackLink')}</span><input readOnly value={created} onFocus={(event) => event.target.select()}/></label>
      <CopyButton text={created}/>
      <a className="button-link quiet" href={telegramShare(created, name ?? '')} target="_blank" rel="noopener noreferrer">{t('hiring.link.telegram')}</a>
    </div>}
    {error && <p className="error" role="alert">{error}</p>}
    {active.length > 0 && <ul className="hiring-problems">{active.map((share) => <li key={share.id}>
      {t('hiring.share.activeUntil', { date: format.date(share.expires_at), count: share.opens })}{' '}
      <button type="button" className="quiet hiring-small" disabled={busy} onClick={() => void revoke(share.id)}>{t('hiring.share.revoke')}</button>
    </li>)}</ul>}
  </section>;
}

function Timeline({ candidateId, notes, erased, onChange }: { candidateId: string; notes: NoteRow[]; erased: boolean; onChange: (notes: NoteRow[]) => void }) {
  const t = useAppT(), problem = useHiringError(), format = useFormat();
  const { org, member } = useWorkspace();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function add(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true); setError('');
    try {
      const response = await api<{ note: NoteRow }>(`orgs/${org.id}/candidates/${candidateId}/notes`, { method: 'POST', body: { body } });
      onChange([response.note, ...notes]);
      setBody('');
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true); setError('');
    try {
      await api(`orgs/${org.id}/candidates/${candidateId}/notes/${id}`, { method: 'DELETE' });
      onChange(notes.filter((note) => note.id !== id));
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  const line = (note: NoteRow) => {
    if (note.kind === 'stage') return t('hiring.timeline.stage', { from: t(`hiring.stage.${String(note.details.from)}` as AppKey), to: t(`hiring.stage.${String(note.details.to)}` as AppKey) });
    if (note.kind === 'message') return t('hiring.timeline.message', { kind: t(`hiring.message.${String(note.details.kind)}` as AppKey) });
    if (note.kind === 'system' && note.details.kind === 'interview_score') return note.details.average === null ? t('hiring.timeline.scoreCleared') : t('hiring.timeline.scored', { score: Number(note.details.average) });
    return note.body ?? '';
  };
  return <section aria-labelledby="timeline-title">
    <h2 id="timeline-title">{t('hiring.timeline.title')}</h2>
    {!erased && <form onSubmit={add} className="hiring-notes no-print">
      <label>{t('hiring.timeline.add')}<textarea rows={3} maxLength={4000} value={body} onChange={(event) => setBody(event.target.value)}/></label>
      <div className="company-actions"><button disabled={busy || !body.trim()}>{t('hiring.timeline.save')}</button></div>
    </form>}
    {error && <p className="error" role="alert">{error}</p>}
    {notes.length === 0 ? <p className="hint">{t('hiring.timeline.empty')}</p> : <ol className="hiring-timeline">{notes.map((note) => <li key={note.id} className={note.kind === 'note' ? 'note' : 'event'}>
      <p className="hiring-timeline-meta"><strong>{note.author_name ?? t('hiring.timeline.teamMember')}</strong> <span className="hiring-muted">{format.dateTime(note.created_at)}</span>
        {note.kind === 'note' && (note.mine || member?.role === 'owner') && <button type="button" className="quiet hiring-small no-print" disabled={busy} onClick={() => void remove(note.id)}>{t('common.delete')}</button>}
      </p>
      <p className="hiring-timeline-body">{line(note)}</p>
    </li>)}</ol>}
  </section>;
}

/** Every candidate across the company's hiring tests. */
export function AllCandidatesPage() {
  const t = useAppT(), format = useFormat();
  const { org } = useWorkspace();
  const [search, setSearch] = useState('');
  const [typed, setTyped] = useState('');
  const [stage, setStage] = useState<Stage | ''>('');
  const [test, setTest] = useState('');
  const query = new URLSearchParams({ ...(search ? { search } : {}), ...(stage ? { stage } : {}), ...(test ? { assessment: test } : {}) }).toString();
  const { data, error } = useLoad(() => api<AllCandidates>(`orgs/${org.id}/candidates${query ? `?${query}` : ''}`, { timeoutMs: 60_000 }), [org.id, query]);
  return <div className="hiring-stack">
    <div className="page-heading"><div><h1>{t('hiring.all.title')}</h1><p>{t('hiring.all.lead')}</p></div></div>
    {data && <div className="hiring-stage-tiles" role="group" aria-label={t('hiring.all.byStage')}>
      {STAGES.map((entry) => <button key={entry} type="button" className={stage === entry ? '' : 'quiet'} aria-pressed={stage === entry} onClick={() => setStage(stage === entry ? '' : entry)}>
        {t(`hiring.stage.${entry}` as AppKey)} <strong>{data.counts[entry] ?? 0}</strong>
      </button>)}
    </div>}
    <form className="company-toolbar" onSubmit={(event) => { event.preventDefault(); setSearch(typed.trim()); }}>
      <label>{t('hiring.filter.search')}<input type="search" value={typed} onChange={(event) => setTyped(event.target.value)} onBlur={() => setSearch(typed.trim())}/></label>
      {data && <label>{t('hiring.all.test')}<select value={test} onChange={(event) => setTest(event.target.value)}>
        <option value="">{t('hiring.filter.any')}</option>
        {data.tests.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
      </select></label>}
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    {!data && !error && <p role="status">{t('app.loading')}</p>}
    {data && (data.candidates.length === 0 ? <p>{t('hiring.detail.noMatch')}</p> : <div className="company-table-wrap">
      <table className="company-table">
        <thead><tr><th>{t('hiring.col.candidate')}</th><th>{t('hiring.all.test')}</th><th>{t('hiring.col.level')}</th><th>{t('hiring.ats.col.stage')}</th><th>{t('hiring.ats.col.activity')}</th></tr></thead>
        <tbody>{data.candidates.map((row) => <tr key={row.id}>
          <td><Link to={`/w/${org.id}/candidates/${row.id}`}><strong>{row.name ?? '—'}</strong></Link><br/><span className="hiring-muted">{[row.email, row.phone].filter(Boolean).join(' · ')}</span></td>
          <td><Link to={`/w/${org.id}/hiring/${row.assessment_id}`}>{row.test_title}</Link></td>
          <td>{row.overall_level ? <><LevelBadge level={row.overall_level} short/> <span className="hiring-muted">{format.score(row.overall_score)}</span><br/><VerdictBadge verdict={row.verdict}/></> : <TrackBadge track={row.track}/>}{row.interview_average !== null && <><br/><span className="hiring-muted">{t('hiring.kit.scoreShort', { score: row.interview_average })}</span></>}</td>
          <td><StageBadge stage={row.stage}/></td>
          <td className="hiring-muted">{format.date(row.submitted_at ?? row.created_at)}</td>
        </tr>)}</tbody>
      </table>
    </div>)}
    {data && data.total > data.candidates.length && <p className="hint">{t('hiring.all.more', { shown: data.candidates.length, total: data.total })}</p>}
  </div>;
}
