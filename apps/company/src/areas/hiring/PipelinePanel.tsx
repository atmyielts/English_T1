// One test's candidates as a working board: kanban and list views, a ranked shortlist against
// the role, bulk actions, invitations and reminders to copy, the funnel, and test health.
import React, { useMemo, useState, type FormEvent } from 'react';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { BenchmarkChips, MessageBox, STAGES, StageBadge, StagePicker, TrackBadge, VerdictBadge } from './AtsUi.tsx';
import { parseCandidates, recallInvite, rememberInvite, telegramShare } from './candidates.ts';
import type { Assessment, BulkMessage, CandidateRow, Funnel, InviteResult, Pipeline, Stage, TestHealth } from './types.ts';
import { CopyButton, LevelBadge, downloadText, shortLevel, skillText, useFormat, useHiringError, useLoad } from './ui.tsx';

const BULK_STEP = 200;
const MESSAGE_LOCALES = ['ru', 'uz', 'en'] as const;
type MessageLocale = (typeof MESSAGE_LOCALES)[number];
const initialLocale = (locale: string): MessageLocale => locale === 'en' || locale === 'uz' ? locale : 'ru';

export const candidateName = (t: ReturnType<typeof useAppT>, row: Pick<CandidateRow, 'name' | 'anonymised_at'>) => row.anonymised_at ? t('hiring.ats.anonymous') : row.name ?? '—';

