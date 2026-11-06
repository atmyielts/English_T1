// A person's notifications and their own reminder settings. Everyone in a workspace has
// this page, so nothing here shows anyone else's data.
import React, { useEffect, useState } from 'react';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { navigate } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { hourLabel, HOURS, Page, saveFile, send, Status, useAction, useDateText, useLoad, useNoticeText, useOrgPath, type Notice } from './shared.tsx';

interface Prefs { telegram_opt_in: boolean; muted_kinds: string[]; quiet_start: number | null; quiet_end: number | null; daily_cap: number | null; locale: 'en' | 'ru' | 'uz' | null }
interface MyConnect { available: boolean; function_on: boolean; workspace_on: boolean; workspace: { quiet_start: number; quiet_end: number; daily_cap: number }; prefs: Prefs; linked: boolean; kinds: string[] }

function Reminders({ orgId }: { orgId: string }) {
  const t = useAppT(), path = useOrgPath(orgId);
  const { data, setData, error: loadError, reload } = useLoad<MyConnect>(path('me'));
  const { busy, error, notice, run } = useAction();
  const [link, setLink] = useState<{ link_url: string; token: string } | null>(null);
  if (loadError) return <section><h2>{t('connect.me.title')}</h2><p className="error" role="alert">{loadError}</p></section>;
  if (!data) return <section><h2>{t('connect.me.title')}</h2><p role="status">{t('app.loading')}</p></section>;
  const { prefs, workspace } = data;
  const save = (patch: Partial<Prefs>) => run(() => send<{ prefs: Prefs }>(path('me'), 'PATCH', patch), (result) => {
    setData({ ...data, prefs: result.prefs });
    return t('connect.me.saved');
  });
  const connect = () => run(() => send<{ link_url: string; token: string }>(path('telegram/link'), 'POST'), (result) => { setLink(result); });
  const confirm = () => run(() => send<{ linked: boolean }>(path('telegram/confirm'), 'POST', { token: link!.token }), () => { setLink(null); void reload(); return t('connect.me.linked'); });

  return <section aria-labelledby="connect-me-title">
    <h2 id="connect-me-title">{t('connect.me.title')}</h2>
    <Status error={error} notice={notice}/>
    {!data.available && !prefs.telegram_opt_in ? <p>{t('connect.me.off')}</p> : <div className="connect-stack">
      <p>{t('connect.me.lead')}</p>
      {data.linked ? <p className="connect-ok">{t('connect.me.linked')}</p> : !link ? <div className="company-actions">
        <button type="button" disabled={busy} onClick={() => void connect()}>{t('connect.me.connect')}</button>
      </div> : <div className="connect-box">
        <p>{t('connect.me.confirmHint')}</p>
        <div className="company-actions">
          <a className="button-link" href={link.link_url} target="_blank" rel="noopener noreferrer">{t('connect.me.openBot')}</a>
          <button type="button" className="quiet" disabled={busy} onClick={() => void confirm()}>{t('connect.me.confirm')}</button>
        </div>
      </div>}
      <label className="check"><input type="checkbox" checked={prefs.telegram_opt_in} disabled={busy || (!data.linked && !prefs.telegram_opt_in)} onChange={(event) => void save({ telegram_opt_in: event.target.checked })}/>{t('connect.me.optIn')}</label>
      {prefs.telegram_opt_in && <>
        <div className="connect-grid">
          <label>{t('connect.me.quietFrom')}
            <select value={prefs.quiet_start ?? ''} disabled={busy} onChange={(event) => void save({ quiet_start: event.target.value === '' ? null : Number(event.target.value) })}>
              <option value="">{t('connect.me.useWorkspace', { hour: workspace.quiet_start })}</option>
              {HOURS.map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
            </select>
          </label>
          <label>{t('connect.me.quietTo')}
            <select value={prefs.quiet_end ?? ''} disabled={busy} onChange={(event) => void save({ quiet_end: event.target.value === '' ? null : Number(event.target.value) })}>
              <option value="">{t('connect.me.useWorkspace', { hour: workspace.quiet_end })}</option>
              {HOURS.map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
            </select>
          </label>
          <label>{t('connect.me.cap')}
            <select value={prefs.daily_cap ?? ''} disabled={busy} onChange={(event) => void save({ daily_cap: event.target.value === '' ? null : Number(event.target.value) })}>
              <option value="">{t('connect.me.capWorkspace', { count: workspace.daily_cap })}</option>
              {Array.from({ length: workspace.daily_cap }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}</option>)}
            </select>
          </label>
          <label>{t('connect.me.language')}
            <select value={prefs.locale ?? ''} disabled={busy} onChange={(event) => void save({ locale: (event.target.value || null) as Prefs['locale'] })}>
              <option value="">{t('connect.me.languageDefault')}</option>
              <option value="ru">Русский</option><option value="uz">O‘zbekcha</option><option value="en">English</option>
            </select>
          </label>
        </div>
        <fieldset>
          <legend>{t('connect.me.kinds')}</legend>
          {data.kinds.map((kind) => <label className="check" key={kind}>
            <input type="checkbox" disabled={busy} checked={!prefs.muted_kinds.includes(kind)} onChange={(event) => void save({ muted_kinds: event.target.checked ? prefs.muted_kinds.filter((entry) => entry !== kind) : [...prefs.muted_kinds, kind] })}/>
            {t(`connect.kind.${kind}` as AppKey)}
          </label>)}
        </fieldset>
      </>}
    </div>}
  </section>;
}

function MyData({ orgId }: { orgId: string }) {
  const t = useAppT(), path = useOrgPath(orgId);
  const { busy, error, run } = useAction();
  return <section aria-labelledby="connect-own-title">
    <h2 id="connect-own-title">{t('connect.me.export')}</h2>
    <p>{t('connect.me.exportLead')}</p>
    <Status error={error}/>
    <button type="button" className="quiet" disabled={busy} onClick={() => void run(() => api<unknown>(path('privacy/me/export')), (data) => { saveFile('my-company-english-data.json', JSON.stringify(data, null, 2), 'application/json'); })}>{t('connect.me.export')}</button>
  </section>;
}

export function NotificationsPage() {
  const t = useAppT(), text = useNoticeText(), { when } = useDateText();
  const { org, member } = useWorkspace();
  const path = useOrgPath(org.id);
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const { busy, error, run, setError } = useAction();

  async function load(offset: number) {
    const result = await api<{ notices: Notice[]; next_offset: number | null }>(`${path('notices')}?limit=30&offset=${offset}${onlyUnread ? '&unread=1' : ''}`);
    setNotices((current) => offset === 0 ? result.notices : [...(current ?? []), ...result.notices]);
    setNext(result.next_offset);
  }
  useEffect(() => { void load(0).catch(() => setError(t('connect.bell.failed'))); }, [onlyUnread, org.id]);

  async function follow(notice: Notice) {
    if (!notice.read_at) await send(path(`notices/${notice.id}/read`), 'POST').catch(() => undefined);
    if (notice.link) navigate(notice.link);
    else setNotices((rows) => rows?.map((row) => row.id === notice.id ? { ...row, read_at: new Date().toISOString() } : row) ?? null);
  }
  const unread = notices?.some((row) => !row.read_at);

  return <Page eyebrow={t('nav.section.connect')} title={t('connect.notices.title')} lead={t('connect.notices.lead')}>
    <section aria-label={t('connect.notices.title')}>
      <div className="connect-row">
        <label className="check"><input type="checkbox" checked={onlyUnread} onChange={(event) => setOnlyUnread(event.target.checked)}/>{t('connect.notices.onlyUnread')}</label>
        {unread && <button type="button" className="quiet" disabled={busy} onClick={() => void run(() => send(path('notices/read-all'), 'POST'), () => { void load(0); })}>{t('connect.notices.readAll')}</button>}
      </div>
      <Status error={error}/>
      {!notices ? !error && <p role="status">{t('app.loading')}</p>
        : !notices.length ? <p className="connect-empty">{onlyUnread ? t('connect.notices.emptyUnread') : t('connect.notices.empty')}</p>
        : <ul className="connect-notices">
          {notices.map((notice) => <li key={notice.id} className={notice.read_at ? '' : 'unread'}>
            <div className="connect-notice-text">
              {!notice.read_at && <span className="company-badge">{t('connect.notices.new')}</span>}
              <p>{text(notice)}</p>
              <small>{when(notice.created_at)}</small>
            </div>
            {notice.link ? <button type="button" className="quiet" onClick={() => void follow(notice)}>{t('connect.notices.open')}</button>
              : !notice.read_at && <button type="button" className="quiet" onClick={() => void follow(notice)}>{t('connect.notices.markRead')}</button>}
          </li>)}
        </ul>}
      {next !== null && <button type="button" className="quiet" onClick={() => void load(next)}>{t('connect.notices.more')}</button>}
    </section>
    {member && <Reminders orgId={org.id}/>}
    {member && <MyData orgId={org.id}/>}
    {!member && <p className="hint">{t('connect.me.staff')}</p>}
  </Page>;
}
