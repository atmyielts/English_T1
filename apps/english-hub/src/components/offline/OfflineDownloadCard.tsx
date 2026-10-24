import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useEnglish } from '../../app/EnglishContext';
import { useI18n, useT } from '../../i18n';
import { ApiError } from '../../lib/api';
import { localDate } from '../../lib/hub';
import { deletePack, OfflineStoreError } from '../../lib/offline/store';
import { useOfflineState, useOnline } from '../../lib/offline/useOffline';
import { Panel } from '../../ui/kit';

type Problem = 'quota' | 'unavailable' | 'network' | 'failed';

/**
 * Today: "Download for offline". Saves today's unfinished reading, listening,
 * grammar and vocabulary activities on this device, shows what is saved and
 * how many answers wait to be sent. Hidden where the browser cannot store them.
 */
export const OfflineDownloadCard = () => {
  const t = useT();
  const { date } = useI18n();
  const { session } = useEnglish();
  const userId = session?.user.id ?? null;
  const state = useOfflineState(userId, Boolean(userId));
  const online = useOnline();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [outcome, setOutcome] = useState<{ skipped: number; nothing: boolean } | null>(null);
  const [sending, setSending] = useState(false);

  if (!userId || !state.supported || state.problem === 'unavailable') return null;

  const pack = state.pack;
  const current = pack && pack.date === localDate() ? pack : null;
  const queued = state.entries.filter((entry) => entry.status === 'queued').length;

  const download = async () => {
    setProblem(null);
    setOutcome(null);
    setProgress({ done: 0, total: 0 });
    try {
      const { downloadToday } = await import('../../lib/offline/sync');
      const result = await downloadToday(userId, (done, total) => setProgress({ done, total }));
      setOutcome({ skipped: result.skipped, nothing: result.saved === 0 });
    } catch (error) {
      if (error instanceof OfflineStoreError) setProblem(error.kind === 'quota' ? 'quota' : error.kind === 'unavailable' ? 'unavailable' : 'failed');
      else if (error instanceof ApiError && error.status === 0) setProblem('network');
      else setProblem('failed');
    } finally {
      setProgress(null);
    }
  };

  const sendNow = async () => {
    setSending(true);
    try {
      const { syncNow } = await import('../../lib/offline/sync');
      await syncNow(userId);
    } catch {
      // The answers stay queued; the next sync tries again.
    } finally {
      setSending(false);
    }
  };

  const remove = async () => {
    try {
      await deletePack(userId);
    } catch {
      setProblem('failed');
    }
  };

  const busy = progress !== null;

  return (
    <Panel title={t('offline.card.title')}>
      {current ? (
        <p style={{ margin: 0 }}>{t('offline.card.saved', { count: current.activities.length })}</p>
      ) : pack ? (
        <p className="hint" style={{ margin: 0 }}>{t('offline.card.savedOld', { date: date(pack.saved_at, { day: 'numeric', month: 'short' }) })}</p>
      ) : (
        <p className="hint" style={{ margin: 0 }}>{t('offline.card.body')}</p>
      )}

      {progress ? (
        <p className="hint" role="status" style={{ margin: 0 }}>{t('offline.card.saving', { done: progress.done, total: progress.total })}</p>
      ) : null}
      {outcome?.nothing ? <p className="hint" role="status" style={{ margin: 0 }}>{t('offline.card.nothing')}</p> : null}
      {outcome && !outcome.nothing && outcome.skipped > 0 ? (
        <p className="hint" role="status" style={{ margin: 0 }}>{t('offline.card.someSkipped', { count: outcome.skipped })}</p>
      ) : null}
      {problem ? <p className="error" role="alert" style={{ margin: 0 }}>{t(`offline.error.${problem}`)}</p> : null}

      {queued > 0 ? (
        <p style={{ margin: 0 }}>
          {t('offline.card.queued', { count: queued })}{' '}
          {online ? (
            <button type="button" className="is-link" disabled={sending} onClick={() => void sendNow()}>
              {sending ? t('offline.card.sending') : t('offline.card.sendNow')}
            </button>
          ) : null}
        </p>
      ) : null}

      <div className="en-actions">
        {pack ? <Link className="en-button" to="/offline">{t('offline.card.open')}</Link> : null}
        <button type="button" className={pack ? 'quiet' : undefined} disabled={busy || !online} onClick={() => void download()}>
          {pack ? t('offline.card.update') : t('offline.card.download')}
        </button>
        {pack && !busy ? <button type="button" className="is-link" onClick={() => void remove()}>{t('offline.card.remove')}</button> : null}
      </div>
    </Panel>
  );
};
