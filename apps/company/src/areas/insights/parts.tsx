// Small pieces the analytics pages share: job role picker, skill bars as words,
// period form, CSV download button, at-risk card with its nudge and one-click assign.
import React, { useMemo, useState, type FormEvent } from 'react';
import { JOB_ROLES } from '../../../../../packages/company-core/src/mod.ts';
import { format, type Catalogs, type Locale, type Params } from '../../../../../packages/service-i18n/src/format.ts';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { api } from '../../api.ts';
import { catalogs, useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import type { SkillCode, SkillLevels, RiskPerson } from './api2.ts';
import { download, LEVEL_SHORT, LevelBadge, useFormat } from './ui.tsx';

export function JobSelect({ value, onChange, anyLabel, id }: { value: string; onChange: (value: string) => void; anyLabel?: string; id?: string }) {
  const t = useAppT();
  return <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
    {anyLabel !== undefined && <option value="">{anyLabel}</option>}
    {JOB_ROLES.map((role) => <option key={role} value={role}>{t(`job.${role}` as AppKey)}</option>)}
  </select>;
}

export function SkillList({ skills }: { skills: SkillLevels }) {
  const t = useAppT();
  const entries = Object.entries(skills ?? {}) as [SkillCode, keyof typeof LEVEL_SHORT][];
  if (!entries.length) return <span className="hint">—</span>;
  return <span className="insights-skill-list">{entries.map(([skill, level]) => <span key={skill}>{t(`skill.${skill}` as AppKey)} {LEVEL_SHORT[level]}</span>)}</span>;
}

/** Translations in a language other than the page's, for a report or a message someone else will read. */
export function useTranslator(locale: Locale) {
  return useMemo(() => (key: AppKey, params?: Params) => format(catalogs as Catalogs<string>, locale, key, params), [locale]);
}

export function LocalePicker({ value, onChange, label }: { value: Locale; onChange: (locale: Locale) => void; label: string }) {
  return <label className="insights-inline">{label}
    <select value={value} onChange={(event) => onChange(event.target.value as Locale)}>
      <option value="ru">Русский</option>
      <option value="uz">O‘zbekcha</option>
      <option value="en">English</option>
    </select>
  </label>;
}

/** From and to dates with an Apply button; keeps what is typed until it is applied. */
export function PeriodForm({ from, to, onApply, children }: { from: string; to: string; onApply: (range: { from: string; to: string }) => void; children?: React.ReactNode }) {
  const t = useAppT();
  const [draft, setDraft] = useState({ from, to });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (draft.from && draft.to) onApply(draft);
  }
  return <form className="insights-range no-print" onSubmit={submit}>
    <label>{t('insights.reports.from')}<input type="date" required value={draft.from} max={draft.to || undefined} onChange={(event) => setDraft({ ...draft, from: event.target.value })}/></label>
    <label>{t('insights.reports.to')}<input type="date" required value={draft.to} min={draft.from || undefined} onChange={(event) => setDraft({ ...draft, to: event.target.value })}/></label>
    {children}
    <button className="quiet">{t('insights.reports.apply')}</button>
  </form>;
}

