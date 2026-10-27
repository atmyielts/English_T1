import { Eye, Plus, Save, Upload } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { PageBlocks } from '../components/PageBlocks';
import { Shell } from '../components/TopNav';
import { Skeleton, useErrorText } from '../components/ui';
import { useT, type Key } from '../i18n';
import type { Json, Section } from '../lib/api';
import { usePlaybook } from '../lib/context';

export type AdminSection = 'overview' | 'pages' | 'page' | 'sources' | 'plans' | 'analytics' | 'preview';

const rows = (v: unknown): Json[] => (Array.isArray(v) ? v.filter((x): x is Json => !!x && typeof x === 'object' && !Array.isArray(x)) : []);
const str = (v: unknown) => (v == null ? '' : String(v));
const pretty = (v: unknown) => JSON.stringify(v ?? {}, null, 2);
const parseJson = (text: string): Json => {
  const parsed = JSON.parse(text || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('json');
  return parsed as Json;
};

const NAV: Array<{ to: string; key: Key }> = [
  { to: '/admin', key: 'admin.nav.overview' },
  { to: '/admin/pages', key: 'admin.nav.pages' },
  { to: '/admin/sources', key: 'admin.nav.sources' },
  { to: '/admin/plans', key: 'admin.nav.plans' },
  { to: '/admin/preview', key: 'admin.nav.preview' },
  { to: '/admin/analytics', key: 'admin.nav.analytics' },
];

const Status = ({ value }: { value: unknown }) => <span className={`status-pill ${str(value)}`}>{str(value) || '—'}</span>;

const useAdmin = () => {
  const { adminApi, access } = usePlaybook();
  const errorText = useErrorText();
  const t = useT();
  const token = access.token!;
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>, okText?: string): Promise<T | null> => {
    setNotice(null);
    try {
      const out = await fn();
      if (okText) setNotice({ ok: true, text: okText });
      return out;
    } catch (error) {
      setNotice({ ok: false, text: error instanceof SyntaxError || (error instanceof Error && error.message === 'json') ? t('admin.badJson') : errorText(error) });
      return null;
    }
  }, [errorText, t]);
  return { api: adminApi, token, notice, run };
};

const Notice = ({ notice }: { notice: { ok: boolean; text: string } | null }) =>
  notice ? <p className={`alert${notice.ok ? '' : ' error'}`} role="status">{notice.text}</p> : null;

const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="field"><span>{label}</span>{children}</label>;

