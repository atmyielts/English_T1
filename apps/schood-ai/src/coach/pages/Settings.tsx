import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { ApiErrorState, Button, Card, Dialog, Field, useSession, useT } from '../../core/index.ts';
import { coachApi, type CoachCard, type CoachSettings } from '../api.ts';
import { CoachFrame, Loaded, useLoad } from '../ui.tsx';
import { SignedOut } from './common.tsx';

// /coach/<pack>/settings: language, reminder time and time zone (never in quiet
// hours), correction mode, spoken replies, explanation language, and deleting the
// practice history of this coach.

const TIMES = ['08:00', '09:30', '12:30', '15:00', '18:00', '19:30', '21:00'];
const ZONES = ['Asia/Tashkent', 'Asia/Samarkand', 'Asia/Almaty', 'Asia/Bishkek', 'Asia/Dushanbe', 'Europe/Moscow', 'Europe/Istanbul', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'Asia/Seoul'];
const LANGUAGES: Record<string, string> = { uz: 'O‘zbek', ru: 'Русский', en: 'English' };

export function CoachSettingsPage({ params }: { params: Record<string, string> }) {
  const session = useSession();
  if (session.status !== 'signed_in') return <SignedOut pack={params.pack}/>;
  return <SettingsBody pack={params.pack}/>;
}

function SettingsBody({ pack }: { pack: string }) {
  const state = useLoad(() => coachApi.dashboard(pack), [pack]);
  return <Loaded state={state}>{(data) => <CoachFrame pack={pack} name={data.coach.name} accent={data.coach.accent}>
    <SettingsForm pack={pack} coach={data.coach} settings={data.enrollment.settings} locale={data.enrollment.locale}/>
  </CoachFrame>}</Loaded>;
}

function SettingsForm({ pack, coach, settings, locale }: { pack: string; coach: CoachCard; settings: CoachSettings; locale: string }) {
  const t = useT();
  const detected = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'Asia/Tashkent'; } })();
  const zones = [...new Set([settings.timeZone ?? 'Asia/Tashkent', detected, ...ZONES])].filter((zone) => /^[A-Za-z_]+\/[A-Za-z_]+$/.test(zone));
  const [form, setForm] = useState({ locale, reminder: settings.reminder ?? '', time_zone: settings.timeZone ?? 'Asia/Tashkent', correction: settings.correction ?? 'gentle', voice: settings.voice !== false, explain: settings.explain ?? 'ui' });
  const [status, setStatus] = useState<{ busy: boolean; error: unknown; saved: boolean }>({ busy: false, error: null, saved: false });
  const [erase, setErase] = useState<{ open: boolean; done: number | null }>({ open: false, done: null });
  const save = async () => {
    setStatus({ busy: true, error: null, saved: false });
    try {
      await coachApi.settings(pack, { locale: form.locale, reminder: form.reminder || null, time_zone: form.time_zone, voice: form.voice, explain: form.explain, ...(coach.correction_modes.length ? { correction: form.correction } : {}) });
      setStatus({ busy: false, error: null, saved: true });
    } catch (error) { setStatus({ busy: false, error, saved: false }); }
  };
  const select = 'min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm';
  return <>
    <Card className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t('coach.settings.language')}>{(id) => <select id={id} className={select} value={form.locale} onChange={(event) => setForm({ ...form, locale: event.target.value })}>
          {coach.languages.map((code) => <option key={code} value={code}>{LANGUAGES[code] ?? code}</option>)}
        </select>}</Field>
        <Field label={t('coach.settings.reminder')} hint={t('coach.settings.reminderHint')}>{(id) => <select id={id} className={select} value={form.reminder} onChange={(event) => setForm({ ...form, reminder: event.target.value })}>
          <option value="">{t('coach.settings.noReminder')}</option>
          {TIMES.map((time) => <option key={time} value={time}>{time}</option>)}
        </select>}</Field>
        <Field label={t('coach.settings.timeZone')}>{(id) => <select id={id} className={select} value={form.time_zone} onChange={(event) => setForm({ ...form, time_zone: event.target.value })}>
          {zones.map((zone) => <option key={zone} value={zone}>{zone.replace('_', ' ')}</option>)}
        </select>}</Field>
        {coach.correction_modes.length > 0 && <Field label={t('coach.settings.correction')}>{(id) => <select id={id} className={select} value={form.correction} onChange={(event) => setForm({ ...form, correction: event.target.value as 'gentle' | 'strict' })}>
          <option value="gentle">{t('coach.settings.gentle')}</option>
          <option value="strict">{t('coach.settings.strict')}</option>
        </select>}</Field>}
        <Field label={t('coach.settings.explain')}>{(id) => <select id={id} className={select} value={form.explain} onChange={(event) => setForm({ ...form, explain: event.target.value as 'ui' | 'en' })}>
          <option value="ui">{t('coach.settings.explainUi')}</option>
          <option value="en">{t('coach.settings.explainEn')}</option>
        </select>}</Field>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-gray-800">
          <input type="checkbox" className="h-5 w-5" checked={form.voice} onChange={(event) => setForm({ ...form, voice: event.target.checked })}/>
          {t('coach.settings.voice')}
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void save()} disabled={status.busy}>{status.busy ? t('coach.saving') : t('coach.settings.save')}</Button>
        {status.saved && <span role="status" className="text-sm text-gray-700">{t('coach.saved')}</span>}
      </div>
      {status.error !== null && <ApiErrorState error={status.error}/>}
    </Card>
    <Card className="flex flex-col gap-3">
      <h2 className="m-0 font-display text-lg font-bold">{t('coach.settings.data')}</h2>
      <p className="m-0 text-sm leading-6 text-gray-700">{t('coach.settings.dataLead')}</p>
      <div><Button variant="danger" onClick={() => setErase({ open: true, done: null })} icon={<Trash2 size={16} aria-hidden="true"/>}>{t('coach.settings.erase')}</Button></div>
      {erase.done !== null && <p role="status" className="m-0 text-sm text-gray-700">{t('coach.settings.erased', { count: erase.done })}</p>}
    </Card>
    <Dialog open={erase.open} title={t('coach.settings.eraseTitle')} closeLabel={t('coach.close')} onClose={() => setErase({ ...erase, open: false })}>
      <p className="mt-0 text-sm leading-6 text-gray-700">{t('coach.settings.eraseLead')}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" onClick={async () => { try { const result = await coachApi.erase(pack); setErase({ open: false, done: result.removed }); } catch (error) { setErase({ open: false, done: null }); setStatus({ busy: false, error, saved: false }); } }}>{t('coach.settings.eraseConfirm')}</Button>
        <Button variant="secondary" onClick={() => setErase({ ...erase, open: false })}>{t('coach.cancel')}</Button>
      </div>
    </Dialog>
  </>;
}
