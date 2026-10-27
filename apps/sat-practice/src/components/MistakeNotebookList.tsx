import { ArrowRight } from 'lucide-react';
import type { NotebookItem } from '../lib/api';
import { useAppT, type AppKey } from '../i18n';
import { domainLabel, legacyOfficial, sectionLabel, skillLabel } from '../lib/labels';

const REASONS = ['concept_gap', 'careless', 'time_pressure', 'misread_wording', 'unknown'] as const;
const DEFAULT_NOTE = 'Review the underlying concept, then retry a similar item.';

export const MistakeNotebookList = (props: {
  items: NotebookItem[];
  busy?: boolean;
  onRetry?: (item: NotebookItem) => void;
  onTag?: (item: NotebookItem, reasonTag: string) => void;
}) => {
  const t = useAppT();
  return <ul className="notebook-list">
    {props.items.map((item) => {
      const official = item.official_domain ?? legacyOfficial(item.domain);
      const reason = (REASONS as readonly string[]).includes(item.reason_tag) ? item.reason_tag : 'unknown';
      return <li key={item.id} className="notebook-row">
        <div>
          <div className="chip-row">
            <span className={`chip ${item.section_type}`}>{sectionLabel(t, item.section_type)}</span>
            <span className="chip neutral">{domainLabel(t, official)}</span>
            {item.skill ? <span className="chip neutral">{skillLabel(t, item.skill)}</span> : null}
            <span className="chip neutral">{t(`difficulty.${item.difficulty}` as AppKey)}</span>
          </div>
          <strong>{t('notebook.pattern', { domain: item.skill ? skillLabel(t, item.skill) : domainLabel(t, official) })}</strong>
          <p>{item.coach_note && item.coach_note !== DEFAULT_NOTE ? item.coach_note : t('notebook.coachDefault')}</p>
          <p>{t('notebook.reasonLine', { reason: t(`notebook.reason.${reason}` as AppKey) })}</p>
        </div>
        <div className="row-actions">
          <select value={reason} disabled={props.busy} onChange={(event) => props.onTag?.(item, event.target.value)} aria-label={t('notebook.reason')}>
            {REASONS.map(r => <option key={r} value={r}>{t(`notebook.reason.${r}` as AppKey)}</option>)}
          </select>
          {props.onRetry ? <button type="button" className="icon-button" onClick={() => props.onRetry?.(item)} disabled={props.busy} title={t('notebook.retry')} aria-label={t('notebook.retry')}>
            <ArrowRight size={17} aria-hidden="true" />
          </button> : null}
        </div>
      </li>;
    })}
  </ul>;
};