/** Calls an export route and saves what comes back, with a byte-order mark so Excel reads Cyrillic correctly. */
export function CsvButton({ path, label, body }: { path: string; label: string; body?: unknown }) {
  const t = useAppT(), problem = useErrorText();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function run() {
    setBusy(true); setError('');
    try {
      const result = await api<{ filename: string; csv: string }>(path, { timeoutMs: 60000, ...(body === undefined ? {} : { method: 'POST' as const, body }) });
      download(result.filename, `﻿${result.csv}\r\n`, 'text/csv;charset=utf-8');
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  return <>
    <button type="button" className="quiet" disabled={busy} onClick={() => void run()}>{busy ? t('common.loading') : label}</button>
    {error && <p className="error" role="alert">{error}</p>}
  </>;
}

/** The plain sentence for one risk reason. */
export function useReasonText() {
  const t = useAppT(), f = useFormat();
  return (reason: RiskPerson['reasons'][number]): string => {
    switch (reason.code) {
      case 'no_placement': return t('insights.risk.reason.no_placement');
      case 'inactive': return reason.capped ? t('insights.risk.reason.inactiveLong', { days: reason.days ?? 0 }) : t('insights.risk.reason.inactive', { days: reason.days ?? 0 });
      case 'falling_score': return reason.from_score !== null && reason.from_score !== undefined && reason.to_score !== null && reason.to_score !== undefined
        ? t('insights.risk.reason.falling', { from: f.num(reason.from_score), to: f.num(reason.to_score) }) : t('insights.risk.reason.fallingLevel');
      case 'behind_requirement': return t('insights.risk.reason.requirement', { level: reason.want ? LEVEL_SHORT[reason.want] : '—', date: f.date(reason.due_date) });
      case 'behind_assignment': {
        if (reason.done !== undefined && reason.total !== undefined) return t('insights.risk.reason.lessons', { done: reason.done, total: reason.total, date: f.date(reason.due_date) });
        return t('insights.risk.reason.target', { level: reason.want ? LEVEL_SHORT[reason.want] : '—', date: f.date(reason.due_date) });
      }
    }
  };
}

/** One person who needs attention, with what can be done about them. */
export function RiskCard({ person, canAssign, nudgeLocale, onChanged, compact }: { person: RiskPerson; canAssign: boolean; nudgeLocale: Locale; onChanged: () => void; compact?: boolean }) {
  const t = useAppT(), f = useFormat(), problem = useErrorText(), reasonText = useReasonText();
  const nudgeT = useTranslator(nudgeLocale);
  const { org, member, hr } = useWorkspace();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState(''), [showText, setShowText] = useState(false);
  const first = person.reasons[0].code;
  const firstName = person.name.split(/\s+/)[0] ?? person.name;
  const nudge = nudgeT(`insights.risk.nudge.${first}` as AppKey, { name: firstName, sender: member?.full_name?.trim() || org.name, company: org.name });
  async function act(work: () => Promise<string | void>) {
    setBusy(true); setError(''); setNote('');
    try {
      const message = await work();
      if (message) setNote(message);
      onChanged();
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    let copied = false;
    try { await navigator.clipboard.writeText(nudge); copied = true; } catch { setShowText(true); }
    await act(async () => {
      await api(`orgs/${org.id}/insights/at-risk/${person.member_id}/action`, { method: 'POST', body: { kind: 'nudge', reason: first } });
      return copied ? t('insights.risk.copied') : t('insights.risk.copyByHand');
    });
  }
  const trackName = person.suggestion.track_code ? t(`job.${person.suggestion.track_code}` as AppKey) : '';
  return <article className="insights-risk" aria-labelledby={`risk-${person.member_id}`}>
    <header>
      <div>
        <h3 id={`risk-${person.member_id}`}><Link to={`/w/${org.id}/people/${person.member_id}`}>{person.name}</Link></h3>
        <p className="insights-meta">{person.department && <span>{person.department}</span>}<span>{t(`job.${person.job_role}` as AppKey)}</span><LevelBadge level={person.level}/></p>
      </div>
      {person.snoozed_until && <span className="company-badge">{t('insights.risk.snoozedUntil', { date: f.date(person.snoozed_until) })}</span>}
    </header>
    <ul className="insights-risk-reasons">{person.reasons.map((reason, index) => <li key={index}>{reasonText(reason)}</li>)}</ul>
    {!compact && <p className="hint"><strong>{t('insights.risk.suggested')}</strong> {
      person.suggestion.action === 'placement' ? t('insights.risk.suggest.placement')
        : person.suggestion.action === 'assign' ? t('insights.risk.suggest.assign', { track: trackName })
        : t('insights.risk.suggest.nudge')}</p>}
    <div className="company-actions">
      <button className="quiet" disabled={busy} onClick={() => void copy()}>{t('insights.risk.copyNudge')}</button>
      {person.suggestion.action === 'placement' && <Link className="button-link quiet" to={`/w/${org.id}/placement`}>{t('insights.risk.openPlacement')}</Link>}
      {canAssign && person.seat && person.suggestion.track_code && <button disabled={busy} onClick={() => {
        if (confirm(t('insights.risk.assignConfirm', { name: person.name, track: trackName, date: f.date(person.suggestion.due_date) }))) void act(async () => {
          await api(`orgs/${org.id}/insights/at-risk/${person.member_id}/assign`, { method: 'POST', body: { track_code: person.suggestion.track_code, target_level: person.suggestion.target_level, due_date: person.suggestion.due_date, reason: first } });
          return t('insights.risk.assigned', { track: trackName });
        });
      }}>{t('insights.risk.assign')}</button>}
      {hr && canAssign && !person.seat && <span className="hint">{t('insights.risk.needsSeat')}</span>}
      {person.snoozed_until
        ? <button className="quiet" disabled={busy} onClick={() => void act(async () => { await api(`orgs/${org.id}/insights/at-risk/${person.member_id}/snooze`, { method: 'DELETE' }); })}>{t('insights.risk.unsnooze')}</button>
        : <button className="quiet" disabled={busy} onClick={() => void act(async () => { await api(`orgs/${org.id}/insights/at-risk/${person.member_id}/action`, { method: 'POST', body: { kind: 'snooze', days: 14 } }); })}>{t('insights.risk.snooze')}</button>}
    </div>
    <details className="insights-nudge" open={showText} onToggle={(event) => setShowText(event.currentTarget.open)}>
      <summary>{t('insights.risk.seeNudge')}</summary>
      <p>{nudge}</p>
    </details>
    {(person.last_nudge || person.last_assign) && <p className="hint">
      {person.last_nudge && t('insights.risk.lastNudge', { date: f.date(person.last_nudge) })}{person.last_nudge && person.last_assign ? ' · ' : ''}{person.last_assign && t('insights.risk.lastAssign', { date: f.date(person.last_assign) })}
    </p>}
    {note && <p className="notice" role="status">{note}</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </article>;
}

export function useNudgeLocale() {
  const { locale } = useI18n();
  return useState<Locale>(locale);
}