export function PipelinePanel({ assessment }: { assessment: Assessment }) {
  const t = useAppT(), problem = useHiringError();
  const { org } = useWorkspace();
  const { data, error, setData, reload } = useLoad(() => api<Pipeline>(`orgs/${org.id}/assessments/${assessment.id}/pipeline`, { timeoutMs: 60_000 }), [org.id, assessment.id]);
  const [view, setView] = useState<'board' | 'list' | 'ranking'>('board');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [actionError, setActionError] = useState(''), [notice, setNotice] = useState('');
  const [bulkStage, setBulkStage] = useState<Stage>('reviewing');
  const [mode, setMode] = useState<null | 'messages' | 'erase'>(null);
  const [search, setSearch] = useState('');
  const [hideErased, setHideErased] = useState(true);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.candidates ?? []).filter((row) => (!hideErased || !row.anonymised_at) && (!needle || `${row.name ?? ''} ${row.email ?? ''} ${row.phone ?? ''}`.toLowerCase().includes(needle)));
  }, [data, search, hideErased]);

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!data) return <p role="status">{t('app.loading')}</p>;

  const toggle = (id: string) => setPicked((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  const allShown = rows.length > 0 && rows.every((row) => picked.includes(row.id));

  async function move(id: string, stage: Stage) {
    const before = data!;
    // Shown at once; put back if the server refuses.
    setData({ ...before, candidates: before.candidates.map((row) => row.id === id ? { ...row, stage } : row) });
    setActionError('');
    try {
      await api(`orgs/${org.id}/candidates/${id}`, { method: 'PATCH', body: { stage } });
      void reload();
    } catch (cause) {
      setData(before);
      setActionError(problem(cause));
    }
  }

  async function moveBulk() {
    setBusy(true); setActionError(''); setNotice('');
    try {
      let moved = 0;
      for (let from = 0; from < picked.length; from += BULK_STEP) {
        const result = await api<{ moved: number }>(`orgs/${org.id}/candidates/bulk`, { method: 'POST', body: { ids: picked.slice(from, from + BULK_STEP), stage: bulkStage }, timeoutMs: 90_000 });
        moved += result.moved;
      }
      setNotice(t('hiring.ats.bulkMoved', { count: moved }));
      setPicked([]);
      await reload();
    } catch (cause) {
      setActionError(problem(cause));
    } finally {
      setBusy(false);
    }
  }

  async function eraseBulk() {
    setBusy(true); setActionError(''); setNotice('');
    try {
      let erased = 0, running = 0;
      for (let from = 0; from < picked.length; from += BULK_STEP) {
        const result = await api<{ erased: number; running: number }>(`orgs/${org.id}/candidates/bulk/erase`, { method: 'POST', body: { ids: picked.slice(from, from + BULK_STEP) }, timeoutMs: 90_000 });
        erased += result.erased; running += result.running;
      }
      setNotice(running ? t('hiring.ats.erasedSomeRunning', { count: erased, running }) : t('hiring.ats.erasedCount', { count: erased }));
      setPicked([]); setMode(null);
      await reload();
    } catch (cause) {
      setActionError(problem(cause));
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    setBusy(true); setActionError('');
    try {
      const file = await api<{ filename: string; csv: string }>(`orgs/${org.id}/assessments/${assessment.id}/pipeline/export`, { timeoutMs: 60_000 });
      downloadText(file.filename, file.csv);
    } catch (cause) {
      setActionError(problem(cause));
    } finally {
      setBusy(false);
    }
  }

  return <section aria-labelledby="hiring-pipeline-title" className="hiring-pipeline">
    <div className="page-heading">
      <h2 id="hiring-pipeline-title">{t('hiring.ats.pipeline')}</h2>
      <div className="hiring-segment" role="group" aria-label={t('hiring.ats.viewLabel')}>
        {(['board', 'list', 'ranking'] as const).map((entry) => <button key={entry} type="button" className={view === entry ? '' : 'quiet'} aria-pressed={view === entry} onClick={() => setView(entry)}>{t(`hiring.ats.view.${entry}` as AppKey)}</button>)}
      </div>
    </div>
    <div className="company-toolbar no-print">
      <label>{t('hiring.filter.search')}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)}/></label>
      <label className="check"><input type="checkbox" checked={hideErased} onChange={(event) => setHideErased(event.target.checked)}/> {t('hiring.ats.hideErased')}</label>
      <button type="button" className="quiet hiring-small" disabled={!rows.some((row) => row.track === 'invited' || row.track === 'opened')} onClick={() => { setPicked(rows.filter((row) => row.track === 'invited' || row.track === 'opened').map((row) => row.id)); setMode('messages'); }}>{t('hiring.ats.remindUnstarted')}</button>
      <button type="button" className="quiet hiring-small" disabled={busy || !data.candidates.length} onClick={() => void exportCsv()}>{t('hiring.detail.export')}</button>
    </div>
    {notice && <p className="notice" role="status">{notice}</p>}
    {actionError && <p className="error" role="alert">{actionError}</p>}
    {picked.length > 0 && <div className="hiring-bulk no-print" role="group" aria-label={t('hiring.ats.bulkLabel')}>
      <strong>{t('hiring.ats.selected', { count: picked.length })}</strong>
      <label>{t('hiring.ats.moveTo')}<select value={bulkStage} onChange={(event) => setBulkStage(event.target.value as Stage)}>
        {STAGES.map((stage) => <option key={stage} value={stage}>{t(`hiring.stage.${stage}` as AppKey)}</option>)}
      </select></label>
      <button type="button" className="hiring-small" disabled={busy} onClick={() => void moveBulk()}>{t('hiring.ats.apply')}</button>
      <button type="button" className="quiet hiring-small" onClick={() => setMode('messages')}>{t('hiring.ats.prepareMessages')}</button>
      <button type="button" className="quiet hiring-small" onClick={() => setMode('erase')}>{t('hiring.ats.erase')}</button>
      <button type="button" className="quiet hiring-small" onClick={() => { setPicked([]); setMode(null); }}>{t('hiring.compare.clear')}</button>
    </div>}
    {mode === 'erase' && <div className="hiring-confirm" role="alertdialog" aria-labelledby="hiring-bulk-erase">
      <p id="hiring-bulk-erase">{t('hiring.ats.eraseBulkConfirm', { count: picked.length })}</p>
      <div className="company-actions">
        <button type="button" className="hiring-danger-button" disabled={busy} onClick={() => void eraseBulk()}>{t('hiring.ats.erase')}</button>
        <button type="button" className="quiet" onClick={() => setMode(null)}>{t('common.cancel')}</button>
      </div>
    </div>}
    {mode === 'messages' && picked.length > 0 && <BulkMessages ids={picked} onClose={() => { setMode(null); void reload(); }}/>}

    {data.candidates.length === 0 ? <p>{t('hiring.ats.noCandidates')}</p> : rows.length === 0 ? <p>{t('hiring.detail.noMatch')}</p>
      : view === 'board' ? <Board rows={rows} picked={picked} toggle={toggle} move={move}/>
      : view === 'list' ? <ListView rows={rows} picked={picked} toggle={toggle} allShown={allShown} toggleAll={() => setPicked(allShown ? [] : rows.map((row) => row.id))} move={move}/>
      : <Ranking rows={rows} assessment={assessment}/>}
    <button type="button" className="quiet hiring-small no-print" onClick={() => void reload()}>{t('hiring.ats.refresh')}</button>
  </section>;
}

