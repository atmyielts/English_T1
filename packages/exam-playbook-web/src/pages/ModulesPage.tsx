import { Link } from 'react-router-dom';
import { Shell } from '../components/TopNav';
import { ErrorPanel, SkeletonGrid } from '../components/ui';
import { useT } from '../i18n';
import { usePlaybook } from '../lib/context';
import { ModuleCard, useCatalog } from './LandingPage';

export const ModulesPage = () => {
  const t = useT();
  const { config, access } = usePlaybook();
  const { catalog, failed, retry } = useCatalog();
  // Keep the contract order (fundamentals first), then anything else an editor published.
  const order = (slug: string) => {
    const i = [...config.modules, ...config.guides].indexOf(slug);
    return i < 0 ? 999 : i;
  };
  const modules = [...(catalog?.modules ?? [])].sort((a, b) => order(a.slug) - order(b.slug) || a.sort_order - b.sort_order);
  const guides = [...(catalog?.premium_guides ?? [])].sort((a, b) => order(a.slug) - order(b.slug));

  return (
    <Shell>
      <section className="page-header">
        <div>
          <p className="eyebrow">{config.serviceName}</p>
          <h1>{t('modules.title')}</h1>
          <p>{t('modules.lead')}</p>
        </div>
      </section>
      {failed ? <ErrorPanel message={t('modules.loadFailed')} onRetry={retry} /> : !catalog ? (
        <><SkeletonGrid cards={8} /><SkeletonGrid cards={4} /></>
      ) : (
        <>
          <section className="panel" aria-labelledby="free">
            <h2 id="free">{t('modules.freeTitle')}</h2>
            {modules.length ? <div className="feature-grid catalog-grid">{modules.map((m) => <ModuleCard key={m.id} entry={m} />)}</div> : <p>{t('modules.noneYet')}</p>}
          </section>
          <section className="panel" aria-labelledby="guides">
            <h2 id="guides">{t('modules.guidesTitle')}</h2>
            {!access.premium ? <p className="muted-note">{t('modules.guidesLocked')}</p> : null}
            {guides.length ? <div className="feature-grid catalog-grid">{guides.map((g) => <ModuleCard key={g.id} entry={g} premium />)}</div> : <p>{t('modules.noGuides')}</p>}
          </section>
          <div className="hero-actions"><Link to="/" className="btn ghost">{t('common.backHome')}</Link></div>
        </>
      )}
    </Shell>
  );
};
