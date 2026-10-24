import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEnglish } from '../../app/EnglishContext';
import { catalogs, useI18n, useT } from '../../i18n';
import {
  explanationFor,
  HANDBOOK_LEVELS,
  ruleSlugForTopic,
  searchHandbook,
  type HandbookEntry,
  type HandbookLevel,
} from '../../lib/handbookSearch';
import { useResource } from '../../lib/useResource';
import { EmptyState, ErrorState, LevelBadge, Loading, PageHeader, Panel, Segmented } from '../../ui/kit';
import { getHandbook } from './handbookApi';
import './handbook.css';

type LevelFilter = 'all' | HandbookLevel;

/** A topic's display name in every language, so "артикли" or "artikllar" find the articles rules. */
const topicLabels = (focus: string): string[] =>
  (['en', 'ru', 'uz'] as const).flatMap((locale) => {
    const label = catalogs[locale][`topic.${focus}`];
    return label ? [label] : [];
  });

const Rule = ({ entry, open, onToggle }: { entry: HandbookEntry; open: boolean; onToggle: (open: boolean) => void }) => {
  const t = useT();
  const { locale } = useI18n();
  const explanation = explanationFor(entry, locale);
  const topicKey = entry.focus_area ? `topic.${entry.focus_area}` : null;
  const topic = topicKey && catalogs.en[topicKey] ? t(topicKey) : null;
  const examples = entry.examples.filter((example) => example.good);

  return (
    <details
      id={entry.slug}
      className="hb-rule"
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        if (next !== open) onToggle(next);
      }}
    >
      <summary>
        <span className="hb-rule-head">
          <span lang="en">{entry.title}</span>
          {topic ? <small>{topic}</small> : null}
        </span>
        <LevelBadge level={entry.level} muted />
      </summary>
      <div className="en-tools-body en-stack hb-rule-body">
        {explanation.fallback ? <p className="hint">{t('handbook.englishOnly')}</p> : null}
        <p className="en-passage hb-explanation" lang={explanation.fallback ? 'en' : locale}>{explanation.text}</p>
        {locale !== 'en' && !explanation.fallback ? (
          <details className="hb-english">
            <summary>{t('handbook.showEnglish')}</summary>
            <p className="en-passage hb-explanation" lang="en">{entry.explanation.en}</p>
          </details>
        ) : null}
        {entry.contrast_text ? <p className="en-explain" lang="en">{entry.contrast_text}</p> : null}
        {examples.length ? (
          <div className="en-stack" style={{ gap: '.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '.95rem' }}>{t('handbook.examples')}</h3>
            <ul className="en-list">
              {examples.map((example, index) => (
                <li key={index} className="en-diff" lang="en" style={{ fontSize: '.95rem' }}>
                  {example.bad ? <><del>{example.bad}</del><span aria-hidden="true"> → </span></> : null}
                  <ins>{example.good}</ins>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {entry.common_error_pattern ? (
          <p className="hint"><strong>{t('handbook.mistake')}</strong> <span lang="en">{entry.common_error_pattern}</span></p>
        ) : null}
        <div className="en-actions">
          <Link className="en-button" to={`/grammar/${encodeURIComponent(entry.slug)}`}>{t('handbook.practise')}</Link>
        </div>
      </div>
    </details>
  );
};

/**
 * The grammar handbook: every published rule, searchable in any language and
 * filtered by level. `#<slug>` opens one rule; `?topic=<topic>` (from mistake
 * lists) opens the rule for that topic at or below the learner's level.
 */
export const GrammarHandbook = () => {
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const searchId = useId();
  const { onboarding } = useEnglish();
  const level = onboarding.value?.perSkill.grammar ?? onboarding.value?.level ?? null;
  const handbook = useResource((signal) => getHandbook(signal), []);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LevelFilter>('all');
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [topicMissing, setTopicMissing] = useState(false);
  const scrolledTo = useRef<string | null>(null);

  const entries = useMemo(() => handbook.data?.entries ?? [], [handbook.data]);
  const target = decodeURIComponent(location.hash.slice(1));
  const topic = new URLSearchParams(location.search).get('topic');

  // A mistake link names a topic: swap it for the rule's own address once the rules and level are known.
  useEffect(() => {
    if (!topic || !handbook.data || onboarding.status === 'loading') return;
    const slug = ruleSlugForTopic(entries, topic, level);
    setTopicMissing(!slug);
    navigate({ pathname: location.pathname, search: '', hash: slug ? `#${slug}` : '' }, { replace: true });
  }, [topic, handbook.data, entries, level, onboarding.status, navigate, location.pathname]);

  // Opening a rule's address: show it even if a filter or search would hide it.
  useEffect(() => {
    if (!target || !entries.some((entry) => entry.slug === target)) return;
    scrolledTo.current = null;
    setQuery('');
    setFilter('all');
    setOpen((current) => (current.has(target) ? current : new Set(current).add(target)));
  }, [target, entries]);

  const visible = useMemo(
    () => searchHandbook(entries, query, { level: filter, topicLabels }),
    [entries, query, filter],
  );

  useEffect(() => {
    if (!target || scrolledTo.current === target || !open.has(target)) return;
    const element = document.getElementById(target);
    if (!element) return;
    scrolledTo.current = target;
    element.scrollIntoView({ block: 'start' });
    element.querySelector('summary')?.focus({ preventScroll: true });
  }, [target, open, visible]);

  const toggle = (slug: string, next: boolean) =>
    setOpen((current) => {
      const copy = new Set(current);
      if (next) copy.add(slug);
      else copy.delete(slug);
      return copy;
    });

  const levelsPresent = HANDBOOK_LEVELS.filter((entry) => entries.some((item) => item.level === entry));
  const searching = query.trim().length > 0;
  const groups = searching
    ? [{ level: null, items: visible }]
    : levelsPresent.map((entry) => ({ level: entry, items: visible.filter((item) => item.level === entry) })).filter((group) => group.items.length);

  return (
    <>
      <PageHeader
        back={{ to: '/grammar', label: t('handbook.back') }}
        eyebrow={t('handbook.eyebrow')}
        title={t('handbook.title')}
        lead={t('handbook.lead')}
        actions={level ? <span className="en-row"><span className="hint">{t('handbook.yourLevel')}</span><LevelBadge level={level} /></span> : null}
      />

      {topicMissing ? <p className="en-notice" role="status">{t('handbook.topicMissing')}</p> : null}

      <Panel>
        <div className="hb-controls">
          <div className="en-stack" style={{ gap: '.35rem' }}>
            <label htmlFor={searchId}>{t('handbook.search.label')}</label>
            <div className="hb-search">
              <input
                id={searchId}
                type="search"
                value={query}
                autoComplete="off"
                spellCheck={false}
                placeholder={t('handbook.search.placeholder')}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query ? <button type="button" className="quiet" onClick={() => setQuery('')}>{t('handbook.search.clear')}</button> : null}
            </div>
          </div>
          {levelsPresent.length > 1 ? (
            <Segmented
              label={t('handbook.level.label')}
              value={filter}
              options={[{ value: 'all' as LevelFilter, label: t('handbook.level.all') }, ...levelsPresent.map((entry) => ({ value: entry as LevelFilter, label: entry }))]}
              onChange={setFilter}
            />
          ) : null}
        </div>
        {handbook.data ? <p className="hint" role="status" aria-live="polite">{t('handbook.count', { count: visible.length })}</p> : null}
      </Panel>

      {handbook.loading && !handbook.data ? <Panel><Loading lines={6} /></Panel> : null}
      {handbook.error ? <ErrorState error={handbook.error} onRetry={handbook.reload} /> : null}

      {handbook.data && entries.length === 0 ? (
        <Panel><EmptyState title={t('handbook.none.title')} body={t('handbook.none.body')} /></Panel>
      ) : null}

      {handbook.data && entries.length > 0 && visible.length === 0 ? (
        <Panel>
          <EmptyState
            title={t('handbook.empty.title')}
            body={t('handbook.empty.body')}
            action={<button type="button" onClick={() => { setQuery(''); setFilter('all'); }}>{t('handbook.empty.reset')}</button>}
          />
        </Panel>
      ) : null}

      {groups.map((group) => (
        <Panel key={group.level ?? 'results'} title={group.level ? <LevelBadge level={group.level} /> : undefined}>
          <div className="en-tools">
            {group.items.map((entry) => (
              <Rule key={entry.slug} entry={entry} open={open.has(entry.slug)} onToggle={(next) => toggle(entry.slug, next)} />
            ))}
          </div>
        </Panel>
      ))}
    </>
  );
};
