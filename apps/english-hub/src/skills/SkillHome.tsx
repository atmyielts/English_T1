import { Suspense, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { useI18n, useT } from '../i18n';
import { getCatalog, getHistory, type CatalogEntry } from '../lib/hub';
import { CEFR_LEVELS, type CefrLevel, type SkillKey } from '../lib/skills';
import { useResource } from '../lib/useResource';
import { ServicePaused } from '../components/ServicePaused';
import { EmptyState, ErrorState, LevelBadge, Loading, LockedPanel, PageHeader, Panel, Segmented, SkillDot, Tag } from '../ui/kit';

export type SkillTool = { id: string; title: string; hint: string; render: () => ReactNode };

type LevelFilter = 'all' | CefrLevel;

/** The first unseen item at the learner's level, else the nearest level, else the lowest score. */
export const pickNext = (items: CatalogEntry[], best: Record<string, number>, level: CefrLevel | null): CatalogEntry | null => {
  if (!items.length) return null;
  const target = level ? CEFR_LEVELS.indexOf(level) : 1;
  const distance = (item: CatalogEntry) => Math.abs((item.level ? CEFR_LEVELS.indexOf(item.level) : target) - target);
  const level_ = (item: CatalogEntry) => (item.level ? CEFR_LEVELS.indexOf(item.level) : target);
  const goal = (item: CatalogEntry) => (item.goal_match ? 0 : 1);
  // Same order as the Today planner: nearest level, easier side first, goal topics, then difficulty, then slug.
  const unseen = items.filter((item) => best[item.id] === undefined)
    .sort((a, b) => distance(a) - distance(b) || level_(a) - level_(b) || goal(a) - goal(b) || a.difficulty - b.difficulty || a.slug.localeCompare(b.slug));
  if (unseen[0]) return unseen[0];
  return [...items].sort((a, b) => (best[a.id] ?? 0) - (best[b.id] ?? 0))[0] ?? null;
};

/**
 * Standard home screen for a skill: what you do here, what to do next, the
 * library by level, the AI tools that belong to this skill, and recent results.
 */
export const SkillHome = ({
  skill,
  tools = [],
  extra,
  itemHref = (item) => encodeURIComponent(item.slug),
}: {
  skill: SkillKey;
  tools?: SkillTool[];
  /** Skill-specific panel shown above the library (e.g. the vocabulary notebook). */
  extra?: ReactNode;
  itemHref?: (item: CatalogEntry) => string;
}) => {
  const t = useT();
  const { date } = useI18n();
  const { access, canPractise, isPaused, onboarding, pricingHref } = useEnglish();
  const catalog = useResource((signal) => getCatalog(skill, signal), [skill]);
  const history = useResource((signal) => getHistory(skill, signal), [skill]);
  const level = onboarding.value?.perSkill[skill] ?? onboarding.value?.level ?? null;
  const [filter, setFilter] = useState<LevelFilter>('all');
  const paused = isPaused(skill);
  const locked = !paused && !canPractise(skill);
  const usingFree = !paused && access.status === 'ready' && !access.unlocked.has(skill) && access.freeLeft > 0;
  const skillName = t(`skill.${skill}`);

  const items = useMemo(
    () => [...(catalog.data?.items ?? [])].sort((a, b) =>
      (a.level ? CEFR_LEVELS.indexOf(a.level) : 9) - (b.level ? CEFR_LEVELS.indexOf(b.level) : 9) || a.title.localeCompare(b.title)),
    [catalog.data],
  );
  const best = catalog.data?.best_scores ?? {};
  const next = pickNext(items, best, level);
  const levelsPresent = CEFR_LEVELS.filter((entry) => items.some((item) => item.level === entry));
  const visible = filter === 'all' ? items : items.filter((item) => item.level === filter);
  const done = items.filter((item) => best[item.id] !== undefined).length;

  return (
    <>
      <PageHeader
        back={{ to: '/practice', label: t('nav.practice') }}
        eyebrow={<span className="en-row" style={{ gap: '.4rem' }}><SkillDot skill={skill} />{t('skill.eyebrow')}</span>}
        title={skillName}
        lead={t(`skill.${skill}.lead`)}
        actions={level ? <span className="en-row"><span className="hint">{t('skill.yourLevel')}</span><LevelBadge level={level} /></span> : null}
      />

      {paused ? <ServicePaused service={skill} /> : null}
      {locked ? <LockedPanel skillName={skillName} pricingHref={pricingHref(skill)} freeUsed={access.freePerDay > 0} /> : null}
      {usingFree ? <p className="en-notice">{t('free.skillHint', { count: access.freeLeft })}</p> : null}

      {!locked && !paused && next ? (
        <section className="en-panel en-tone-lime">
          <div className="en-panel-head">
            <div>
              <p className="eyebrow">{best[next.id] !== undefined ? t('skill.next.retry') : t('skill.next.title')}</p>
              <h2>{next.title}</h2>
            </div>
            <div className="en-row">
              {next.level ? <LevelBadge level={next.level} /> : null}
              <Tag>{t('common.minutesShort', { count: next.minutes })}</Tag>
            </div>
          </div>
          <div className="en-actions">
            <Link className="en-button is-large" to={itemHref(next)}>{best[next.id] !== undefined ? t('skill.next.again') : t('skill.next.start')}</Link>
            {best[next.id] !== undefined ? <span className="hint">{t('skill.next.best', { score: best[next.id]! })}</span> : null}
          </div>
        </section>
      ) : null}

      {extra}

      <div className="en-grid-2">
        <Panel
          title={t('skill.library.title')}
          aside={catalog.data ? <span>{t('skill.library.done', { done, total: items.length })}</span> : null}
        >
          {levelsPresent.length > 1 ? (
            <Segmented<LevelFilter>
              label={t('skill.library.filter')}
              value={filter}
              onChange={setFilter}
              options={[{ value: 'all', label: t('skill.library.all') }, ...levelsPresent.map((entry) => ({ value: entry as LevelFilter, label: entry }))]}
            />
          ) : null}
          {catalog.loading && !catalog.data ? <Loading lines={5} /> : null}
          {catalog.error ? <ErrorState error={catalog.error} onRetry={catalog.reload} /> : null}
          {catalog.data && visible.length === 0 ? <EmptyState title={t('skill.library.empty')} /> : null}
          {visible.length ? (
            <ul className="en-list">
              {visible.map((item) => {
                const score = best[item.id];
                const content = (
                  <>
                    <span className={`en-check ${score !== undefined ? 'is-done' : ''}`.trim()} aria-hidden="true">{score !== undefined ? '✓' : ''}</span>
                    <span className="en-item-main">
                      <strong>{item.title}</strong>
                      <span>{score !== undefined ? t('skill.library.best', { score }) : t('skill.library.notTried')}</span>
                    </span>
                    <span className="en-item-meta">
                      {item.level ? <LevelBadge level={item.level} muted={item.level !== level} /> : null}
                      <Tag>{t('common.minutesShort', { count: item.minutes })}</Tag>
                    </span>
                  </>
                );
                return (
                  <li key={item.id}>
                    {locked ? <div className="en-item">{content}</div> : <Link className={`en-item ${score !== undefined ? 'is-done' : ''}`.trim()} to={itemHref(item)}>{content}</Link>}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </Panel>

        <div className="en-stack">
          {!locked && tools.length ? (
            <Panel title={t('skill.tools.title')}>
              <p className="hint">{t('skill.tools.lead')}</p>
              <div className="en-tools">
                {tools.map((tool) => (
                  <details key={tool.id}>
                    <summary><span>{tool.title}<small>{tool.hint}</small></span></summary>
                    <div className="en-tools-body">
                      <Suspense fallback={<Loading lines={3} />}>{tool.render()}</Suspense>
                    </div>
                  </details>
                ))}
              </div>
            </Panel>
          ) : null}

          <Panel title={t('skill.recent.title')}>
            {history.loading && !history.data ? <Loading lines={3} /> : null}
            {history.data && history.data.attempts.length === 0 ? <p>{t('skill.recent.empty')}</p> : null}
            {history.data?.attempts.length ? (
              <ul className="en-list">
                {history.data.attempts.slice(0, 6).map((attempt) => (
                  <li key={attempt.id} className="en-row" style={{ fontSize: '.85rem' }}>
                    <span style={{ flex: 1, minWidth: 0 }}>{attempt.title ?? skillName}</span>
                    <span className="hint">{date(attempt.submitted_at, { dateStyle: 'medium' })}</span>
                    {attempt.score !== null ? <Tag>{attempt.score}</Tag> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>
        </div>
      </div>
    </>
  );
};
