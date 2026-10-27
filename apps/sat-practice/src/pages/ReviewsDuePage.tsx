import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Repeat } from 'lucide-react';
import { PracticeTopNav } from '../components/PracticeTopNav';
import { srsDueGet, attemptStart, type NotebookItem, type SatQuestion } from '../lib/api';
import { useAccess } from '../lib/useAccess';
import { domainLabel, questionTaxonomy, skillLabel } from '../lib/labels';
import { useAppT, useErrorText, type AppKey } from '../i18n';

type DueItem = NotebookItem & { question: SatQuestion | null };

export const ReviewsDuePage = () => {
  const t = useAppT();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { accessToken } = useAccess();
  const [items, setItems] = useState<DueItem[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null), [reload, setReload] = useState(0);
  const sending = useRef(false), actor = useRef(accessToken);
  actor.current = accessToken;

  useEffect(() => {
    let active = true; setLoading(true); setItems([]); setError(null);
    if (!accessToken) return () => { active = false; };
    srsDueGet(accessToken).then(res => { if (active) setItems(res.items); })
      .catch(err => { if (active) setError(err); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, reload]);

  const startReviews = async () => {
    if (!accessToken || loading || sending.current) return;
    const ids = items.map((item) => item.question?.id).filter((id): id is string => Boolean(id));
    if (!ids.length) return;
    sending.current = true; setBusy(true); setError(null);
    try {
      const res = await attemptStart(accessToken, { question_ids: ids, question_count: ids.length });
      if (actor.current === accessToken) navigate(`/lab/${res.attempt.id}`);
    } catch (err) {
      if (actor.current === accessToken) setError(err);
    } finally { sending.current = false; setBusy(false); }
  };

  return (
    <div className="app-shell">
      <PracticeTopNav />
      <main className="workspace narrow">
        <header className="page-header">
          <div>
            <p className="eyebrow">{t('reviews.eyebrow')}</p>
            <h1>{t('reviews.title')}</h1>
            {loading ? <p role="status">{t('reviews.loading')}</p> : !error ? <p>{t('reviews.due', { count: items.length })}</p> : null}
          </div>
          <button type="button" className="btn solid" onClick={() => void startReviews()} disabled={loading || busy || items.length === 0}>
            <Repeat size={17} aria-hidden="true" />
            {t('reviews.start')}
          </button>
        </header>
        {error ? <div role="alert" className="alert error">{errorText(error)} <button type="button" className="btn" disabled={loading || busy} onClick={() => setReload(v => v + 1)}>{t('reviews.retryLoad')}</button></div> : null}
        <section className="panel">
          {!loading && !error && items.length === 0 ? <div className="empty-state">{t('reviews.empty')}</div> : null}
          <ul className="plan-list">
            {items.map((item) => {
              const tax = item.question ? questionTaxonomy(item.question) : null;
              return <li key={item.id}>
                <div>
                  <strong>{t('reviews.item')}</strong>
                  <span>{tax ? `${domainLabel(t, tax.official_domain)}${tax.skill ? ' · ' + skillLabel(t, tax.skill) : ''}` : ''} · {t(`difficulty.${item.difficulty}` as AppKey)}</span>
                </div>
              </li>;
            })}
          </ul>
        </section>
      </main>
    </div>
  );
};
