import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Lock, Plus, ShieldAlert, X } from 'lucide-react';
import { CREDIT_PRICES, SWITCH_KEY_PATTERN } from '../../../../../packages/ai-core/src/mod.ts';
import { ApiError } from '../api.ts';
import { signInUrl } from '../auth.tsx';
import { useT } from '../i18n/index.ts';
import { ApiErrorState } from '../states.tsx';
import { Button, ButtonLink, Card, TextInput } from '../ui.tsx';

// Building blocks shared by the admin console's sections.

/** Loads once and on demand; errors are kept for AdminError. */
export function useAdminLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({ data: null, error: null, loading: true });
  const run = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }));
    load().then((data) => setState({ data, error: null, loading: false })).catch((error) => setState({ data: null, error, loading: false }));
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run, set: (data: T) => setState({ data, error: null, loading: false }) };
}

/** Admin refusals (no permission, MFA needed) as their own states; anything else as usual. */
export function AdminError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT();
  if (error instanceof ApiError && error.code === 'mfa_required') return <Card className="bg-amber-50">
    <p className="m-0 inline-flex items-center gap-2 font-display text-lg font-bold"><ShieldAlert size={18} aria-hidden="true"/>{t('admin.mfa.title')}</p>
    <p className="mb-4 mt-2 text-sm text-gray-700">{t('admin.mfa.lead')}</p>
    <ButtonLink href={signInUrl('login')}>{t('admin.mfa.signIn')}</ButtonLink>
  </Card>;
  if (error instanceof ApiError && (error.status === 403 || ['admin_required', 'forbidden'].includes(error.code))) return <Card>
    <p className="m-0 inline-flex items-center gap-2 font-display text-lg font-bold"><Lock size={18} aria-hidden="true"/>{t('admin.denied.title')}</p>
    <p className="m-0 mt-2 text-sm text-gray-700">{t('admin.denied.lead')}</p>
  </Card>;
  return <ApiErrorState error={error} onRetry={onRetry}/>;
}

export const Section = ({ title, lead, children, actions }: { title: ReactNode; lead?: ReactNode; children: ReactNode; actions?: ReactNode }) =>
  <Card className="mb-4">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h2 className="m-0 font-display text-xl font-bold">{title}</h2>{lead && <p className="mb-0 mt-1 max-w-3xl text-sm text-gray-700">{lead}</p>}</div>
      {actions}
    </div>
    {children}
  </Card>;

export const Notice = ({ children }: { children: ReactNode }) => <p role="status" className="mb-4 rounded-2xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{children}</p>;
export const selectClass = 'min-h-11 w-full rounded-2xl border border-navy-line bg-white px-3 text-sm text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy';

/** Areas and features that can be switched off, from the price table. */
const SWITCH_SUGGESTIONS = [...new Set(Object.keys(CREDIT_PRICES).flatMap((key) => [key.split('.')[0], key]))].sort();

/** An editor for a switches object: listed keys with on/off, plus adding a key. Unlisted keys are on. */
export function SwitchesEditor({ value, onChange, disabled }: { value: Record<string, boolean>; onChange(next: Record<string, boolean>): void; disabled?: boolean }) {
  const t = useT();
  const [key, setKey] = useState('');
  const add = (event: FormEvent) => {
    event.preventDefault();
    const clean = key.trim().toLowerCase();
    if (!SWITCH_KEY_PATTERN.test(clean)) return;
    onChange({ ...value, [clean]: false });
    setKey('');
  };
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return <div>
    {entries.length > 0 && <ul className="m-0 mb-3 grid list-none gap-2 p-0 sm:grid-cols-2">{entries.map(([name, on]) => <li key={name} className="flex items-center gap-2 rounded-2xl border border-navy-line/25 bg-white px-3 py-2">
      <code className="min-w-0 flex-1 truncate text-sm">{name}</code>
      <label className="inline-flex items-center gap-2 text-xs font-semibold">
        <input type="checkbox" checked={on} disabled={disabled} onChange={(event) => onChange({ ...value, [name]: event.target.checked })} className="h-4 w-4"/>{t(on ? 'admin.on' : 'admin.off')}
      </label>
      <button type="button" disabled={disabled} onClick={() => { const next = { ...value }; delete next[name]; onChange(next); }} aria-label={`${t('admin.service.remove')} ${name}`}
        className="rounded-full p-1 text-gray-600 hover:bg-cream"><X size={14} aria-hidden="true"/></button>
    </li>)}</ul>}
    <form onSubmit={add} className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1 text-xs font-semibold text-gray-700">{t('admin.service.addSwitch')}
        <TextInput list="schood-ai-switch-keys" value={key} onChange={(event) => setKey(event.target.value)} disabled={disabled} maxLength={63} placeholder="tutor or tutor.reply" className="mt-1"/>
      </label>
      <datalist id="schood-ai-switch-keys">{SWITCH_SUGGESTIONS.map((entry) => <option key={entry} value={entry}/>)}</datalist>
      <Button type="submit" variant="secondary" disabled={disabled || !SWITCH_KEY_PATTERN.test(key.trim().toLowerCase())} icon={<Plus size={14} aria-hidden="true"/>}>{t('admin.add')}</Button>
    </form>
  </div>;
}
