// What the connect pages share: loading a route, notice text, the page frame.
import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { uzDate } from '../../dates.ts';
import { api, type Method } from '../../api.ts';
import { en, useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';

export const useOrgPath = (orgId: string) => useCallback((rest: string) => `orgs/${orgId}/connect/${rest}`, [orgId]);

export function useDateText() {
  const { date, locale } = useI18n();
  return {
    day: (value: string | null | undefined) => !value ? '—' : locale === 'uz' ? uzDate(value.length === 10 ? `${value}T12:00:00` : value) : date(value.length === 10 ? `${value}T12:00:00` : value, { dateStyle: 'medium' }),
    when: (value: string | null | undefined) => !value ? '—' : locale === 'uz' ? uzDate(value, true) : date(value, { dateStyle: 'medium', timeStyle: 'short' }),
  };
}

/** GETs a route, with a loading state, the error as text and a way to load it again. */
export function useLoad<T>(path: string | null) {
  const problem = useErrorText();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const asked = useRef(0);
  const reload = useCallback(async () => {
    if (!path) return;
    const ticket = ++asked.current;
    try {
      const result = await api<T>(path);
      if (ticket === asked.current) { setData(result); setError(''); }
    } catch (cause) {
      if (ticket === asked.current) setError(problem(cause));
    }
  }, [path]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, setData, error, setError, reload };
}

/** Runs one action at a time, keeping its error and result note for the page to show. */
export function useAction() {
  const problem = useErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const running = useRef(false);
  const run = useCallback(async <T,>(action: () => Promise<T>, done?: (result: T) => string | void): Promise<T | undefined> => {
    if (running.current) return undefined;
    running.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await action();
      const note = done?.(result);
      if (note) setNotice(note);
      return result;
    } catch (cause) {
      setError(problem(cause));
      return undefined;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);
  return { busy, error, notice, run, setError, setNotice };
}

export const send = <T,>(path: string, method: Method, body?: unknown) => api<T>(path, { method, body });

export function Status({ error, notice }: { error?: string; notice?: string }) {
  return <>
    {notice && <p className="notice" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </>;
}

/** The heading every connect page starts with. */
export function Page({ eyebrow, title, lead, actions, children }: { eyebrow?: string; title: string; lead?: string; actions?: ReactNode; children: ReactNode }) {
  const t = useAppT();
  return <div className="connect">
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow ?? t('nav.section.connect')}</p>
        <h1>{title}</h1>
        {lead && <p className="connect-lead">{lead}</p>}
      </div>
      {actions && <div className="company-actions">{actions}</div>}
    </header>
    {children}
  </div>;
}

export interface Notice { id: string; kind: string; params: Record<string, string | number | null>; link: string | null; read_at: string | null; created_at: string }

/** A notice as a sentence: this app's text for its kind, the sender's title for other kinds. */
export function useNoticeText() {
  const t = useAppT(), { day, when } = useDateText();
  return (notice: Notice): string => {
    const key = `connect.notice.${notice.kind}` as AppKey;
    const params = { ...notice.params } as Record<string, string | number>;
    if (typeof notice.params.date === 'string') params.date = day(notice.params.date);
    if (typeof notice.params.at === 'string') params.at = when(notice.params.at);
    if (key in en) return t(key, params);
    return typeof notice.params.title === 'string' && notice.params.title ? notice.params.title : t('connect.notice.generic');
  };
}

export const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
export const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

/** Downloads text as a file in the browser. */
export function saveFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
