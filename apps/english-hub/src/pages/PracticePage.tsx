import { Link } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { useT } from '../i18n';
import { getCatalog } from '../lib/hub';
import { SKILLS } from '../lib/skills';
import { useResource } from '../lib/useResource';
import { ErrorState, LevelBadge, PageHeader, ProgressBar, SkillDot, Tag } from '../ui/kit';

export const PracticePage = () => {
  const t = useT();
  const { access, canPractise, onboarding, pricingHref } = useEnglish();
  const catalog = useResource((signal) => getCatalog(undefined, signal), []);
  const level = onboarding.value?.level ?? null;

  return (
    <>
      <PageHeader
        eyebrow={t('practice.eyebrow')}
        title={t('practice.title')}
        lead={t('practice.lead')}
        actions={<Link className="en-button-quiet" to="/today">{t('practice.backToToday')}</Link>}
      />
      {catalog.error ? <ErrorState error={catalog.error} onRetry={catalog.reload} /> : null}
      <div className="en-grid-cards">
        {SKILLS.map((skill) => {
          const items = (catalog.data?.items ?? []).filter((item) => item.skill === skill.key);
          const done = items.filter((item) => (catalog.data?.best_scores[item.id] ?? null) !== null).length;
          const skillLevel = onboarding.value?.perSkill[skill.key] ?? level;
          const atLevel = skillLevel ? items.filter((item) => item.level === skillLevel).length : null;
          const owned = access.unlocked.has(skill.key);
          const locked = !canPractise(skill.key);
          return (
            <Link key={skill.key} to={skill.path} className="en-skill-card">
              <h2><SkillDot skill={skill.key} />{t(`skill.${skill.key}`)}</h2>
              <p>{t(`skill.${skill.key}.what`)}</p>
              {catalog.data && items.length ? (
                <div className="en-stack" style={{ gap: '.4rem' }}>
                  <ProgressBar value={(done / items.length) * 100} label={t('practice.progressLabel', { skill: t(`skill.${skill.key}`) })} skill={skill.key} />
                  <small className="hint">{t('practice.done', { done, total: items.length })}</small>
                </div>
              ) : null}
              <footer>
                <span className="en-row" style={{ gap: '.4rem' }}>
                  {skillLevel ? <LevelBadge level={skillLevel} muted /> : null}
                  {atLevel !== null && catalog.data ? <span>{t('practice.atLevel', { count: atLevel })}</span> : null}
                </span>
                {locked ? <Tag>{t('practice.locked')}</Tag> : !owned && access.status === 'ready' ? <Tag>{t('free.tag')}</Tag> : <span aria-hidden="true">→</span>}
              </footer>
            </Link>
          );
        })}
      </div>
      {access.status === 'ready' && access.unlocked.size < SKILLS.length ? (
        <section className="en-panel en-tone-lime">
          <h2>{t('practice.unlock.title')}</h2>
          <p>{t('practice.unlock.body')}</p>
          <div className="en-actions"><a className="en-button" href={pricingHref()}>{t('practice.unlock.cta')}</a></div>
        </section>
      ) : null}
    </>
  );
};
