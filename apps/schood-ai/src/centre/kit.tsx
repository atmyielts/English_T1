import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Building2, Check, Copy, KeyRound } from 'lucide-react';
import {
  api, ApiError, ApiErrorState, ApproveRunCard, Button, Card, EmptyState, Link, LoadingState, useI18n, useT, useWorkspace,
  type ActionView, type ApiOptions, type Role,
} from '../core/index.ts';

// Building blocks for the centre screens, on top of core's primitives: data
// loading with the workspace, a centre-only gate, tables that turn into cards
// on a phone, toggles, tabs, copy fields and Approve & run lists.

export const MANAGER = ['owner', 'admin'] as const;
export const STAFF = ['owner', 'admin', 'teacher'] as const;
const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy';

export function useCentre() {
  const workspace = useWorkspace();
  const me = workspace.me!;
  const role = me.workspace.role as Role;
  return { workspaceId: workspace.workspaceId, me, role, isCentre: me.workspace.kind === 'centre', manager: role === 'owner' || role === 'admin', staff: role !== 'student' && role !== 'parent', refresh: workspace.refresh };
}

/** `centre/<action>` in the current workspace. */
export function useCentreApi() {
  const { workspaceId } = useCentre();
  return useCallback(<T,>(action: string, options: Omit<ApiOptions, 'workspaceId'> = {}) => api<T>(`centre/${action}`, { ...options, workspaceId }), [workspaceId]);
}

/** Loads a GET route and reloads it on demand. */
export function useLoad<T>(action: string | null, query: Record<string, string | undefined> = {}) {
  const call = useCentreApi();
  const key = JSON.stringify(query);
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({ data: null, error: null, loading: !!action });
  const live = useRef(0);
  const reload = useCallback(async () => {
    if (!action) return;
    const ticket = ++live.current;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await call<T>(action, { query: JSON.parse(key) });
      if (ticket === live.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (ticket === live.current) setState((current) => ({ ...current, error, loading: false }));
    }
  }, [action, key, call]);
  useEffect(() => { void reload(); }, [reload]);
  return { ...state, reload, setData: (data: T) => setState((current) => ({ ...current, data })) };
}

/** Runs one change at a time and keeps its error for the screen. */
export function useSubmit() {
  const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null), [done, setDone] = useState(false);
  const pending = useRef(false);
  const run = useCallback(async <R,>(work: () => Promise<R>): Promise<R | undefined> => {
    if (pending.current) return undefined;
    pending.current = true; setBusy(true); setError(null); setDone(false);
    try { const result = await work(); setDone(true); return result; } catch (cause) { setError(cause); return undefined; } finally { pending.current = false; setBusy(false); }
  }, []);
  return { busy, error, done, run, clear: () => { setError(null); setDone(false); } };
}

/** Shown instead of a centre screen outside a centre workspace, or for a role that cannot use it. */
export function CentreGate({ roles, children }: { roles?: readonly Role[]; children: ReactNode }) {
  const t = useT(), { isCentre, role } = useCentre();
  if (!isCentre) return <Card className="max-w-2xl">
    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-navy-line bg-cream-soft" aria-hidden="true"><Building2 size={18}/></span>
    <h1 className="m-0 mt-3 font-display text-2xl font-bold">{t('centre.gate.title')}</h1>
    <p className="m-0 mt-2 text-sm leading-6 text-gray-700">{t('centre.gate.lead')}</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <Link to="/centre/new" className="inline-flex min-h-11 items-center rounded-full bg-navy px-4 text-sm font-semibold text-white no-underline">{t('centre.gate.create')}</Link>
      <Link to="/join" className="inline-flex min-h-11 items-center rounded-full border border-navy-line bg-white px-4 text-sm font-semibold text-gray-900 no-underline">{t('centre.gate.join')}</Link>
    </div>
  </Card>;
  if (roles && !roles.includes(role)) return <Card className="max-w-xl"><h1 className="m-0 font-display text-xl font-bold">{t('state.role.title')}</h1><p className="m-0 mt-2 text-sm text-gray-700">{t('state.role.lead')}</p></Card>;
  return <>{children}</>;
}

