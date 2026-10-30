import { useEffect, useState } from 'react';
import { BellRing, Save, ShieldCheck } from 'lucide-react';
import { Button, Card, Eyebrow, Field, Link, TextInput } from '../../core/index.ts';
import { useT } from '../i18n/lazy.ts';
import { useAction, useEngage, type Settings } from '../api.ts';
import { EngageError, Loaded, Notice, Page, selectClass } from '../ui.tsx';

// /progress/settings: the person's age (set once; unknown means the under-18
// protections), boards, the league, an optional daily time limit, regions and schools
// for boards, and offers. When messages come, how many, where and which kinds are core's
// Settings → Notifications (core/notify-prefs), linked from here.

interface SettingsView { settings: Settings; regions: string[]; daily_limit_choices: number[]; level_bands: string[] }

function Form({ view, onSaved }: { view: SettingsView; onSaved: (next: SettingsView['settings']) => void }) {
  const t = useT(), action = useAction();
  const s = view.settings;
  const [form, setForm] = useState({ ...s, school: s.school ?? '' });
  const [birth, setBirth] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { setForm({ ...s, school: s.school ?? '' }); }, [s]);
  const save = async () => {
    setSaved(false);
    const body: Record<string, unknown> = {
      region: form.region || null, school: form.school.trim() || null,
      leaderboard: form.leaderboard, league_opt_out: form.league_opt_out, offers_muted: form.offers_muted, level_band: form.level_band,
      ...(s.limit_set_by === 'parent' ? {} : { daily_limit_minutes: form.daily_limit_minutes }),
      ...(birth ? { birth_date: birth } : {}),
    };
    const result = await action.run<{ settings: Settings }>('settings', body);
    if (result) { onSaved(result.settings); setBirth(''); setSaved(true); }
  };
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));
  return <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
    <Card className="flex flex-col gap-4">
      <Eyebrow icon={<BellRing size={14} aria-hidden="true"/>}>{t('engage.settings.messages')}</Eyebrow>
      <p className="m-0 text-sm leading-6 text-gray-700">{t('engage.settings.messagesNow', { hour: `${String(s.notify_hour).padStart(2, '0')}:00`, zone: s.time_zone.replace('_', ' ') })}</p>
      <Link to="/settings" className="inline-flex min-h-11 w-fit items-center rounded-full border border-navy-line/40 bg-white px-4 text-sm font-semibold text-gray-900 no-underline hover:bg-cream-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy">{t('engage.settings.messagesOpen')}</Link>
    </Card>

    <Card className="flex flex-col gap-4">
      <Eyebrow icon={<ShieldCheck size={14} aria-hidden="true"/>}>{t('engage.settings.age')}</Eyebrow>
      {s.age_known ? <p className="m-0 text-sm text-gray-700">{s.adult ? t('engage.settings.ageAdult') : t('engage.settings.ageMinor')}</p>
        : <>
          <Notice>{t('engage.settings.ageUnknown')}</Notice>
          <Field label={t('engage.settings.birth')} hint={t('engage.settings.birthHint')}>{(id) => <TextInput id={id} type="date" value={birth} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setBirth(event.target.value)}/>}</Field>
        </>}
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1 text-sm font-semibold text-gray-800">{t('engage.settings.boards')}</legend>
        {(['masked', 'hidden', 'public'] as const).filter((value) => value !== 'public' || s.adult).map((value) => <label key={value} className="flex items-start gap-2 text-sm">
          <input type="radio" name="leaderboard" value={value} checked={form.leaderboard === value} onChange={() => set('leaderboard', value)} className="mt-1"/>
          <span>{t(`engage.settings.boards.${value}`)}</span>
        </label>)}
        {!s.adult && <p className="m-0 text-xs text-gray-600">{t('engage.settings.boardsMinor')}</p>}
      </fieldset>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={form.league_opt_out} onChange={(event) => set('league_opt_out', event.target.checked)} className="mt-1"/><span>{t('engage.settings.leagueOut')}</span></label>
      <Field label={t('engage.settings.limit')} hint={s.limit_set_by === 'parent' ? t('engage.settings.limitParent') : t('engage.settings.limitHint')}>{(id) => <select id={id} className={selectClass} disabled={s.limit_set_by === 'parent'}
        value={form.daily_limit_minutes ?? ''} onChange={(event) => set('daily_limit_minutes', event.target.value ? Number(event.target.value) : null)}>
        <option value="">{t('engage.settings.noLimit')}</option>
        {view.daily_limit_choices.map((minutes) => <option key={minutes} value={minutes}>{t('engage.settings.minutes', { count: minutes })}</option>)}
      </select>}</Field>
    </Card>

    <Card className="flex flex-col gap-4">
      <Eyebrow>{t('engage.settings.where')}</Eyebrow>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('engage.settings.region')}>{(id) => <select id={id} className={selectClass} value={form.region ?? ''} onChange={(event) => set('region', event.target.value || null)}>
          <option value="">{t('engage.settings.none')}</option>
          {view.regions.map((region) => <option key={region} value={region}>{t(`engage.region.${region}`)}</option>)}
        </select>}</Field>
        <Field label={t('engage.settings.school')} hint={t('engage.settings.schoolHint')}>{(id) => <TextInput id={id} value={form.school} maxLength={80} onChange={(event) => set('school', event.target.value)}/>}</Field>
        <Field label={t('engage.settings.level')} hint={t('engage.settings.levelHint')}>{(id) => <select id={id} className={selectClass} value={form.level_band} onChange={(event) => set('level_band', event.target.value)}>
          {view.level_bands.map((band) => <option key={band} value={band}>{t(`engage.band.${band}`)}</option>)}
        </select>}</Field>
      </div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={form.offers_muted} onChange={(event) => set('offers_muted', event.target.checked)} className="mt-1"/><span>{t('engage.settings.offers')}</span></label>
    </Card>
    {action.error !== null && <EngageError error={action.error}/>}
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={action.busy !== null} icon={<Save size={16} aria-hidden="true"/>}>{t('engage.settings.save')}</Button>
      {saved && <span role="status" className="text-sm text-gray-700">{t('engage.settings.saved')}</span>}
    </div>
  </form>;
}

export function SettingsPage() {
  const t = useT();
  const view = useEngage<SettingsView>('settings');
  return <Page title={t('engage.settings.title')} lead={t('engage.settings.lead')}>
    <Loaded {...view}>{(data) => <Form view={data} onSaved={(settings) => view.setData({ ...data, settings })}/>}</Loaded>
  </Page>;
}
