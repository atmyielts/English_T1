// Small pieces of the applicant tracking pages: stage, verdict and tracking badges, the
// benchmark table, and a block with a ready text to copy or share.
import React, { useState } from 'react';
import type { Skill } from '../../../../../packages/company-core/src/mod.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { mailTo, telegramShare } from './candidates.ts';
import type { BenchmarkView, Stage, Track, Verdict } from './types.ts';
import { CopyButton, LevelBadge, shortLevel, skillText, useFormat } from './ui.tsx';

export const STAGES: Stage[] = ['new', 'reviewing', 'interview', 'offer', 'hired', 'rejected'];

export function StageBadge({ stage }: { stage: Stage }) {
  const t = useAppT();
  const tone = stage === 'hired' || stage === 'offer' ? 'good' : stage === 'rejected' ? 'bad' : stage === 'interview' ? 'warn' : '';
  return <span className={`company-badge ${tone}`}>{t(`hiring.stage.${stage}` as AppKey)}</span>;
}

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const t = useAppT();
  if (verdict === 'none') return null;
  const tone = verdict === 'meets' ? 'good' : verdict === 'below' ? 'bad' : '';
  return <span className={`company-badge ${tone}`}>{t(`hiring.verdict.${verdict}` as AppKey)}</span>;
}

export function TrackBadge({ track }: { track: Track }) {
  const t = useAppT();
  const tone = track === 'graded' ? 'good' : track === 'finished' ? 'warn' : track === 'expired' ? 'bad' : '';
  return <span className={`company-badge ${tone}`}>{t(`hiring.track.${track}` as AppKey)}</span>;
}

export function StagePicker({ stage, disabled, label, onChange }: { stage: Stage; disabled?: boolean; label: string; onChange: (stage: Stage) => void }) {
  const t = useAppT();
  return <label className="hiring-stage-picker"><span className="visually-hidden">{label}</span>
    <select value={stage} disabled={disabled} onChange={(event) => onChange(event.target.value as Stage)}>
      {STAGES.map((entry) => <option key={entry} value={entry}>{t(`hiring.stage.${entry}` as AppKey)}</option>)}
    </select>
  </label>;
}

/** The candidate against the role, one row per skill, with a clear meets or below on each. */
export function BenchmarkTable({ benchmark }: { benchmark: BenchmarkView }) {
  const t = useAppT(), format = useFormat();
  return <div className="company-table-wrap">
    <table className="company-table hiring-benchmark">
      <thead><tr><th>{t('hiring.report.section')}</th><th>{t('hiring.ats.required')}</th><th>{t('hiring.ats.reached')}</th><th>{t('hiring.ats.result')}</th></tr></thead>
      <tbody>
        <tr className="hiring-benchmark-overall">
          <th scope="row">{t('hiring.report.overall')}</th>
          <td>{benchmark.overall.required ? shortLevel(benchmark.overall.required) : '—'}</td>
          <td><LevelBadge level={benchmark.overall.level} short/> {format.score(benchmark.overall.score)}</td>
          <td>{benchmark.overall.meets === null ? '—' : <span className={`company-badge ${benchmark.overall.meets ? 'good' : 'bad'}`}>{t(benchmark.overall.meets ? 'hiring.verdict.meets' : 'hiring.verdict.below')}</span>}</td>
        </tr>
        {benchmark.skills.map((entry) => <tr key={entry.skill}>
          <th scope="row">{skillText(t, entry.skill)}</th>
          <td>{entry.required ? shortLevel(entry.required) : '—'}</td>
          <td>{entry.level ? <><LevelBadge level={entry.level} short/> {format.score(entry.score)}</> : '—'}</td>
          <td>{entry.meets === null ? '—' : <span className={`company-badge ${entry.meets ? 'good' : 'bad'}`}>{entry.meets ? t('hiring.verdict.meets') : entry.gap > 1 ? t('hiring.ats.levelsBelow', { count: entry.gap }) : t('hiring.verdict.below')}</span>}</td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}

/** One small chip per skill: the level reached, coloured against the requirement. */
export function BenchmarkChips({ benchmark }: { benchmark: BenchmarkView }) {
  const t = useAppT();
  return <span className="hiring-chips">{benchmark.skills.map((entry) => <span
    key={entry.skill}
    className={`hiring-chip${entry.meets === true ? ' ok' : entry.meets === false ? ' low' : ''}`}
    title={`${skillText(t, entry.skill)}: ${entry.level ? shortLevel(entry.level) : '—'}${entry.required ? ` / ${shortLevel(entry.required)}` : ''}`}>
    <abbr title={skillText(t, entry.skill)}>{skillText(t, entry.skill as Skill).slice(0, 1)}</abbr> {entry.level ? shortLevel(entry.level) : '…'}
  </span>)}</span>;
}

/** A message HR can adjust, then copy or open in Telegram or their email program. Schood sends nothing. */
export function MessageBox({ subject, text, link, email, onUsed }: { subject: string; text: string; link?: string | null; email?: string | null; onUsed?: () => void }) {
  const t = useAppT();
  const [value, setValue] = useState(text);
  const [lastText, setLastText] = useState(text);
  if (text !== lastText) { setLastText(text); setValue(text); }
  return <div className="hiring-message">
    <label>{t('hiring.ats.messageSubject')}<input readOnly value={subject} onFocus={(event) => event.target.select()}/></label>
    <label>{t('hiring.ats.messageText')}<textarea rows={8} value={value} onChange={(event) => setValue(event.target.value)}/></label>
    <div className="company-actions">
      <span onClickCapture={onUsed}><CopyButton text={value}/></span>
      <a className="button-link quiet" href={telegramShare(link ?? null, value)} target="_blank" rel="noopener noreferrer" onClick={onUsed}>{t('hiring.link.telegram')}</a>
      <a className="button-link quiet" href={mailTo(email ?? null, subject, value)} onClick={onUsed}>{t('hiring.ats.openEmail')}</a>
    </div>
    <p className="hint">{t('hiring.ats.notSent')}</p>
  </div>;
}
