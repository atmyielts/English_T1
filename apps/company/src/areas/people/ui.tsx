// Small pieces the gtm pages share (people, site, staff): error text for this
// area's codes, copy and share buttons for invitation links, dates, CSV download.
import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { en, useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';

/** `people.error.<code>` / `staff.error.<code>` / `site.error.<code>` when known, else the shell's text. */
export function useProblem() {
  const t = useAppT(), shell = useErrorText();
  return (cause: unknown): string => {
    const code = (cause as { code?: string })?.code;
    const field = (cause as { field?: string })?.field ?? String((cause as { details?: Record<string, unknown> })?.details?.field ?? '');
    const details = ((cause as { details?: Record<string, unknown> })?.details ?? {}) as Record<string, string | number>;
    if (code) {
      for (const area of ['people', 'staff', 'site']) {
        const key = `${area}.error.${code}` as AppKey;
        if (key in en) return t(key, { ...details, field });
      }
      if (code === 'invalid_field' && field) {
        const label = `people.field.${field}` as AppKey;
        if (label in en) return t('people.error.invalid_field_named', { field: t(label) });
      }
    }
    return shell(cause);
  };
}

export function useDates() {
  const { date } = useI18n();
  return {
    day: (value: string | null | undefined) => value ? date(value.length === 10 ? `${value}T12:00:00` : value, { dateStyle: 'medium' }) : '—',
    when: (value: string | null | undefined) => value ? date(value, { dateStyle: 'medium', timeStyle: 'short' }) : '—',
  };
}

async function writeClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function CopyButton({ value, label, className = 'quiet' }: { value: string; label?: string; className?: string }) {
  const t = useAppT();
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return <>
    <button type="button" className={className} onClick={() => void writeClipboard(value).then((ok) => {
      setState(ok ? 'done' : 'failed');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setState('idle'), 2500);
    })}>{state === 'done' ? t('common.copied') : label ?? t('common.copy')}</button>
    <span className="visually-hidden" role="status">{state === 'done' ? t('common.copied') : state === 'failed' ? t('people.link.copyFailed') : ''}</span>
  </>;
}

export const telegramShare = (link: string, message: string) => `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(message)}`;

/** A freshly made link: shown once, with copy and Telegram share. */
export function LinkResult({ link, message, title, note }: { link: string; message: string; title: string; note?: string }) {
  const t = useAppT();
  const id = useRef(`link-${Math.random().toString(36).slice(2)}`).current;
  return <div className="people-link-result" role="status">
    <p className="people-link-title"><strong>{title}</strong></p>
    <label htmlFor={id} className="visually-hidden">{t('people.link.label')}</label>
    <input id={id} readOnly value={link} onFocus={(event) => event.currentTarget.select()} className="people-link-input"/>
    <div className="company-actions">
      <CopyButton value={link} label={t('people.link.copy')} className=""/>
      <a className="button-link quiet" href={telegramShare(link, message)} target="_blank" rel="noopener noreferrer">{t('people.link.telegram')}</a>
    </div>
    <p className="hint">{note ?? t('people.link.once')}</p>
  </div>;
}

/** Saves text as a file (CSV of links, templates). */
export function download(name: string, content: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿', content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",;\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** A labelled usage bar (seats, tests). `limit` null means unlimited. */
export function Meter({ label, used, limit, unlimited }: { label: string; used: number; limit: number | null; unlimited: string }) {
  const t = useAppT();
  const share = limit ? Math.min(100, Math.round((used / limit) * 100)) : limit === 0 ? 100 : 0;
  return <div className="people-meter">
    <div className="people-meter-head"><span>{label}</span><strong>{limit === null ? `${used} · ${unlimited}` : t('common.of', { done: used, total: limit })}</strong></div>
    {limit !== null && <div className="people-meter-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}>
      <span style={{ width: `${share}%` }} className={share >= 100 ? 'full' : share >= 85 ? 'high' : ''}/>
    </div>}
  </div>;
}
