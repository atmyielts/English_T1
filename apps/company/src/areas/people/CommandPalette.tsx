// Search across the workspace (Ctrl+K): pages the role can open, plus people, departments,
// tests and courses from one server route that applies consent and manager scope.
// The shell mounts this on every workspace page, also before the workspace has loaded.
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { navigate } from '../../router.tsx';
import { WorkspaceContext } from '../../session.tsx';
import { allRoutes } from '../index.ts';
import type { SearchResults } from './types.ts';

interface Item { id: string; group: string; label: string; hint?: string; to: string }

const SEEN_KEY = 'company-hr-seen';

export function CommandPalette({ orgId }: { orgId: string }) {
  const t = useAppT(), { locale } = useI18n();
  const workspace = useContext(WorkspaceContext);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null);
  const asked = useRef(0);
  const role = workspace?.member?.role ?? (workspace?.staff ? 'owner' : 'employee');
  const staff = workspace?.staff ?? false;

  // Tells Schood's workspace health that HR was here. Once per tab session; failure means nothing.
  const hr = Boolean(workspace?.hr), member = workspace?.member?.id;
  useEffect(() => {
    if (!hr || !member) return;
    try {
      if (sessionStorage.getItem(SEEN_KEY) === orgId) return;
      sessionStorage.setItem(SEEN_KEY, orgId);
    } catch { /* No storage: skip it rather than send one on every page. */ return; }
    api(`orgs/${orgId}/people/me/seen`, { method: 'POST' }).catch(() => undefined);
  }, [hr, member, orgId]);

  const show = useCallback(() => {
    setOpen(true); setQ(''); setResults(null); setActive(0); setFailed(false);
    if (!dialog.current?.open) dialog.current?.showModal();
    input.current?.focus();
  }, []);
  const hide = useCallback(() => {
    setOpen(false);
    if (dialog.current?.open) dialog.current.close();
  }, []);

  useEffect(() => {
    if (!workspace) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (dialog.current?.open) hide(); else show();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [Boolean(workspace), show, hide]);

  useEffect(() => {
    const needle = q.trim();
    if (!open || needle.length < 2) { setResults(null); setBusy(false); setFailed(false); return; }
    const ticket = ++asked.current;
    setBusy(true);
    const timer = setTimeout(() => {
      api<SearchResults>(`orgs/${orgId}/search?q=${encodeURIComponent(needle)}&locale=${locale}`).then((next) => {
        if (ticket !== asked.current) return; // Only the answer to the latest typing counts.
        setResults(next); setBusy(false); setFailed(false); setActive(0);
      }).catch(() => {
        if (ticket === asked.current) { setBusy(false); setFailed(true); setResults(null); }
      });
    }, 180);
    return () => clearTimeout(timer);
  }, [q, open, orgId, locale]);

  // Every page this role can open, once each, even if a route is listed twice for different roles.
  const pages = useMemo<Item[]>(() => {
    const seen = new Set<string>(), out: Item[] = [];
    for (const route of allRoutes) {
      if (route.access !== 'org' || !route.nav || seen.has(route.path)) continue;
      if (!staff && route.roles && !route.roles.includes(role)) continue;
      seen.add(route.path);
      out.push({ id: `page:${route.path}`, group: t('people.search.pages'), label: t(route.nav.label), hint: t(`nav.section.${route.nav.section}` as AppKey), to: route.path.replace(':org', orgId) });
    }
    return out;
  }, [orgId, role, staff, t]);

  const items = useMemo<Item[]>(() => {
    const needle = q.trim().toLowerCase();
    const shownPages = pages.filter((item) => !needle || item.label.toLowerCase().includes(needle));
    if (!results) return shownPages;
    const departments = new Map(results.departments.map((row) => [row.id, row.name]));
    return [
      ...results.people.map((row) => ({
        id: `person:${row.id}`, group: t('people.search.people'), label: row.name || row.email || t('people.unnamed'),
        hint: [row.email, departments.get(row.department_id ?? ''), t(`people.status.${row.status}` as AppKey)].filter(Boolean).join(' · '),
        to: row.status === 'invited' ? `/w/${orgId}/people?q=${encodeURIComponent(row.name || row.email || '')}&status=invited` : `/w/${orgId}/people/${row.id}`,
      })),
      ...results.departments.map((row) => ({ id: `department:${row.id}`, group: t('people.search.departments'), label: row.name, to: `/w/${orgId}/people?department=${row.id}` })),
      ...results.tests.map((row) => ({ id: `test:${row.id}`, group: t('people.search.tests'), label: row.title, hint: t(`people.search.testKind.${row.kind}` as AppKey), to: row.kind === 'hiring' ? `/w/${orgId}/hiring/${row.id}` : `/w/${orgId}/placement/${row.id}` })),
      ...results.courses.map((row) => ({ id: `course:${row.track}:${row.lesson ?? ''}`, group: t('people.search.courses'), label: row.title, hint: row.level ? t(`level.${row.level}` as AppKey) : t('people.search.track'), to: row.lesson ? `/w/${orgId}/learn/${row.track}/${row.lesson}` : `/w/${orgId}/learn?track=${row.track}` })),
      ...shownPages,
    ];
  }, [pages, results, q, orgId, t]);

  function go(item: Item | undefined) {
    if (!item) return;
    hide();
    navigate(item.to);
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((at) => items.length ? (at + 1) % items.length : 0); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((at) => items.length ? (at - 1 + items.length) % items.length : 0); }
    else if (event.key === 'Enter') { event.preventDefault(); go(items[active]); }
  }
  useEffect(() => {
    dialog.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!workspace) return null;
  const empty = !busy && !failed && !items.length;
  let lastGroup = '';
  return <>
    <button type="button" className="quiet people-palette-open" aria-keyshortcuts="Control+K" onClick={show}>
      <span>{t('people.search.open')}</span><kbd aria-hidden="true">Ctrl K</kbd>
    </button>
    <dialog ref={dialog} className="people-palette" aria-label={t('people.search.title')} onClose={() => setOpen(false)}
      onClick={(event) => { if (event.target === dialog.current) hide(); }}>
      {open && <div className="people-palette-body">
        <label className="visually-hidden" htmlFor="people-palette-input">{t('people.search.title')}</label>
        <input ref={input} id="people-palette-input" type="search" autoFocus autoComplete="off" role="combobox" aria-expanded="true" aria-controls="people-palette-list"
          aria-activedescendant={items[active] ? `people-palette-${active}` : undefined} value={q} maxLength={80} placeholder={t(workspace.lead ? 'people.search.hintLead' : 'people.search.hintEmployee')}
          onChange={(event) => setQ(event.target.value)} onKeyDown={onKeyDown}/>
        <div id="people-palette-list" role="listbox" aria-label={t('people.search.results')} className="people-palette-list">
          {items.map((item, index) => {
            const heading = item.group !== lastGroup;
            lastGroup = item.group;
            return <React.Fragment key={item.id}>
              {heading && <p className="people-palette-group" role="presentation">{item.group}</p>}
              <button type="button" id={`people-palette-${index}`} data-index={index} role="option" aria-selected={index === active} tabIndex={-1}
                className={`people-palette-item ${index === active ? 'active' : ''}`} onMouseEnter={() => setActive(index)} onClick={() => go(item)}>
                <span>{item.label}</span>{item.hint && <small>{item.hint}</small>}
              </button>
            </React.Fragment>;
          })}
          {empty && <p className="people-palette-note">{t('people.search.none')}</p>}
          {failed && <p className="people-palette-note" role="alert">{t('people.search.failed')}</p>}
        </div>
        <p className="people-palette-foot" aria-hidden="true">{busy ? t('app.loading') : t('people.search.keys')}</p>
        <span className="visually-hidden" role="status">{busy ? t('app.loading') : t('people.search.count', { count: items.length })}</span>
      </div>}
    </dialog>
  </>;
}