export function Section({ title, lead, actions, children, className = '' }: { title: ReactNode; lead?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  const id = useId();
  return <Card className={className} aria-labelledby={id}>
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h2 id={id} className="m-0 font-display text-lg font-bold text-gray-900">{title}</h2>
        {lead && <p className="m-0 mt-1 max-w-2xl text-sm leading-6 text-gray-700">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
    {children}
  </Card>;
}

export function Stat({ label, value, hint, tone = 'plain' }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: 'plain' | 'warn' | 'good' }) {
  const tones = { plain: 'bg-white/85', warn: 'bg-amber-50', good: 'bg-lime-soft/40' };
  return <div className={`min-w-0 rounded-3xl border border-navy-line p-4 ${tones[tone]}`}>
    <p className="m-0 break-words text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</p>
    <p className="m-0 mt-1 break-words font-display text-2xl font-bold text-gray-900">{value}</p>
    {hint && <p className="m-0 mt-1 text-xs text-gray-600">{hint}</p>}
  </div>;
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange(next: boolean): void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return <div className="flex items-start justify-between gap-4 py-2">
    <div className="min-w-0">
      <label htmlFor={id} className="text-sm font-semibold text-gray-900">{label}</label>
      {description && <p className="m-0 mt-0.5 text-xs leading-5 text-gray-600">{description}</p>}
    </div>
    <button id={id} type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-navy-line transition disabled:opacity-50 ${checked ? 'bg-navy' : 'bg-white'} ${focus}`}>
      <span className={`inline-block h-5 w-5 rounded-full transition ${checked ? 'translate-x-6 bg-lime' : 'translate-x-1 bg-gray-300'}`}/>
    </button>
  </div>;
}

export function Select<V extends string>({ value, onChange, options, label, hint, disabled }: { value: V; onChange: (value: NoInfer<V>) => void; options: { value: NoInfer<V>; label: string }[]; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return <div className="flex min-w-0 flex-col gap-1.5">
    <label htmlFor={id} className="text-sm font-semibold text-gray-800">{label}</label>
    <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as V)} className={`w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 ${focus}`}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    {hint && <p className="m-0 text-xs text-gray-600">{hint}</p>}
  </div>;
}

export function Tabs<K extends string>({ tabs, active, onChange, label }: { tabs: { key: NoInfer<K>; label: string; count?: number }[]; active: K; onChange: (key: NoInfer<K>) => void; label: string }) {
  return <div role="tablist" aria-label={label} className="mb-5 flex gap-1 overflow-x-auto rounded-full border border-navy-line bg-white/80 p-1">
    {tabs.map((tab) => <button key={tab.key} type="button" role="tab" aria-selected={active === tab.key} onClick={() => onChange(tab.key)}
      className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold ${active === tab.key ? 'bg-navy text-white' : 'text-gray-800 hover:bg-cream-soft'} ${focus}`}>
      {tab.label}{tab.count !== undefined && tab.count > 0 && <span className={`ml-2 rounded-full px-2 text-xs ${active === tab.key ? 'bg-white/20' : 'bg-cream-deep'}`}>{tab.count}</span>}
    </button>)}
  </div>;
}

export function CopyField({ value, label, secret = false }: { value: string; label: ReactNode; secret?: boolean }) {
  const t = useT(), id = useId();
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); } };
  return <div className="flex min-w-0 flex-col gap-1.5">
    <label htmlFor={id} className="text-sm font-semibold text-gray-800">{label}</label>
    <div className="flex min-w-0 gap-2">
      <input id={id} readOnly value={value} onFocus={(event) => event.target.select()} className={`min-w-0 flex-1 rounded-xl border border-gray-300 bg-cream-soft px-3 py-2.5 font-mono text-xs text-gray-900 ${focus}`}/>
      <Button variant="secondary" size="sm" onClick={() => void copy()} icon={copied ? <Check size={14} aria-hidden="true"/> : secret ? <KeyRound size={14} aria-hidden="true"/> : <Copy size={14} aria-hidden="true"/>}>{copied ? t('centre.common.copied') : t('centre.common.copy')}</Button>
    </div>
  </div>;
}

