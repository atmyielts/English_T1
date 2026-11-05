import { useEffect, useState } from 'react';
import { BriefcaseBusiness, Search, ShieldCheck, UserRoundX } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Eyebrow, Field, TextInput, useI18n } from '../../core/index.ts';
import { useT } from '../i18n/lazy.ts';
import { useAction, useEngage, engageCall } from '../api.ts';
import { EngageError, Loaded, Notice, Page, selectClass, chip } from '../ui.tsx';

// /talent (E13, later stage, switched off until the owner turns it on): an explicit,
// versioned opt-in for adults to be found by employers, universities and centres
// through their Skill Passport; withdrawal at any time; who looked is visible. Employers
// granted by Schood search here, and every search and view is written to the audit trail.

interface TalentView {
  enabled: boolean; consent_version: string; eligible: boolean; age_known: boolean; skills: string[]; open_to: string[]; regions: string[];
  profile: { opted_in: boolean; consented_at: string | null; withdrawn_at: string | null; headline: string | null; skills: string[]; open_to: string[]; regions: string[]; passport_link_id: string | null } | null;
  seen_by: { organisation: string; action: string; at: string }[];
  employer: { organisation: string; kind: string; active_until: string | null } | null;
}
interface Result { candidate: string; headline: string | null; skills: string[]; open_to: string[]; regions: string[]; has_passport: boolean }

function Toggle({ values, chosen, label, onChange, render }: { values: string[]; chosen: string[]; label: string; onChange: (next: string[]) => void; render: (value: string) => string }) {
  return <fieldset className="m-0 border-0 p-0"><legend className="mb-2 text-sm font-semibold">{label}</legend>
    <div className="flex flex-wrap gap-2">{values.map((value) => <button key={value} type="button" aria-pressed={chosen.includes(value)} className={chip(chosen.includes(value))}
      onClick={() => onChange(chosen.includes(value) ? chosen.filter((entry) => entry !== value) : [...chosen, value])}>{render(value)}</button>)}</div>
  </fieldset>;
}

function Employer({ view }: { view: TalentView }) {
  const t = useT();
  const [filter, setFilter] = useState({ skill: '', region: '', open_to: '' });
  const [results, setResults] = useState<Result[] | null>(null);
  const [candidate, setCandidate] = useState<{ candidate: { headline: string | null; display_name: string | null }; items: { title: string; verified: boolean; verify_url: string | null }[] } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const search = async () => {
    setError(null);
    try { setResults((await engageCall<{ results: Result[] }>('talent-search', { query: Object.fromEntries(Object.entries(filter).filter(([, value]) => value)) })).results); } catch (cause) { setError(cause); }
  };
  const open = async (key: string) => { try { setCandidate(await engageCall('talent-candidate', { query: { candidate: key } })); } catch (cause) { setError(cause); } };
  return <Card className="flex flex-col gap-3">
    <Eyebrow icon={<Search size={14} aria-hidden="true"/>}>{t('engage.talent.search', { organisation: view.employer!.organisation })}</Eyebrow>
    <form className="grid gap-3 sm:grid-cols-4" onSubmit={(event) => { event.preventDefault(); void search(); }}>
      <Field label={t('engage.talent.skill')}>{(id) => <select id={id} className={selectClass} value={filter.skill} onChange={(event) => setFilter({ ...filter, skill: event.target.value })}><option value="">{t('engage.talent.any')}</option>{view.skills.map((skill) => <option key={skill} value={skill}>{t(`engage.talent.skill.${skill}`)}</option>)}</select>}</Field>
      <Field label={t('engage.settings.region')}>{(id) => <select id={id} className={selectClass} value={filter.region} onChange={(event) => setFilter({ ...filter, region: event.target.value })}><option value="">{t('engage.talent.any')}</option>{view.regions.map((region) => <option key={region} value={region}>{t(`engage.region.${region}`)}</option>)}</select>}</Field>
      <Field label={t('engage.talent.openTo')}>{(id) => <select id={id} className={selectClass} value={filter.open_to} onChange={(event) => setFilter({ ...filter, open_to: event.target.value })}><option value="">{t('engage.talent.any')}</option>{view.open_to.map((value) => <option key={value} value={value}>{t(`engage.talent.open.${value}`)}</option>)}</select>}</Field>
      <div className="flex items-end"><Button type="submit">{t('engage.talent.find')}</Button></div>
    </form>
    <p className="m-0 text-xs text-gray-600">{t('engage.talent.audited')}</p>
    {error !== null && <EngageError error={error}/>}
    {results && (results.length ? <ul className="m-0 flex list-none flex-col gap-2 p-0">{results.map((result) => <li key={result.candidate} className="flex flex-wrap items-center gap-2 rounded-2xl border border-navy-line/30 bg-white p-3 text-sm">
      <span className="min-w-0 flex-1"><span className="font-semibold">{result.headline ?? t('engage.talent.noHeadline')}</span><br/><span className="text-gray-600">{result.skills.map((skill) => t(`engage.talent.skill.${skill}`)).join(', ')}</span></span>
      {result.has_passport && <Button size="sm" variant="secondary" onClick={() => void open(result.candidate)}>{t('engage.talent.view')}</Button>}
    </li>)}</ul> : <EmptyState title={t('engage.talent.noResults')}/>)}
    {candidate && <Card className="flex flex-col gap-2 bg-cream-soft">
      <p className="m-0 font-semibold">{candidate.candidate.display_name ?? candidate.candidate.headline}</p>
      <ul className="m-0 list-disc pl-5 text-sm">{candidate.items.map((item, index) => <li key={index}>{item.title}{item.verified ? ` · ${t('engage.passport.verified')}` : ''}{item.verify_url && <> · <a href={item.verify_url} target="_blank" rel="noopener noreferrer" className="underline">{t('engage.passport.check')}</a></>}</li>)}</ul>
    </Card>}
  </Card>;
}

