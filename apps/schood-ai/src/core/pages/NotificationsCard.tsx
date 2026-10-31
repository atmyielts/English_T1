import { useEffect, useState, type FormEvent } from 'react';
import { BellRing } from 'lucide-react';
import { api } from '../api.ts';
import { useT } from '../i18n/index.ts';
import { ApiErrorState, LoadingState } from '../states.tsx';
import { Button, Card } from '../ui.tsx';

// Settings → Notifications (core/notify-prefs): the person's own time zone, quiet
// hours, how many messages a day (0 to 2 across every bot), the best hour, where
// to send them, and which kinds of message they get (each area registers its kinds).

interface Prefs { time_zone: string; quiet_start: number; quiet_end: number; daily_limit: number; preferred_hour: number | null; delivery: ('telegram' | 'web')[]; muted: string[] }
interface Kind { key: string; area: string; label: string }
const ZONES = ['Asia/Tashkent', 'Asia/Samarkand', 'Asia/Almaty', 'Asia/Bishkek', 'Asia/Dushanbe', 'Asia/Ashgabat', 'Asia/Baku', 'Europe/Moscow', 'Europe/Istanbul', 'Asia/Dubai', 'Asia/Seoul', 'Europe/London', 'America/New_York'];
const browserZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return null; } };
const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
const selectClass = 'min-h-11 w-full rounded-2xl border border-navy-line bg-white px-3 text-sm text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy';

export function NotificationsCard() {
  const t = useT();
  const [prefs, setPrefs] = useState<Prefs | null>(null), [kinds, setKinds] = useState<Kind[]>([]);
  const [state, setState] = useState<{ busy: boolean; error: unknown; saved: boolean }>({ busy: false, error: null, saved: false });
  useEffect(() => {
    api<{ prefs: Prefs; kinds: Kind[] }>('core/notify-prefs').then((data) => { setPrefs(data.prefs); setKinds(data.kinds); }).catch((error) => setState({ busy: false, error, saved: false }));
  }, []);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!prefs) return;
    setState({ busy: true, error: null, saved: false });
    try {
      const data = await api<{ prefs: Prefs; kinds: Kind[] }>('core/notify-prefs', { method: 'PUT', body: prefs });
      setPrefs(data.prefs);
      setState({ busy: false, error: null, saved: true });
    } catch (error) { setState({ busy: false, error, saved: false }); }
  };
  const zones = [...new Set([prefs?.time_zone, browserZone(), ...ZONES].filter((zone): zone is string => !!zone))];
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const set = (patch: Partial<Prefs>) => { setPrefs(prefs ? { ...prefs, ...patch } : prefs); setState({ busy: false, error: null, saved: false }); };
  const toggle = <T extends string>(list: T[], value: T, on: boolean) => (on ? [...new Set([...list, value])] : list.filter((entry) => entry !== value));
  return <Card className="mb-6">
    <h2 className="m-0 inline-flex items-center gap-2 font-display text-xl font-bold"><BellRing size={18} aria-hidden="true"/>{t('notify.title')}</h2>
    <p className="m-0 mt-2 text-sm text-gray-700">{t('notify.lead')}</p>
    {state.error !== null && !prefs ? <div className="mt-4"><ApiErrorState error={state.error}/></div> : !prefs ? <LoadingState/> :
      <form onSubmit={(event) => void save(event)} className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-semibold text-gray-800">{t('notify.zone')}
          <select className={selectClass} value={prefs.time_zone} onChange={(event) => set({ time_zone: event.target.value })}>{zones.map((zone) => <option key={zone} value={zone}>{zone.replace(/_/g, ' ')}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-gray-800">{t('notify.preferred')}
          <select className={selectClass} value={prefs.preferred_hour ?? ''} onChange={(event) => set({ preferred_hour: event.target.value === '' ? null : Number(event.target.value) })}>
            <option value="">{t('notify.anyTime')}</option>{hours.map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
          </select>
        </label>
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-1 text-sm font-semibold text-gray-800">{t('notify.quiet')}</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-gray-700">{t('notify.quietFrom')}
              <select className={selectClass} value={prefs.quiet_start} onChange={(event) => set({ quiet_start: Number(event.target.value) })}>{hours.map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}</select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-700">{t('notify.quietTo')}
              <select className={selectClass} value={prefs.quiet_end} onChange={(event) => set({ quiet_end: Number(event.target.value) })}>{hours.map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}</select>
            </label>
          </div>
        </fieldset>
        <label className="flex flex-col gap-1 text-sm font-semibold text-gray-800">{t('notify.daily')}
          <select className={selectClass} value={prefs.daily_limit} onChange={(event) => set({ daily_limit: Number(event.target.value) })}>
            <option value={0}>{t('notify.dailyNone')}</option><option value={1}>1</option><option value={2}>2</option>
          </select>
        </label>
        <fieldset className="m-0 border-0 p-0 md:col-span-2">
          <legend className="mb-1 text-sm font-semibold text-gray-800">{t('notify.delivery')}</legend>
          <div className="flex flex-wrap gap-4">{(['telegram', 'web'] as const).map((channel) => <label key={channel} className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={prefs.delivery.includes(channel)} onChange={(event) => set({ delivery: toggle(prefs.delivery, channel, event.target.checked) })}/>{t(`notify.${channel}`)}
          </label>)}</div>
        </fieldset>
        <fieldset className="m-0 border-0 p-0 md:col-span-2">
          <legend className="mb-1 text-sm font-semibold text-gray-800">{t('notify.kinds')}</legend>
          {!kinds.length ? <p className="m-0 text-sm text-gray-600">{t('notify.noKinds')}</p> :
            <div className="grid gap-2 sm:grid-cols-2">{kinds.map((kind) => {
              const muted = prefs.muted.includes(kind.key) || prefs.muted.includes(kind.key.split('.')[0]);
              return <label key={kind.key} className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={!muted} onChange={(event) => set({ muted: event.target.checked ? prefs.muted.filter((entry) => entry !== kind.key && entry !== kind.key.split('.')[0]) : toggle(prefs.muted, kind.key, true) })}/>
                {kind.label}
              </label>;
            })}</div>}
        </fieldset>
        {state.error !== null && <div className="md:col-span-2"><ApiErrorState error={state.error}/></div>}
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <Button type="submit" disabled={state.busy}>{t('notify.save')}</Button>
          {state.saved && <span role="status" className="text-sm text-green-800">{t('notify.saved')}</span>}
        </div>
      </form>}
  </Card>;
}