const Overview = () => {
  const t = useT();
  const { api, token, run, notice } = useAdmin();
  const [qa, setQa] = useState<Json | null>(null);
  useEffect(() => { void run(() => api.qa(token)).then((r) => r && setQa(r)); }, [api, run, token]);
  if (!qa) return <><Notice notice={notice} /><Skeleton lines={6} /></>;
  const coverage = (title: Key, list: Json[]) => (
    <section className="panel">
      <h2>{t(title)}</h2>
      <div className="table-scroll" tabIndex={0}>
        <table className="data-table">
          <thead><tr><th scope="col">{t('admin.slug')}</th><th scope="col">{t('admin.status')}</th></tr></thead>
          <tbody>{list.map((r) => <tr key={str(r.slug)}><th scope="row">{r.id ? <Link to={`/admin/pages/${str(r.id)}`}>{str(r.slug)}</Link> : str(r.slug)}</th><td><Status value={r.status} />{r.weeks != null ? ` · ${str(r.weeks)} ${t('plans.week').toLowerCase()}` : ''}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
  return (
    <>
      <Notice notice={notice} />
      <div className="two-col">
        {coverage('admin.qa.modules', rows(qa.modules))}
        {coverage('admin.qa.guides', rows(qa.guides))}
      </div>
      {coverage('admin.qa.templates', rows(qa.plan_templates))}
      <section className="panel">
        <h2>{t('admin.qa.issues')}</h2>
        {(['pages_missing_citations', 'pages_missing_seo', 'published_pages_without_sections', 'unexpected_slugs'] as const).map((key) => (
          <p key={key}><strong>{t(`admin.qa.${key}` as Key)}:</strong> {rows(qa[key]).map((r) => str(r.slug)).join(', ') || t('admin.none')}</p>
        ))}
      </section>
    </>
  );
};

const PagesList = () => {
  const t = useT();
  const navigate = useNavigate();
  const { api, token, run, notice } = useAdmin();
  const [pages, setPages] = useState<Json[] | null>(null);
  const [draft, setDraft] = useState({ slug: '', title: '', page_type: 'module', visibility: 'public' });
  useEffect(() => { void run(() => api.pages(token)).then((r) => r && setPages(r.pages)); }, [api, run, token]);
  const create = async () => {
    const res = await run(() => api.createPage(token, draft), t('admin.saved'));
    if (res) navigate(`/admin/pages/${str(res.page.id)}`);
  };
  return (
    <>
      <Notice notice={notice} />
      <section className="panel form-panel">
        <h2>{t('admin.newPage')}</h2>
        <div className="field-row four">
          <Field label={t('admin.slug')}><input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} /></Field>
          <Field label={t('admin.fieldTitle')}><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
          <Field label={t('admin.pageType')}>
            <select value={draft.page_type} onChange={(e) => setDraft({ ...draft, page_type: e.target.value })}>{['module', 'guide', 'resource', 'faq', 'test_day', 'result_strategy', 'myth', 'update', 'study_plan'].map((v) => <option key={v}>{v}</option>)}</select>
          </Field>
          <Field label={t('admin.visibility')}>
            <select value={draft.visibility} onChange={(e) => setDraft({ ...draft, visibility: e.target.value })}>{['public', 'authenticated', 'premium'].map((v) => <option key={v}>{v}</option>)}</select>
          </Field>
        </div>
        <button type="button" className="btn solid" onClick={() => void create()}><Plus size={15} aria-hidden="true" /> {t('admin.create')}</button>
      </section>
      <section className="panel">
        <h2>{t('admin.nav.pages')}</h2>
        {!pages ? <Skeleton lines={5} title={false} /> : (
          <div className="table-scroll" tabIndex={0}>
            <table className="data-table">
              <thead><tr><th scope="col">{t('admin.fieldTitle')}</th><th scope="col">{t('admin.slug')}</th><th scope="col">{t('admin.visibility')}</th><th scope="col">{t('admin.status')}</th></tr></thead>
              <tbody>{pages.map((p) => <tr key={str(p.id)}><th scope="row"><Link to={`/admin/pages/${str(p.id)}`}>{str(p.title)}</Link></th><td>{str(p.slug)}</td><td>{str(p.visibility)}</td><td><Status value={p.status} /></td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
};

const SectionEditor = ({ section, blockTypes, onSaved }: { section: Json; blockTypes: string[]; onSaved: () => void }) => {
  const t = useT();
  const { api, token, run, notice } = useAdmin();
  const [form, setForm] = useState({ heading: str(section.heading), block_type: str(section.block_type || 'rich_text'), sort_order: str(section.sort_order ?? 0), status: str(section.status || 'draft'), content: pretty(section.content) });
  const save = async () => {
    const body = { heading: form.heading, block_type: form.block_type, sort_order: Number(form.sort_order), status: form.status, content: parseJson(form.content) };
    const res = section.id
      ? await run(() => api.patchSection(token, { id: section.id, patch: body }), t('admin.saved'))
      : await run(() => api.createSection(token, { ...body, page_id: section.page_id }), t('admin.saved'));
    if (res) onSaved();
  };
  return (
    <details className="week-block" open={!section.id}>
      <summary><strong>{str(section.sort_order)}. {form.heading || t('admin.untitled')}</strong> <span className="muted-note">{form.block_type}</span> <Status value={form.status} /></summary>
      <div className="form-panel">
        <div className="field-row four">
          <Field label={t('admin.heading')}><input value={form.heading} onChange={(e) => setForm({ ...form, heading: e.target.value })} /></Field>
          <Field label={t('admin.blockType')}><select value={form.block_type} onChange={(e) => setForm({ ...form, block_type: e.target.value })}>{blockTypes.map((b) => <option key={b}>{b}</option>)}</select></Field>
          <Field label={t('admin.order')}><input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></Field>
          <Field label={t('admin.status')}><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{['draft', 'review', 'published', 'archived'].map((s) => <option key={s}>{s}</option>)}</select></Field>
        </div>
        <Field label={t('admin.contentJson')}><textarea className="code-input" rows={10} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></Field>
        <button type="button" className="btn solid compact" onClick={() => void save()}><Save size={14} aria-hidden="true" /> {t('common.save')}</button>
        <Notice notice={notice} />
      </div>
    </details>
  );
};

const PageEditor = () => {
  const t = useT();
  const { id = '' } = useParams();
  const { api, token, run, notice } = useAdmin();
  const [detail, setDetail] = useState<Json | null>(null);
  const [overview, setOverview] = useState<Json | null>(null);
  const [form, setForm] = useState<Json>({});
  const [sourceIds, setSourceIds] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const load = useCallback(() => {
    void run(() => api.page(id, token)).then((r) => {
      if (!r) return;
      setDetail(r as unknown as Json);
      const p = r.page;
      setForm({ title: p.title, summary: p.summary, slug: p.slug, page_type: p.page_type, visibility: p.visibility, module_key: p.module_key ?? '', parent_page_id: p.parent_page_id ?? '', sort_order: p.sort_order ?? 0, seo_title: p.seo_title ?? '', seo_description: p.seo_description ?? '', metadata: pretty(p.metadata) });
      setSourceIds((r.source_ids ?? []).join(', '));
    });
  }, [api, id, run, token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { void run(() => api.overview(token)).then((r) => r && setOverview(r)); }, [api, run, token]);
  if (!detail) return <><Notice notice={notice} /><Skeleton lines={8} /></>;
  const page = detail.page as Json;
  const sections = rows(detail.sections);
  const blockTypes = Array.isArray(overview?.block_types) ? (overview!.block_types as string[]) : ['rich_text', 'checklist', 'callout', 'faq', 'timeline', 'cta_strip', 'comparison_table'];

  const save = async () => {
    const patch: Json = { ...form, sort_order: Number(form.sort_order ?? 0), metadata: parseJson(str(form.metadata)), parent_page_id: form.parent_page_id || null, module_key: form.module_key || null };
    const ids = sourceIds.split(',').map((s) => s.trim()).filter(Boolean);
    if (await run(() => api.patchPage(token, { id, patch, source_ids: ids }), t('admin.saved'))) load();
  };
  const publish = async (on: boolean) => { if (await run(() => api.publish(token, 'page', id, on), on ? t('admin.published') : t('admin.unpublished'))) load(); };

  return (
    <>
      <Notice notice={notice} />
      <section className="panel form-panel">
        <div className="section-head">
          <h2>{str(page.title)} <Status value={page.status} /></h2>
          <div className="hero-actions">
            <button type="button" className="btn ghost compact" onClick={() => setShowPreview((v) => !v)}><Eye size={14} aria-hidden="true" /> {t('admin.preview')}</button>
            {page.status === 'published'
              ? <button type="button" className="btn ghost compact" onClick={() => void publish(false)}>{t('admin.unpublish')}</button>
              : <button type="button" className="btn solid compact" onClick={() => void publish(true)}><Upload size={14} aria-hidden="true" /> {t('admin.publish')}</button>}
          </div>
        </div>
        <div className="field-row">
          <Field label={t('admin.fieldTitle')}><input value={str(form.title)} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label={t('admin.slug')}><input value={str(form.slug)} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></Field>
        </div>
        <Field label={t('admin.summary')}><textarea rows={3} value={str(form.summary)} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></Field>
        <div className="field-row four">
          <Field label={t('admin.pageType')}><input value={str(form.page_type)} onChange={(e) => setForm({ ...form, page_type: e.target.value })} /></Field>
          <Field label={t('admin.visibility')}><select value={str(form.visibility)} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>{['public', 'authenticated', 'premium'].map((v) => <option key={v}>{v}</option>)}</select></Field>
          <Field label={t('admin.moduleKey')}><input value={str(form.module_key)} onChange={(e) => setForm({ ...form, module_key: e.target.value })} /></Field>
          <Field label={t('admin.order')}><input type="number" value={str(form.sort_order)} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></Field>
        </div>
        <div className="field-row">
          <Field label={t('admin.seoTitle')}><input value={str(form.seo_title)} onChange={(e) => setForm({ ...form, seo_title: e.target.value })} /></Field>
          <Field label={t('admin.seoDescription')}><input value={str(form.seo_description)} onChange={(e) => setForm({ ...form, seo_description: e.target.value })} /></Field>
        </div>
        <Field label={t('admin.sourceIds')}><input value={sourceIds} onChange={(e) => setSourceIds(e.target.value)} /></Field>
        <Field label={t('admin.metadataJson')}><textarea className="code-input" rows={6} value={str(form.metadata)} onChange={(e) => setForm({ ...form, metadata: e.target.value })} /></Field>
        <button type="button" className="btn solid" onClick={() => void save()}><Save size={15} aria-hidden="true" /> {t('common.save')}</button>
      </section>
      {showPreview ? <section className="panel"><p className="eyebrow">{t('admin.previewNote')}</p><PageBlocks sections={sections as unknown as Section[]} /></section> : null}
      <section className="panel">
        <h2>{t('admin.sections')} ({sections.length})</h2>
        {sections.map((s) => <SectionEditor key={str(s.id)} section={s} blockTypes={blockTypes} onSaved={load} />)}
        <SectionEditor key={`new-${sections.length}`} section={{ page_id: id, sort_order: sections.length + 1, block_type: 'rich_text', content: { markdown: '' } }} blockTypes={blockTypes} onSaved={load} />
      </section>
    </>
  );
};

const SimpleRows = ({ kind }: { kind: 'sources' | 'plans' }) => {
  const t = useT();
  const { api, token, run, notice } = useAdmin();
  const [items, setItems] = useState<Json[] | null>(null);
  const [editing, setEditing] = useState<Json | null>(null);
  const [text, setText] = useState('');
  const load = useCallback(() => {
    void run(() => (kind === 'sources' ? api.sources(token).then((r) => r.sources) : api.templates(token).then((r) => r.plan_templates))).then((r) => r && setItems(r));
  }, [api, kind, run, token]);
  useEffect(() => { load(); }, [load]);
  const fields = kind === 'sources'
    ? ['title', 'source_type', 'provider_key', 'url', 'summary', 'status', 'verified_at', 'metadata']
    : ['slug', 'title', 'summary', 'plan_type', 'duration_days', 'score_min', 'score_max', 'focus_section', 'intensity', 'status', 'schedule_json', 'metadata'];
  const open = (row: Json | null) => {
    setEditing(row ?? {});
    setText(pretty(Object.fromEntries(fields.map((f) => [f, row?.[f] ?? (f === 'metadata' || f === 'schedule_json' ? {} : '')]))));
  };
  const save = async () => {
    const body = parseJson(text);
    const id = editing?.id;
    const res = kind === 'sources'
      ? id ? await run(() => api.patchSource(token, { id, patch: body }), t('admin.saved')) : await run(() => api.createSource(token, body), t('admin.saved'))
      : id ? await run(() => api.patchTemplate(token, { id, patch: body }), t('admin.saved')) : await run(() => api.createTemplate(token, body), t('admin.saved'));
    if (res) { setEditing(null); load(); }
  };
  const publish = async (row: Json, on: boolean) => { if (await run(() => api.publish(token, kind === 'sources' ? 'source' : 'plan_template', str(row.id), on))) load(); };
  return (
    <>
      <Notice notice={notice} />
      <section className="panel">
        <div className="section-head">
          <h2>{kind === 'sources' ? t('admin.nav.sources') : t('admin.nav.plans')}</h2>
          <button type="button" className="btn solid compact" onClick={() => open(null)}><Plus size={14} aria-hidden="true" /> {t('admin.create')}</button>
        </div>
        {!items ? <Skeleton lines={4} title={false} /> : (
          <div className="table-scroll" tabIndex={0}>
            <table className="data-table">
              <thead><tr><th scope="col">{t('admin.fieldTitle')}</th><th scope="col">{kind === 'sources' ? 'URL' : t('admin.weeks')}</th><th scope="col">{t('admin.status')}</th><th scope="col" /></tr></thead>
              <tbody>
                {items.map((row) => (
                  <tr key={str(row.id)}>
                    <th scope="row">{str(row.title)}</th>
                    <td className="wrap">{kind === 'sources' ? str(row.url) : str(rows(row.normalized_weeks).length)}</td>
                    <td><Status value={row.status} /></td>
                    <td className="row-actions">
                      <button type="button" className="btn ghost compact" onClick={() => open(row)}>{t('admin.edit')}</button>
                      <button type="button" className="btn ghost compact" onClick={() => void publish(row, row.status !== 'published')}>{row.status === 'published' ? t('admin.unpublish') : t('admin.publish')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {editing ? (
        <section className="panel form-panel">
          <h2>{editing.id ? t('admin.edit') : t('admin.create')}</h2>
          <Field label={t('admin.json')}><textarea className="code-input" rows={20} value={text} onChange={(e) => setText(e.target.value)} /></Field>
          <div className="hero-actions">
            <button type="button" className="btn solid" onClick={() => void save()}><Save size={15} aria-hidden="true" /> {t('common.save')}</button>
            <button type="button" className="btn ghost" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
          </div>
        </section>
      ) : null}
    </>
  );
};

const Analytics = () => {
  const t = useT();
  const { api, token, run, notice } = useAdmin();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Json | null>(null);
  useEffect(() => { void run(() => api.analytics(token, days)).then((r) => r && setData(r)); }, [api, days, run, token]);
  const totals = (data?.totals ?? {}) as Record<string, number>;
  return (
    <>
      <Notice notice={notice} />
      <section className="panel">
        <div className="section-head">
          <h2>{t('admin.nav.analytics')}</h2>
          <select aria-label={t('admin.window')} value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 30, 90, 365].map((d) => <option key={d} value={d}>{t('admin.days', { count: d })}</option>)}</select>
        </div>
        {!data ? <Skeleton lines={4} title={false} /> : (
          <>
            <p>{t('admin.analyticsSummary', { events: Number(data.total_events ?? 0), learners: Number(data.signed_in_learners ?? 0), anon: Number(data.anonymous_events ?? 0) })}</p>
            <div className="table-scroll" tabIndex={0}>
              <table className="data-table">
                <thead><tr><th scope="col">{t('admin.event')}</th><th scope="col">{t('admin.count')}</th></tr></thead>
                <tbody>{Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([name, count]) => <tr key={name}><th scope="row">{name}</th><td>{count}</td></tr>)}</tbody>
              </table>
            </div>
            <h3>{t('admin.topPages')}</h3>
            <ol className="plain-list">{rows(data.top_pages).map((p) => <li key={str(p.page_id)}>{str(p.title ?? p.slug ?? p.page_id)} · {str(p.events)}</li>)}</ol>
          </>
        )}
      </section>
    </>
  );
};

const PreviewDiagnostic = () => {
  const t = useT();
  const { api, token, run, notice } = useAdmin();
  const [text, setText] = useState(pretty({ target_total_score: 1400, current_section_scores: { reading_writing: 620, math: 560 }, deadline_date: null }));
  const [result, setResult] = useState<Json | null>(null);
  const go = async () => { const r = await run(() => api.previewDiagnostic(token, parseJson(text))); if (r) setResult(r.diagnostic); };
  return (
    <>
      <Notice notice={notice} />
      <section className="panel form-panel">
        <h2>{t('admin.nav.preview')}</h2>
        <p className="muted-note">{t('admin.previewDiagHint')}</p>
        <Field label={t('admin.profileJson')}><textarea className="code-input" rows={8} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <button type="button" className="btn solid" onClick={() => void go()}>{t('diag.run')}</button>
        {result ? <pre className="code-output">{pretty(result)}</pre> : null}
      </section>
    </>
  );
};

export const AdminPage = ({ section }: { section: AdminSection }) => {
  const t = useT();
  const { config } = usePlaybook();
  return (
    <Shell>
      <section className="page-header">
        <div>
          <p className="eyebrow">{t('admin.eyebrow')}</p>
          <h1>{t('admin.title', { service: config.serviceName })}</h1>
        </div>
      </section>
      <nav className="tab-row admin-tabs" aria-label={t('admin.eyebrow')}>
        {NAV.map((item) => <NavLink key={item.to} to={item.to} end className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>{t(item.key)}</NavLink>)}
      </nav>
      {section === 'overview' ? <Overview /> : null}
      {section === 'pages' ? <PagesList /> : null}
      {section === 'page' ? <PageEditor /> : null}
      {section === 'sources' ? <SimpleRows kind="sources" /> : null}
      {section === 'plans' ? <SimpleRows kind="plans" /> : null}
      {section === 'analytics' ? <Analytics /> : null}
      {section === 'preview' ? <PreviewDiagnostic /> : null}
    </Shell>
  );
};