export interface Column<R> { key: string; label: ReactNode; render(row: R): ReactNode; className?: string }
/** A table on wide screens and a list of cards on phones. */
export function Table<R>({ rows, columns, rowKey, empty, caption }: { rows: R[]; columns: Column<R>[]; rowKey(row: R): string; empty?: ReactNode; caption?: string }) {
  if (!rows.length) return <EmptyState title={empty}/>;
  return <>
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full border-collapse text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead><tr>{columns.map((column) => <th key={column.key} scope="col" className="border-b border-navy-line/20 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-600">{column.label}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={rowKey(row)} className="border-b border-navy-line/10 align-top">{columns.map((column) => <td key={column.key} className={`px-3 py-2.5 ${column.className ?? ''}`}>{column.render(row)}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <ul className="m-0 grid list-none gap-3 p-0 md:hidden" aria-label={caption}>
      {rows.map((row) => <li key={rowKey(row)} className="rounded-2xl border border-navy-line/30 bg-white p-3">
        <dl className="m-0 grid gap-2">{columns.map((column) => <div key={column.key} className="grid min-w-0 grid-cols-[7.5rem_1fr] gap-2"><dt className="text-xs font-semibold uppercase tracking-wider text-gray-600">{column.label}</dt><dd className="m-0 min-w-0 break-words text-sm">{column.render(row)}</dd></div>)}</dl>
      </li>)}
    </ul>
  </>;
}

/** Loading, error or the content. */
export function Loaded<T>({ state, children }: { state: { data: T | null; error: unknown; loading: boolean; reload(): Promise<void> }; children(data: T): ReactNode }) {
  if (state.error && !state.data) return <ApiErrorState error={state.error} onRetry={() => void state.reload()}/>;
  if (!state.data) return <LoadingState/>;
  return <>{children(state.data)}</>;
}

/** The open Approve & run cards of these kinds (or ids) in this workspace. */
export function ApprovalList({ kinds, ids, empty, onChange }: { kinds?: string[]; ids?: string[]; empty?: ReactNode; onChange?(): void }) {
  const t = useT(), { workspaceId } = useCentre();
  const [actions, setActions] = useState<ActionView[] | null>(null), [error, setError] = useState<unknown>(null);
  const key = JSON.stringify([kinds, ids]);
  const load = useCallback(async () => {
    try {
      const result = await api<{ actions: ActionView[] }>('core/actions', { workspaceId, query: ids ? {} : { status: 'open' } });
      const [wantKinds, wantIds] = JSON.parse(key) as [string[] | undefined, string[] | undefined];
      setActions(result.actions.filter((action) => (!wantKinds || wantKinds.includes(action.kind)) && (!wantIds || wantIds.includes(action.id))));
      setError(null);
    } catch (cause) { setError(cause); }
  }, [workspaceId, key]);
  useEffect(() => { void load(); }, [load]);
  if (error) return <ApiErrorState error={error} onRetry={() => void load()}/>;
  if (!actions) return <LoadingState/>;
  if (!actions.length) return <EmptyState title={empty ?? t('centre.common.noApprovals')}/>;
  return <div className="grid gap-3">{actions.map((action) => <ApproveRunCard key={action.id} action={action} onChange={() => { onChange?.(); }}/>)}</div>;
}

export function useFormat() {
  const { date, number } = useI18n();
  return {
    date: (value: string | null | undefined) => (value ? date(value, { dateStyle: 'medium' }) : '—'),
    dateTime: (value: string | null | undefined) => (value ? date(value, { dateStyle: 'medium', timeStyle: 'short' }) : '—'),
    number: (value: number | null | undefined) => (value === null || value === undefined ? '—' : number(value)),
    money: (value: number | null | undefined, currency = 'UZS') => (value === null || value === undefined ? '—' : `${number(value)} ${currency === 'UZS' ? 'UZS' : currency}`),
    /** Money in a stat tile: short from a million (41.5M), the currency smaller; the exact amount for screen readers and on hover. */
    moneyTile: (value: number | null | undefined, currency = 'UZS'): ReactNode => {
      if (value === null || value === undefined) return '—';
      const full = `${number(value)} ${currency}`;
      const short = Math.abs(value) >= 1_000_000 ? number(value, { notation: 'compact', maximumFractionDigits: 1 }) : number(value);
      return <span title={full}><span aria-hidden="true">{short}<span className="ml-1 text-sm font-semibold text-gray-600">{currency}</span></span><span className="sr-only">{full}</span></span>;
    },
  };
}

export const isApiError = (error: unknown, code: string) => error instanceof ApiError && error.code === code;
export const newKey = () => crypto.randomUUID();
export const CEFR = ['pre_a1', 'a1', 'a2', 'b1', 'b2', 'c1', 'c2'] as const;
export const LEVEL: Record<string, string> = { pre_a1: 'Pre-A1', a1: 'A1', a2: 'A2', b1: 'B1', b2: 'B2', c1: 'C1', c2: 'C2' };
