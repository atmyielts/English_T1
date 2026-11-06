// Setting up hiring: the gallery of ready vacancies, workspace settings (data retention and
// message templates), and trying a test as a candidate without using a test or storing it.
import React, { useMemo, useRef, useState, type FormEvent } from 'react';
import { INDUSTRIES, type Skill } from '../../../../../packages/company-core/src/mod.ts';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link, navigate } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { rememberLink } from './HiringPages.tsx';
import { TestRunner, type RunnerBody, type Transport } from './TestRunner.tsx';
import type { Assessment, AttemptView, HiringSettings, MessageTemplate, RoleTemplate } from './types.ts';
import { LevelBadge, SkillBars, shortLevel, skillText, useHiringError, useLoad } from './ui.tsx';

export function TemplateGallery({ onCancel }: { onCancel: () => void }) {
  const t = useAppT(), problem = useHiringError();
  const { org } = useWorkspace();
  const { data, error } = useLoad(() => api<{ templates: RoleTemplate[]; industry: string }>(`orgs/${org.id}/hiring/role-templates`), [org.id]);
  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState('');
  const [busy, setBusy] = useState<string | null>(null), [actionError, setActionError] = useState('');
  const name = (code: string) => t(`hiring.role.${code}` as AppKey);
  const rows = useMemo(() => {
    if (!data) return [];
    const needle = search.trim().toLowerCase();
    return data.templates
      .filter((row) => (!industry || row.industries.includes(industry)) && (!needle || name(row.code).toLowerCase().includes(needle)))
      // The company's own industry first; the list keeps its order otherwise.
      .map((row, index) => ({ row, rank: row.industries.includes(data.industry) ? index : index + 1000 }))
      .sort((a, b) => a.rank - b.rank)
      .map(({ row }) => row);
  }, [data, search, industry]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create(code: string) {
    setBusy(code); setActionError('');
    try {
      const { assessment, link } = await api<{ assessment: Assessment; link: string }>(`orgs/${org.id}/hiring/role-templates/${code}`, { method: 'POST', body: { title: name(code) } });
      rememberLink(assessment.id, link, assessment.link_id);
      navigate(`/w/${org.id}/hiring/${assessment.id}`);
    } catch (cause) {
      setActionError(problem(cause));
      setBusy(null);
    }
  }
  return <section aria-labelledby="hiring-gallery-title">
    <div className="page-heading">
      <div><h2 id="hiring-gallery-title">{t('hiring.gallery.title')}</h2><p className="hint">{t('hiring.gallery.lead')}</p></div>
      <button type="button" className="quiet hiring-small" onClick={onCancel}>{t('common.close')}</button>
    </div>
    <div className="company-toolbar">
      <label>{t('hiring.filter.search')}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)}/></label>
      <label>{t('hiring.gallery.industry')}<select value={industry} onChange={(event) => setIndustry(event.target.value)}>
        <option value="">{t('hiring.filter.any')}</option>
        {INDUSTRIES.map((entry) => <option key={entry} value={entry}>{t(`industry.${entry}` as AppKey)}</option>)}
      </select></label>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {actionError && <p className="error" role="alert">{actionError}</p>}
    {!data && !error && <p role="status">{t('app.loading')}</p>}
    {data && rows.length === 0 && <p>{t('hiring.gallery.none')}</p>}
    <ul className="hiring-gallery">
      {rows.map((row) => <li key={row.code} className="hiring-gallery-card">
        <p className="eyebrow">{t(`job.${row.job_role}` as AppKey)}</p>
        <h3>{name(row.code)}</h3>
        <p className="hiring-card-meta"><span>{t('hiring.list.min', { level: shortLevel(row.min_level) })}</span><span>{t('common.minutes', { count: row.time_limit_minutes })}</span></p>
        <p className="hiring-chips">{row.skills.map((skill: Skill) => <span key={skill} className="hiring-chip">{skillText(t, skill)} {shortLevel(row.skill_minimums[skill])}</span>)}</p>
        <button type="button" className="quiet hiring-small" disabled={busy !== null} onClick={() => void create(row.code)}>{busy === row.code ? t('hiring.run.working') : t('hiring.gallery.create')}</button>
      </li>)}
    </ul>
    {data && <p className="hint">{t('hiring.gallery.note')}</p>}
  </section>;
}

