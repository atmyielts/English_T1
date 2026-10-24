import { useState } from 'react';
import { useI18n, useT } from '../i18n';
import { ApiError } from '../lib/api';
import { createProgressLink, listProgressLinks, type ProgressLink, revokeProgressLink } from '../lib/social';
import { useResource } from '../lib/useResource';
import { Loading, Panel } from '../ui/kit';
import './social.css';

const CopyField = ({ id, label, value }: { id: string; label: string; value: string }) => {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="en-stack" style={{ gap: '0.35rem' }}>
      <label htmlFor={id}>{label}</label>
      <div className="en-row" style={{ flexWrap: 'nowrap' }}>
        <input id={id} readOnly value={value} onFocus={(event) => event.currentTarget.select()} style={{ minWidth: 0, flex: 1 }} />
        <button
          type="button"
          className="quiet"
          onClick={() => void navigator.clipboard.writeText(value).then(() => setCopied(true), () => setCopied(false))}
        >
          {copied ? t('social.links.copied') : t('social.links.copy')}
        </button>
      </div>
    </div>
  );
};

/**
 * Settings: read-only progress links for parents and teachers (/p/:token),
 * each with an optional Telegram weekly report. Revocable at any time.
 */
export const ProgressLinksPanel = () => {
  const t = useT();
  const { date } = useI18n();
  const remote = useResource((signal) => listProgressLinks(signal), []);
  const [links, setLinks] = useState<ProgressLink[] | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ url: string; telegram_url: string } | null>(null);
  const list = links ?? remote.data?.links ?? null;
  const maxActive = remote.data?.max_active ?? 5;

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await createProgressLink(label.trim());
      setCreated({ url: response.url, telegram_url: response.telegram_url });
      setLabel('');
      setLinks((await listProgressLinks()).links);
    } catch (cause) {
      setError(cause instanceof ApiError && cause.code === 'progress_link_limit' ? t('social.links.limit', { count: maxActive }) : t('social.links.error'));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (link: ProgressLink) => {
    if (!window.confirm(t('social.links.revokeConfirm'))) return;
    setBusy(true);
    setError(null);
    try {
      setLinks((await revokeProgressLink(link.id)).links);
    } catch {
      setError(t('social.links.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title={t('social.links.title')}>
      <p className="hint">{t('social.links.lead')}</p>
      {created ? (
        <div className="en-links-new" role="status">
          <p style={{ margin: 0 }}>{t('social.links.created')}</p>
          <CopyField id="en-pl-url" label={t('social.links.title')} value={created.url} />
          <CopyField id="en-pl-tg" label={t('social.links.telegram')} value={created.telegram_url} />
          <p className="hint" style={{ margin: 0 }}>{t('social.links.telegramHint')}</p>
        </div>
      ) : null}
      <label className="en-field-inline" htmlFor="en-pl-label">
        <span>{t('social.links.label')}</span>
        <input id="en-pl-label" value={label} maxLength={40} placeholder={t('social.links.placeholder')} onChange={(event) => setLabel(event.target.value)} />
      </label>
      <div className="en-actions">
        <button type="button" onClick={() => void create()} disabled={busy}>{busy ? t('social.links.creating') : t('social.links.create')}</button>
      </div>
      {list === null ? (remote.error ? <p className="en-error" role="alert">{t('social.links.error')}</p> : <Loading lines={2} />) : list.length ? (
        <>
          <h3 style={{ fontSize: '0.95rem', margin: '0.5rem 0 0' }}>{t('social.links.list')}</h3>
          <ul className="en-links-list">
            {list.map((link) => (
              <li key={link.id} className={link.revoked_at ? 'is-off' : ''}>
                <div>
                  <strong>{link.label ?? t('social.links.item', { hint: link.hint })}</strong>
                  <small>
                    {t('social.links.created_at', { date: date(link.created_at, { dateStyle: 'medium' }) })}
                    {' · '}{t('social.links.views', { count: link.views })}
                    {link.telegram_followers ? <>{' · '}{t('social.links.followers', { count: link.telegram_followers })}</> : null}
                  </small>
                </div>
                {link.revoked_at ? <small>{t('social.links.revoked')}</small> : (
                  <button type="button" className="quiet" onClick={() => void revoke(link)} disabled={busy}>{t('social.links.revoke')}</button>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : <p className="hint">{t('social.links.empty')}</p>}
      {error ? <p className="en-error" role="alert">{error}</p> : null}
    </Panel>
  );
};
