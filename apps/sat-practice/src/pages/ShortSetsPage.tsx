import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PracticeTopNav } from '../components/PracticeTopNav';
import { useAppT, useErrorText } from '../i18n';
import { type ShortSet, shortSetsGet, shortSetStart } from '../lib/api';
import { useAccess } from '../lib/useAccess';

const categories: ShortSet['category'][] = ['paired', 'evidence', 'hard-math', 'timed'];

export const ShortSetsPage = () => {
  const t = useAppT(), errorText = useErrorText(), navigate = useNavigate();
  const [params] = useSearchParams();
  const selected = params.get('set');
  const { accessToken } = useAccess();
  const [sets, setSets] = useState<ShortSet[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const busy = useRef(false), actor = useRef(accessToken);
  actor.current = accessToken;

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    setLoading(true); setError(null); setSets(null);
    shortSetsGet(accessToken).then(result => { if (active) setSets(result.sets); })
      .catch(err => { if (active) setError(err); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, reload]);

  const start = async (slug: string) => {
    if (!accessToken || busy.current) return;
    busy.current = true; setStarting(slug); setError(null);
    try {
      const { attempt } = await shortSetStart(accessToken, slug);
      if (actor.current === accessToken) navigate(`/lab/${attempt.id}`);
    } catch (err) {
      if (actor.current === accessToken) setError(err);
    } finally {
      busy.current = false; setStarting(null);
    }
  };

  const visible = (sets ?? []).filter(set => !selected || set.slug === selected);
  const checkpoints = visible.filter(set => set.checkpoint_week);
  const card = (set: ShortSet) => <article className="panel module-card" key={set.slug}>
    {set.checkpoint_week ? <p className="eyebrow">{t('shortSets.week', { week: set.checkpoint_week })}</p> : null}
    <h3>{set.title}</h3>
    <p className="module-meta">{set.time_limit_seconds
      ? t('shortSets.timedMeta', { count: set.question_count, minutes: set.time_limit_seconds / 60 })
      : t('shortSets.meta', { count: set.question_count })}</p>
    <button type="button" className="btn solid" disabled={starting !== null || !accessToken}
      aria-label={t('shortSets.startNamed', { title: set.title })} onClick={() => void start(set.slug)}>
      {t(starting === set.slug ? 'modules.starting' : 'shortSets.start')}
    </button>
  </article>;

  return <div className="app-shell">
    <PracticeTopNav />
    <main className="workspace">
      <header className="page-header">
        <div><h1>{t('shortSets.title')}</h1><p>{t('shortSets.lead')}</p></div>
        <Link className="btn ghost" to={selected ? '/short-sets' : '/bank'}>{t(selected ? 'shortSets.all' : 'nav.bank')}</Link>
      </header>
      {loading ? <p role="status">{t('app.loading')}</p> : null}
      {error ? <div className="alert error" role="alert">
        {errorText(error)}{!sets ? <button className="btn ghost" onClick={() => setReload(n => n + 1)}>{t('common.retry')}</button> : null}
      </div> : null}
      {sets && visible.length === 0 ? <p role="status">{t(selected ? 'error.not_found' : 'shortSets.empty')}</p> : null}
      {checkpoints.length ? <section aria-labelledby="short-set-checkpoints">
        <h2 id="short-set-checkpoints">{t('shortSets.checkpoints')}</h2>
        <div className="module-grid">{checkpoints.map(card)}</div>
      </section> : null}
      {categories.map(category => {
        const group = visible.filter(s => s.category === category && !s.checkpoint_week);
        if (!group.length) return null;
        return <section key={category} aria-labelledby={`short-sets-${category}`}>
          <h2 id={`short-sets-${category}`}>{t(`shortSets.category.${category}`)}</h2>
          <div className="module-grid">{group.map(card)}</div>
        </section>;
      })}
    </main>
  </div>;
};