const KINDS = ['invite', 'reminder', 'interview', 'offer', 'rejection', 'feedback'] as const;
type Kind = (typeof KINDS)[number];
const LOCALES = ['ru', 'uz', 'en'] as const;
type TemplateLocale = (typeof LOCALES)[number];

export function HiringSettingsPage() {
  const t = useAppT(), problem = useHiringError();
  const { org } = useWorkspace();
  const { locale } = useI18n();
  const { data, error, setData } = useLoad(() => api<HiringSettings>(`orgs/${org.id}/hiring/settings`), [org.id]);
  const [retention, setRetention] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>('invite');
  const [language, setLanguage] = useState<TemplateLocale>(locale === 'en' || locale === 'uz' ? locale : 'ru');
  const [draft, setDraft] = useState<MessageTemplate | null>(null);
  const [busy, setBusy] = useState(false), [actionError, setActionError] = useState(''), [notice, setNotice] = useState('');
  if (error) return <p className="error" role="alert">{error}</p>;
  if (!data) return <p role="status">{t('app.loading')}</p>;

  const own = data.templates[kind]?.[language];
  const shown = draft ?? own ?? data.defaults[kind][language];
  const months = retention ?? (data.retention_months === null ? '' : String(data.retention_months));

  async function save(body: Record<string, unknown>, done: (value: { retention_months: number | null; templates: HiringSettings['templates'] }) => void) {
    setBusy(true); setActionError(''); setNotice('');
    try {
      const response = await api<{ retention_months: number | null; templates: HiringSettings['templates'] }>(`orgs/${org.id}/hiring/settings`, { method: 'PUT', body });
      setData({ ...data!, ...response });
      done(response);
      setNotice(t('common.saved'));
    } catch (cause) {
      setActionError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  const saveRetention = (event: FormEvent) => {
    event.preventDefault();
    void save({ retention_months: months === '' ? null : Number(months) }, () => setRetention(null));
  };
  const withTemplate = (value: MessageTemplate | null) => {
    const next = JSON.parse(JSON.stringify(data.templates)) as HiringSettings['templates'];
    if (value) (next[kind] ??= {})[language] = value;
    else if (next[kind]) delete next[kind]![language];
    return next;
  };
  return <div className="hiring-stack">
    <p><Link to={`/w/${org.id}/hiring`}>← {t('hiring.detail.back')}</Link></p>
    <div className="page-heading"><div><h1>{t('hiring.settings.title')}</h1><p>{t('hiring.settings.lead')}</p></div></div>
    {notice && <p className="notice" role="status">{notice}</p>}
    {actionError && <p className="error" role="alert">{actionError}</p>}
    <section aria-labelledby="retention-title">
      <h2 id="retention-title">{t('hiring.settings.retention')}</h2>
      <p className="hint">{t('hiring.settings.retentionLead')}</p>
      <form onSubmit={saveRetention} className="hiring-form">
        <label>{t('hiring.settings.retentionLabel')}<select value={months} onChange={(event) => setRetention(event.target.value)}>
          <option value="">{t('hiring.settings.retentionOff')}</option>
          {[3, 6, 12, 18, 24, 36, 60].map((value) => <option key={value} value={value}>{t('hiring.settings.months', { count: value })}</option>)}
        </select></label>
        {months !== '' && <p className="notice">{t('hiring.settings.retentionOn', { count: Number(months) })}</p>}
        <div className="company-actions"><button disabled={busy}>{t('common.save')}</button></div>
      </form>
    </section>
    <section aria-labelledby="templates-title">
      <h2 id="templates-title">{t('hiring.settings.templates')}</h2>
      <p className="hint">{t('hiring.settings.templatesLead')}</p>
      <div className="hiring-form-row">
        <label>{t('hiring.ats.messageKind')}<select value={kind} onChange={(event) => { setKind(event.target.value as Kind); setDraft(null); }}>
          {KINDS.map((entry) => <option key={entry} value={entry}>{t(`hiring.message.${entry}` as AppKey)}</option>)}
        </select></label>
        <label>{t('hiring.ats.messageLanguage')}<select value={language} onChange={(event) => { setLanguage(event.target.value as TemplateLocale); setDraft(null); }}>
          {LOCALES.map((entry) => <option key={entry} value={entry}>{t(`hiring.language.${entry}` as AppKey)}</option>)}
        </select></label>
      </div>
      <form className="hiring-form" onSubmit={(event) => { event.preventDefault(); void save({ templates: withTemplate(shown) }, () => setDraft(null)); }}>
        <label>{t('hiring.ats.messageSubject')}<input required maxLength={200} value={shown.subject} onChange={(event) => setDraft({ ...shown, subject: event.target.value })}/></label>
        <label>{t('hiring.ats.messageText')}<textarea required rows={10} maxLength={3000} value={shown.body} onChange={(event) => setDraft({ ...shown, body: event.target.value })}/></label>
        <p className="hint">{t('hiring.settings.placeholders')} <code>{'{name} {company} {test} {link} {minutes} {closes} {closes_line}'}</code></p>
        <div className="company-actions">
          <button disabled={busy}>{t('common.save')}</button>
          {own && <button type="button" className="quiet" disabled={busy} onClick={() => void save({ templates: withTemplate(null) }, () => setDraft(null))}>{t('hiring.settings.templateReset')}</button>}
          {!own && <span className="hiring-muted">{t('hiring.settings.templateDefault')}</span>}
        </div>
      </form>
    </section>
  </div>;
}

/** The test as a candidate sees it. The server stores nothing; the state stays on this page. */
export function TestPreviewPage({ assessmentId }: { assessmentId: string }) {
  const t = useAppT(), problem = useHiringError();
  const { org } = useWorkspace();
  const state = useRef<unknown>(null);
  // A new key per visit, so answers from an earlier try are not offered again.
  const [storageKey] = useState(() => `company-preview:${assessmentId}:${Date.now()}`);
  const backTo = `/w/${org.id}/hiring/${assessmentId}`;
  const { data, error } = useLoad(async () => {
    const started = await api<{ state: unknown; attempt: AttemptView }>(`orgs/${org.id}/assessments/${assessmentId}/preview`, { method: 'POST', body: { action: 'start' } });
    state.current = started.state;
    return started.attempt;
  }, [org.id, assessmentId]);
  const [finished, setFinished] = useState<AttemptView | null>(null);
  const [problemText, setProblemText] = useState('');
  if (error) return <section><p className="error" role="alert">{error}</p><p><Link to={backTo}>{t('hiring.detail.back')}</Link></p></section>;
  if (!data) return <p role="status">{t('app.loading')}</p>;

  const step = async (action: 'next' | 'submit', body: RunnerBody) => {
    try {
      const response = await api<{ state: unknown; attempt: AttemptView }>(`orgs/${org.id}/assessments/${assessmentId}/preview`, { method: 'POST', body: { action, state: state.current, answers: body.answers, at: body.at }, timeoutMs: 60_000 });
      state.current = response.state;
      return response.attempt;
    } catch (cause) {
      setProblemText(problem(cause));
      throw cause;
    }
  };
  const transport: Transport = { save: () => Promise.resolve(null), next: (body) => step('next', body), submit: (body) => step('submit', body) };
  if (finished) {
    return <section className="hiring-narrow hiring-stack" aria-labelledby="preview-done">
      <h1 id="preview-done">{t('hiring.preview.doneTitle')}</h1>
      <p className="notice" role="status">{t('hiring.preview.doneLead')}</p>
      {finished.result && <div className="hiring-result">
        <p className="eyebrow">{t('hiring.candidate.yourLevel')}</p>
        <p className="hiring-result-level"><LevelBadge level={finished.result.overall_level}/></p>
        <SkillBars skills={finished.sections.map((section) => section.skill)} results={finished.result.skills}/>
        <p className="hint">{t('hiring.preview.productionNote')}</p>
      </div>}
      <div className="company-actions"><Link className="button-link" to={backTo}>{t('hiring.preview.back')}</Link></div>
    </section>;
  }
  return <div className="hiring-stack">
    <p className="notice no-print" role="status">{t('hiring.preview.banner')} <Link to={backTo}>{t('hiring.preview.back')}</Link></p>
    {problemText && <p className="error" role="alert">{problemText}</p>}
    <TestRunner initial={data} transport={transport} storageKey={storageKey} onDone={(view) => { setFinished(view); scrollTo(0, 0); }}/>
  </div>;
}