function Board({ rows, picked, toggle, move }: { rows: CandidateRow[]; picked: string[]; toggle: (id: string) => void; move: (id: string, stage: Stage) => Promise<void> }) {
  const t = useAppT(), format = useFormat();
  const { org } = useWorkspace();
  const [over, setOver] = useState<Stage | null>(null);
  return <div className="hiring-board" tabIndex={0} role="region" aria-label={t('hiring.ats.view.board')}>
    {STAGES.map((stage) => {
      const inStage = rows.filter((row) => row.stage === stage);
      return <div key={stage} className={`hiring-column${over === stage ? ' over' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setOver(stage); }} onDragLeave={() => setOver((current) => current === stage ? null : current)}
        onDrop={(event) => { event.preventDefault(); setOver(null); const id = event.dataTransfer.getData('text/plain'); const row = rows.find((entry) => entry.id === id); if (row && row.stage !== stage && !row.anonymised_at) void move(id, stage); }}>
        <h3><span>{t(`hiring.stage.${stage}` as AppKey)}</span> <span className="hiring-column-count">{inStage.length}</span></h3>
        <ul>
          {inStage.map((row) => <li key={row.id} className="hiring-kard" draggable={!row.anonymised_at} onDragStart={(event) => { event.dataTransfer.setData('text/plain', row.id); event.dataTransfer.effectAllowed = 'move'; }}>
            <div className="hiring-kard-top">
              <input type="checkbox" aria-label={t('hiring.compare.pick', { name: candidateName(t, row) })} checked={picked.includes(row.id)} onChange={() => toggle(row.id)}/>
              <Link to={`/w/${org.id}/candidates/${row.id}`}><strong>{candidateName(t, row)}</strong></Link>
            </div>
            <div className="hiring-kard-meta">
              {row.overall_level ? <LevelBadge level={row.overall_level} short/> : <TrackBadge track={row.track}/>}
              <VerdictBadge verdict={row.benchmark.verdict === 'pending' ? 'none' : row.benchmark.verdict}/>
              {row.overall_score !== null && <span className="hiring-muted">{format.score(row.overall_score)}</span>}
              {row.interview_average !== null && <span className="hiring-muted">{t('hiring.kit.scoreShort', { score: row.interview_average })}</span>}
              {row.notes_count > 0 && <span className="hiring-muted">{t('hiring.ats.notesCount', { count: row.notes_count })}</span>}
              {row.flags.some((flag) => flag.severity === 'warn') && <span className="company-badge warn">{t('hiring.detail.flagCount', { count: row.flags.length })}</span>}
            </div>
            {!row.anonymised_at && <StagePicker stage={row.stage} label={t('hiring.ats.moveName', { name: candidateName(t, row) })} onChange={(next) => void move(row.id, next)}/>}
          </li>)}
        </ul>
      </div>;
    })}
  </div>;
}

function ListView({ rows, picked, toggle, allShown, toggleAll, move }: { rows: CandidateRow[]; picked: string[]; toggle: (id: string) => void; allShown: boolean; toggleAll: () => void; move: (id: string, stage: Stage) => Promise<void> }) {
  const t = useAppT(), format = useFormat();
  const { org } = useWorkspace();
  return <div className="company-table-wrap">
    <table className="company-table hiring-table">
      <thead><tr>
        <th className="no-print"><input type="checkbox" aria-label={t('hiring.ats.selectAll')} checked={allShown} onChange={toggleAll}/></th>
        <th>{t('hiring.col.candidate')}</th><th>{t('hiring.ats.col.tracking')}</th><th>{t('hiring.col.level')}</th><th>{t('hiring.ats.col.stage')}</th><th>{t('hiring.ats.col.activity')}</th>
      </tr></thead>
      <tbody>
        {rows.map((row) => <tr key={row.id}>
          <td className="no-print"><input type="checkbox" aria-label={t('hiring.compare.pick', { name: candidateName(t, row) })} checked={picked.includes(row.id)} onChange={() => toggle(row.id)}/></td>
          <td><Link to={`/w/${org.id}/candidates/${row.id}`}><strong>{candidateName(t, row)}</strong></Link><br/><span className="hiring-muted">{[row.email, row.phone].filter(Boolean).join(' · ')}</span></td>
          <td><TrackBadge track={row.track}/>{row.reminders > 0 && <><br/><span className="hiring-muted">{t('hiring.ats.reminders', { count: row.reminders })}</span></>}</td>
          <td>{row.overall_level ? <><LevelBadge level={row.overall_level} short/> <span className="hiring-muted">{format.score(row.overall_score)}</span></> : <span className="hiring-muted">—</span>}<br/><VerdictBadge verdict={row.benchmark.verdict === 'pending' ? 'none' : row.benchmark.verdict}/></td>
          <td>{row.anonymised_at ? <StageBadge stage={row.stage}/> : <StagePicker stage={row.stage} label={t('hiring.ats.moveName', { name: candidateName(t, row) })} onChange={(next) => void move(row.id, next)}/>}</td>
          <td className="hiring-muted">{format.date(row.submitted_at ?? row.started_at ?? row.opened_at ?? row.invited_at ?? row.created_at)}{row.minutes !== null && <><br/>{t('common.minutes', { count: row.minutes })}</>}</td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}

function Ranking({ rows, assessment }: { rows: CandidateRow[]; assessment: Assessment }) {
  const t = useAppT(), format = useFormat();
  const { org } = useWorkspace();
  const ranked = rows.filter((row) => row.rank !== null);
  const waiting = rows.length - ranked.length;
  const minimums = assessment.settings.skill_minimums ?? {};
  return <>
    <p className="hint">{t('hiring.ats.rankingLead')}</p>
    <p className="hiring-requirement"><strong>{t('hiring.ats.requirement')}:</strong> {assessment.min_level && <span>{t('hiring.list.min', { level: shortLevel(assessment.min_level) })}</span>} {assessment.skills.map((skill) => <span key={skill} className="hiring-chip">{skillText(t, skill)} {minimums[skill] ? shortLevel(minimums[skill]) : '—'}</span>)}</p>
    {ranked.length === 0 ? <p>{t('hiring.ats.noRanked')}</p> : <div className="company-table-wrap">
      <table className="company-table">
        <thead><tr><th>#</th><th>{t('hiring.col.candidate')}</th><th>{t('hiring.ats.result')}</th><th>{t('hiring.col.level')}</th><th>{t('hiring.col.skills')}</th><th>{t('hiring.ats.col.stage')}</th></tr></thead>
        <tbody>{ranked.map((row) => <tr key={row.id}>
          <td>{row.rank}</td>
          <td><Link to={`/w/${org.id}/candidates/${row.id}`}><strong>{candidateName(t, row)}</strong></Link></td>
          <td><VerdictBadge verdict={row.benchmark.verdict}/>{row.benchmark.below > 0 && <><br/><span className="hiring-muted">{t('hiring.ats.belowSkills', { count: row.benchmark.below })}</span></>}</td>
          <td><LevelBadge level={row.overall_level} short/> <span className="hiring-muted">{format.score(row.overall_score)}</span>{row.interview_average !== null && <><br/><span className="hiring-muted">{t('hiring.kit.scoreShort', { score: row.interview_average })}</span></>}</td>
          <td><BenchmarkChips benchmark={row.benchmark}/></td>
          <td><StageBadge stage={row.stage}/></td>
        </tr>)}</tbody>
      </table>
    </div>}
    {waiting > 0 && <p className="hint">{t('hiring.ats.waitingRank', { count: waiting })}</p>}
  </>;
}

function BulkMessages({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const t = useAppT(), problem = useHiringError();
  const { locale } = useI18n();
  const { org } = useWorkspace();
  const [kind, setKind] = useState<'reminder' | 'invite' | 'interview' | 'offer' | 'rejection'>('reminder');
  const [language, setLanguage] = useState<MessageLocale>(initialLocale(locale));
  const [reissue, setReissue] = useState(false);
  const [result, setResult] = useState<{ messages: BulkMessage[]; skipped: number; csv: string | null } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const needsLink = kind === 'reminder' || kind === 'invite';
  async function prepare(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const links = Object.fromEntries(ids.flatMap((id) => { const link = recallInvite(id); return link ? [[id, link]] : []; }));
      const response = await api<{ messages: BulkMessage[]; skipped: number; csv: string | null }>(`orgs/${org.id}/candidates/bulk/messages`, { method: 'POST', body: { ids, kind, locale: language, links, reissue: needsLink && reissue, mark: true }, timeoutMs: 90_000 });
      response.messages.forEach((message) => { if (message.link) rememberInvite(message.id, message.link); });
      setResult(response);
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  return <section className="hiring-subpanel" aria-labelledby="hiring-bulk-messages">
    <div className="page-heading"><h3 id="hiring-bulk-messages">{t('hiring.ats.prepareMessages')}</h3><button type="button" className="quiet hiring-small" onClick={onClose}>{t('common.close')}</button></div>
    <form className="hiring-form-row" onSubmit={prepare}>
      <label>{t('hiring.ats.messageKind')}<select value={kind} onChange={(event) => { setKind(event.target.value as typeof kind); setResult(null); }}>
        {(['reminder', 'invite', 'interview', 'offer', 'rejection'] as const).map((entry) => <option key={entry} value={entry}>{t(`hiring.message.${entry}` as AppKey)}</option>)}
      </select></label>
      <label>{t('hiring.ats.messageLanguage')}<select value={language} onChange={(event) => { setLanguage(event.target.value as MessageLocale); setResult(null); }}>
        {MESSAGE_LOCALES.map((entry) => <option key={entry} value={entry}>{t(`hiring.language.${entry}` as AppKey)}</option>)}
      </select></label>
      {needsLink && <label className="check hiring-wide"><input type="checkbox" checked={reissue} onChange={(event) => setReissue(event.target.checked)}/> {t('hiring.ats.reissue')}</label>}
      <div className="company-actions hiring-wide"><button disabled={busy}>{busy ? t('hiring.run.working') : t('hiring.ats.prepare')}</button></div>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    {result && <>
      {result.skipped > 0 && <p className="hint">{t('hiring.ats.skippedFinished', { count: result.skipped })}</p>}
      {result.csv && <div className="company-actions"><button type="button" className="quiet hiring-small" onClick={() => downloadText('schood-messages.csv', result.csv!)}>{t('hiring.ats.downloadCsv')}</button></div>}
      <ul className="hiring-message-list">{result.messages.map((message) => <li key={message.id}>
        <strong>{message.name ?? '—'}</strong> <span className="hiring-muted">{[message.email, message.phone].filter(Boolean).join(' · ')}</span>
        {message.missing_link && <p className="error" role="alert">{t('hiring.ats.missingLink')}</p>}
        <details><summary>{t('hiring.ats.showText')}</summary><MessageBox subject={message.subject} text={message.text} link={message.link} email={message.email}/></details>
      </li>)}</ul>
    </>}
  </section>;
}

/** Bulk candidates: paste or a CSV file, then personal links and texts to copy. */
export function InvitePanel({ assessment }: { assessment: Assessment }) {
  const t = useAppT(), problem = useHiringError();
  const { locale } = useI18n();
  const { org } = useWorkspace();
  const [input, setInput] = useState('');
  const [language, setLanguage] = useState<MessageLocale>(initialLocale(locale));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [result, setResult] = useState<InviteResult | null>(null);
  const parsed = useMemo(() => parseCandidates(input), [input]);
  const closed = assessment.status !== 'open';

  async function file(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    if (chosen.size > 1_000_000) { setError(t('hiring.ats.fileTooLarge')); return; }
    setError('');
    setInput(await chosen.text());
    event.target.value = '';
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setResult(null);
    try {
      const response = await api<InviteResult>(`orgs/${org.id}/assessments/${assessment.id}/candidates`, { method: 'POST', body: { rows: parsed.rows.map(({ name, email, phone }) => ({ name, email, phone })), locale: language }, timeoutMs: 90_000 });
      response.created.forEach((row) => rememberInvite(row.id, row.link));
      setResult(response);
      setInput('');
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  return <section aria-labelledby="hiring-invite-title" className="hiring-subpanel">
    <h2 id="hiring-invite-title">{t('hiring.ats.inviteTitle')}</h2>
    <p className="hint">{t('hiring.ats.inviteLead')}</p>
    {closed && <p className="notice" role="status">{t('hiring.ats.inviteClosed')}</p>}
    <form onSubmit={submit} className="hiring-form">
      <label>{t('hiring.ats.inviteList')}<textarea rows={6} value={input} placeholder={'Aziza Karimova, aziza@mail.uz, +998 90 123 45 67\nJasur Toshev; jasur@gmail.com'} onChange={(event) => setInput(event.target.value)}/></label>
      <div className="hiring-form-row">
        <label>{t('hiring.ats.inviteFile')}<input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(event) => void file(event)}/></label>
        <label>{t('hiring.ats.messageLanguage')}<select value={language} onChange={(event) => setLanguage(event.target.value as MessageLocale)}>
          {MESSAGE_LOCALES.map((entry) => <option key={entry} value={entry}>{t(`hiring.language.${entry}` as AppKey)}</option>)}
        </select></label>
      </div>
      {input.trim() !== '' && <p className="hint" role="status">{t('hiring.ats.parsed', { count: parsed.rows.length })}{parsed.ignored.length > 0 && ` ${t('hiring.ats.ignoredLines', { lines: parsed.ignored.slice(0, 10).join(', ') })}`}</p>}
      <div className="company-actions"><button disabled={busy || closed || !parsed.rows.length}>{busy ? t('hiring.run.working') : t('hiring.ats.inviteAdd', { count: parsed.rows.length })}</button></div>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
    {result && <div className="hiring-stack">
      <p className="notice" role="status">{t('hiring.ats.inviteDone', { count: result.created.length })}</p>
      {result.problems.length > 0 && <div className="hiring-confirm">
        <p>{t('hiring.ats.problemsTitle', { count: result.problems.length })}</p>
        <ul className="hiring-problems">{result.problems.map((row) => <li key={row.row}>{t('hiring.ats.problemRow', { row: row.row, name: row.name || row.email || '—' })}: {t(`hiring.ats.problem.${row.reason}` as AppKey)}</li>)}</ul>
      </div>}
      {result.created.length > 0 && <>
        <p className="hint">{t('hiring.ats.linksOnce')}</p>
        <div className="company-actions">{result.csv && <button type="button" className="quiet hiring-small" onClick={() => downloadText('schood-candidate-links.csv', result.csv!)}>{t('hiring.ats.downloadCsv')}</button>}</div>
        <ul className="hiring-message-list">{result.created.map((row) => <li key={row.id}>
          <strong>{row.name}</strong> <span className="hiring-muted">{[row.email, row.phone].filter(Boolean).join(' · ')}</span>
          <div className="company-actions">
            <CopyButton text={row.link} label={t('hiring.ats.copyLink')}/>
            <CopyButton text={row.text} label={t('hiring.ats.copyText')}/>
            <a className="button-link quiet" href={telegramShare(row.link, row.text)} target="_blank" rel="noopener noreferrer">{t('hiring.link.telegram')}</a>
          </div>
        </li>)}</ul>
      </>}
    </div>}
  </section>;
}

const STEPS: { key: keyof Funnel; label: AppKey }[] = [
  { key: 'candidates', label: 'hiring.funnel.candidates' }, { key: 'opened', label: 'hiring.funnel.opened' }, { key: 'started', label: 'hiring.funnel.started' },
  { key: 'finished', label: 'hiring.funnel.finished' }, { key: 'meets', label: 'hiring.funnel.meets' }, { key: 'reviewing', label: 'hiring.funnel.reviewing' },
  { key: 'interview', label: 'hiring.funnel.interview' }, { key: 'offer', label: 'hiring.funnel.offer' }, { key: 'hired', label: 'hiring.funnel.hired' },
];

/** The hiring funnel of one test and, below it, whether the test itself is working. */
export function FunnelPanel({ assessment }: { assessment: Assessment }) {
  const t = useAppT();
  const { org } = useWorkspace();
  const { data, error } = useLoad(() => api<Pipeline>(`orgs/${org.id}/assessments/${assessment.id}/pipeline`, { timeoutMs: 60_000 }), [org.id, assessment.id]);
  const health = useLoad(() => api<TestHealth>(`orgs/${org.id}/assessments/${assessment.id}/health`, { timeoutMs: 60_000 }), [org.id, assessment.id]);
  if (error) return <p className="error" role="alert">{error}</p>;
  if (!data) return <p role="status">{t('app.loading')}</p>;
  const { funnel } = data;
  const top = Math.max(1, funnel.candidates);
  const number = (value: number | null) => value === null ? '—' : String(Math.round(value * 10) / 10);
  return <div className="hiring-stack">
    <section aria-labelledby="hiring-funnel-title">
      <h2 id="hiring-funnel-title">{t('hiring.funnel.title')}</h2>
      <ol className="hiring-funnel">
        {STEPS.map(({ key, label }) => {
          const value = Number(funnel[key] ?? 0);
          return <li key={key}>
            <span className="hiring-funnel-label">{t(label)}</span>
            <span className="hiring-funnel-track" aria-hidden="true"><b style={{ width: `${Math.max(value ? 3 : 0, value / top * 100)}%` }}/></span>
            <span className="hiring-funnel-value"><strong>{value}</strong> <span className="hiring-muted">{Math.round(value / top * 100)}%</span></span>
          </li>;
        })}
      </ol>
      <div className="company-grid hiring-stats">
        <div className="company-stat"><strong>{number(funnel.median_minutes_to_finish)}</strong><span>{t('hiring.funnel.medianFinish')}</span></div>
        <div className="company-stat"><strong>{number(funnel.median_days_to_hire)}</strong><span>{t('hiring.funnel.medianHire')}</span></div>
        <div className="company-stat"><strong>{funnel.rejected}</strong><span>{t('hiring.funnel.rejected')}</span></div>
      </div>
    </section>
    {health.data && <section aria-labelledby="hiring-health-title">
      <h2 id="hiring-health-title">{t('hiring.health.title')}</h2>
      <p>{health.data.completion === null ? t('hiring.health.noData') : t('hiring.health.completion', { percent: health.data.completion, finished: health.data.finished, started: health.data.started })}</p>
      {health.data.skills.some((entry) => entry.count > 0) && <div className="company-table-wrap">
        <table className="company-table">
          <thead><tr><th>{t('hiring.report.section')}</th><th>{t('hiring.health.average')}</th><th>{t('hiring.health.minutes')}</th></tr></thead>
          <tbody>{health.data.skills.map((entry) => <tr key={entry.skill}><td>{skillText(t, entry.skill)}</td><td>{entry.average ?? '—'}</td><td>{entry.average_minutes ?? '—'}</td></tr>)}</tbody>
        </table>
      </div>}
      {health.data.flagged.length > 0 ? <>
        <h3>{t('hiring.health.flagged')}</h3>
        <ul className="hiring-problems">{health.data.flagged.map((item) => <li key={`${item.skill}-${item.prompt}`}>{skillText(t, item.skill)}: «{item.prompt.slice(0, 120)}» — {t('hiring.health.rate', { rate: item.rate, served: item.served })}</li>)}</ul>
      </> : <p className="hint">{t('hiring.health.noneFlagged', { count: health.data.questions_checked })}</p>}
    </section>}
  </div>;
}
