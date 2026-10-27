import { Link } from 'react-router-dom';
import { Shell } from '../components/TopNav';
import { ErrorPanel, SkeletonGrid } from '../components/ui';
import { humanize, useDynamicT, useT } from '../i18n';
import type { CatalogEntry } from '../lib/api';
import { usePlaybook } from '../lib/context';
import { ModuleCard, useCatalog } from './LandingPage';

export const ModulesPage = () => {
  const t = useT();
  const dt = useDynamicT();
  const { config, access } = usePlaybook();
  const { catalog, failed, retry } = useCatalog();
  // Keep the contract order (fundamentals first), then anything else an editor published.
  const order = (slug: string) => {
    const i = [...config.modules, ...config.guides].indexOf(slug);
    return i < 0 ? 999 : i;
  };
  const modules = [...(catalog?.modules ?? [])].sort((a, b) => order(a.slug) - order(b.slug) || a.sort_order - b.sort_order);
  const guides = [...(catalog?.premium_guides ?? [])].sort((a, b) => order(a.slug) - order(b.slug));
  // Content sets metadata.module_group (e.g. domain_math); group the catalog by it.
  const groups: Array<{ key: string; entries: CatalogEntry[] }> = [];
  for (const entry of modules) {
    const key = typeof entry.metadata?.module_group === 'string' && entry.metadata.module_group ? String(entry.metadata.module_group) : 'other';
    const group = groups.find((g) => g.key === key);
    if (group) group.entries.push(entry);
    else groups.push({ key, entries: [entry] });
  }
  const moduleTitle = (slug: string | null) => modules.find((m) => m.slug === slug)?.title ?? null;

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
            {modules.length ? groups.map((group) => (
              <div key={group.key} className="catalog-group">
                {groups.length > 1 ? <h3 className="group-title">{dt(`group.${group.key}`, humanize(group.key))}</h3> : null}
                <div className="feature-grid catalog-grid">{group.entries.map((m) => <ModuleCard key={m.id} entry={m} />)}</div>
              </div>
            )) : <p>{t('modules.noneYet')}</p>}
          </section>
          <section className="panel" aria-labelledby="guides">
            <h2 id="guides">{t('modules.guidesTitle')}</h2>
            {!access.premium ? <p className="muted-note">{t('modules.guidesLocked')}</p> : null}
            {guides.length ? <div className="feature-grid catalog-grid">{guides.map((g) => <ModuleCard key={g.id} entry={g} premium parentTitle={moduleTitle(g.module_key)} />)}</div> : <p>{t('modules.noGuides')}</p>}
          </section>
          <div className="hero-actions"><Link to="/" className="btn ghost">{t('common.backHome')}</Link></div>
        </>
      )}
    </Shell>
  );
};