export function TalentPage() {
  const t = useT(), { date } = useI18n(), action = useAction();
  const view = useEngage<TalentView>('talent');
  const passport = useEngage<{ links: { id: string; label: string; revoked: boolean; expired: boolean }[] }>('passport');
  const [form, setForm] = useState({ headline: '', skills: [] as string[], open_to: [] as string[], regions: [] as string[], passport_link_id: '' });
  const [agree, setAgree] = useState(false);
  useEffect(() => { const p = view.data?.profile; if (p) setForm({ headline: p.headline ?? '', skills: p.skills, open_to: p.open_to, regions: p.regions, passport_link_id: p.passport_link_id ?? '' }); }, [view.data]);
  const apply = (next: TalentView | null) => { if (next) view.setData(next); };
  return <Page eyebrow={<Eyebrow icon={<BriefcaseBusiness size={14} aria-hidden="true"/>}>{t('engage.talent.eyebrow')}</Eyebrow>} title={t('engage.talent.title')} lead={t('engage.talent.lead')}>
    <Loaded {...view}>{(data) => <>
      {!data.enabled && <Notice>{t('engage.talent.off')}</Notice>}
      {data.employer && data.enabled && <Employer view={data}/>}
      {data.profile?.opted_in ? <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><Badge tone="lime"><ShieldCheck size={12} aria-hidden="true"/>{t('engage.talent.in', { date: date(data.profile.consented_at!, { dateStyle: 'medium' }) })}</Badge>
          <Button size="sm" variant="danger" disabled={action.busy !== null} onClick={async () => apply(await action.run<TalentView>('talent-withdraw'))} icon={<UserRoundX size={14} aria-hidden="true"/>}>{t('engage.talent.withdraw')}</Button></div>
        <form className="flex flex-col gap-4" onSubmit={async (event) => { event.preventDefault(); apply(await action.run<TalentView>('talent-profile', { headline: form.headline.trim() || null, skills: form.skills, open_to: form.open_to, regions: form.regions, passport_link_id: form.passport_link_id || null })); }}>
          <Field label={t('engage.talent.headline')} hint={t('engage.talent.headlineHint')}>{(id) => <TextInput id={id} maxLength={140} value={form.headline} onChange={(event) => setForm({ ...form, headline: event.target.value })}/>}</Field>
          <Toggle label={t('engage.talent.skills')} values={data.skills} chosen={form.skills} onChange={(skills) => setForm({ ...form, skills })} render={(value) => t(`engage.talent.skill.${value}`)}/>
          <Toggle label={t('engage.talent.openTo')} values={data.open_to} chosen={form.open_to} onChange={(open_to) => setForm({ ...form, open_to })} render={(value) => t(`engage.talent.open.${value}`)}/>
          <Toggle label={t('engage.talent.regions')} values={data.regions} chosen={form.regions} onChange={(regions) => setForm({ ...form, regions: regions.slice(0, 5) })} render={(value) => t(`engage.region.${value}`)}/>
          <Field label={t('engage.talent.passport')} hint={t('engage.talent.passportHint')}>{(id) => <select id={id} className={selectClass} value={form.passport_link_id} onChange={(event) => setForm({ ...form, passport_link_id: event.target.value })}>
            <option value="">{t('engage.talent.noPassport')}</option>{(passport.data?.links ?? []).filter((link) => !link.revoked && !link.expired).map((link) => <option key={link.id} value={link.id}>{link.label}</option>)}
          </select>}</Field>
          <div><Button type="submit" disabled={action.busy !== null || !data.enabled}>{t('engage.save')}</Button></div>
        </form>
        {data.seen_by.length > 0 && <div className="flex flex-col gap-1"><Eyebrow>{t('engage.talent.seen')}</Eyebrow>
          <ul className="m-0 list-none p-0 text-sm">{data.seen_by.map((row, index) => <li key={index}>{row.organisation} · {date(row.at, { dateStyle: 'medium' })}</li>)}</ul></div>}
      </Card> : <Card className="flex flex-col gap-3">
        {!data.eligible ? <Notice>{data.age_known ? t('engage.talent.under18') : t('engage.talent.ageUnknown')}</Notice> : <>
          <p className="m-0 text-sm text-gray-800">{t('engage.talent.consentText')}</p>
          <ul className="m-0 list-disc pl-5 text-sm text-gray-800"><li>{t('engage.talent.consent.what')}</li><li>{t('engage.talent.consent.who')}</li><li>{t('engage.talent.consent.audit')}</li><li>{t('engage.talent.consent.withdraw')}</li></ul>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} className="mt-1"/><span>{t('engage.talent.agree', { version: data.consent_version })}</span></label>
          <div><Button disabled={!agree || !data.enabled || action.busy !== null} onClick={async () => apply(await action.run<TalentView>('talent-consent', { consent: true, version: data.consent_version }))}>{t('engage.talent.optIn')}</Button></div>
        </>}
      </Card>}
      {action.error !== null && <EngageError error={action.error}/>}
    </>}</Loaded>
  </Page>;
}
