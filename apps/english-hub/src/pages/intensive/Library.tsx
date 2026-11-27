import { Link, useSearchParams } from 'react-router-dom';
import { useEnglish } from '../../app/EnglishContext';
import { useT } from '../../i18n';
import { CEFR_LEVELS, skillByKey, type CefrLevel } from '../../lib/skills';
import { useResource } from '../../lib/useResource';
import { EmptyState, ErrorState, LevelBadge, Loading, PageHeader, Panel, Segmented, SkillDot, Tag } from '../../ui/kit';
import { intensiveSkills, sessionMinutes } from '../../../../../supabase/functions/_shared/english-intensive';
import { curriculumOutcomes } from '../../../../../supabase/functions/_shared/english-curriculum';
import { getIntensive } from './api';
import './intensive.css';

export const IntensiveLibrary = () => {
  const t = useT();
  const { onboarding, session, pricingHref } = useEnglish();
  const [params, setParams] = useSearchParams();
  const skill = skillByKey(params.get('skill'))?.key;
  const selected = CEFR_LEVELS.find((level) => level === params.get('level'));
  const level = selected ?? (skill ? onboarding.value?.perSkill[skill] : undefined) ?? onboarding.value?.level ?? 'A1';
  const library = useResource(getIntensive, [session?.user.id]);
  const units = library.data?.units.filter((unit) => unit.level === level) ?? [];
  const visibleSkills = skill ? [skill] : intensiveSkills;
  const progress = new Map(library.data?.progress.map((row) => [`${row.unit_slug}/${row.skill}`, row]));
  const minutes = units.reduce((total, unit) => {
    if (skill === 'listening') return total + (unit.listening_ready ? sessionMinutes(skill) : 0);
    if (skill) return total + sessionMinutes(skill);
    return total + (library.data?.core_unit_minutes ?? 0) + (unit.listening_ready ? sessionMinutes('listening') : 0);
  }, 0);
  const listeningPending = units.some((unit) => !unit.listening_ready);
  const outcomes = curriculumOutcomes[level].filter((entry) => units.some((unit) => unit.slug === entry.unit));

  const setLevel = (value: CefrLevel) => {
    const next = new URLSearchParams(params);
    next.set('level', value);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        back={{ to: skill ? `/${skill}` : '/practice', label: skill ? t(`skill.${skill}`) : t('nav.practice') }}
        title={t('intensive.title')}
        lead={t(skill ? 'intensive.skillLead' : 'intensive.lead', { skill: skill ? t(`skill.${skill}`) : '' })}
      />
      <div className="intensive-toolbar">
        <Segmented label={t('skill.library.filter')} value={level} onChange={setLevel}
          options={CEFR_LEVELS.map((entry) => ({ value: entry, label: entry }))} />
        {skill ? <Link className="en-button-quiet" to={`/intensive?level=${level}`}>{t('intensive.allSkills')}</Link> : null}
      </div>
      {library.error ? <ErrorState error={library.error} onRetry={library.reload} /> : null}
      {library.loading && !library.data ? <Loading lines={5} /> : null}
      {library.data && !units.length ? <EmptyState title={t('skill.library.empty')} /> : null}
      {minutes ? <p className="intensive-summary">{t('intensive.libraryCount', { count: units.length, hours: Math.floor(minutes / 60) })}</p> : null}
      {listeningPending && (!skill || skill === 'listening') ? <p className="hint">{t('intensive.audioSoonBody')}</p> : null}
      {!skill && outcomes.length ? (
        <Panel title={t('intensive.outcomesTitle')}>
          <ul className="en-list">
            {outcomes.map((entry) => {
              const ready = library.data?.available_skills.includes(entry.skill);
              const paused = library.data?.paused_skills.includes(entry.skill);
              const copy = <span className="en-item-main">
                <strong>{t(`intensive.mode.${entry.mode}`)}</strong>
                <span lang="en">{entry.goal}</span>
              </span>;
              return (
                <li key={entry.mode}>
                  {ready ? <Link className="en-item" to={`/intensive/${entry.unit}/${entry.skill}`}>
                    {copy}<span className="en-button-quiet">{t('intensive.openPractice')}</span>
                  </Link> : paused ? <div className="en-item">{copy}<Tag>{t('intensive.paused')}</Tag></div>
                    : <a className="en-item" href={pricingHref(entry.skill)}>{copy}<Tag>{t('practice.locked')}</Tag></a>}
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}
      <div className="intensive-library">
        {units.map((unit) => {
          const finished = visibleSkills.filter((key) => progress.get(`${unit.slug}/${key}`)?.completed).length;
          return (
            <Panel key={unit.slug} title={<span lang="en">{unit.title}</span>}
              aside={<LevelBadge level={unit.level} />} className="intensive-unit">
              <p lang="en">{unit.summary}</p>
              <ul className="intensive-skill-list" aria-label={unit.title}>
                {visibleSkills.map((key) => {
                  const record = progress.get(`${unit.slug}/${key}`);
                  const label = t(`skill.${key}`);
                  const owned = library.data?.available_skills.includes(key);
                  const paused = library.data?.paused_skills.includes(key);
                  const comingSoon = key === 'listening' && !unit.listening_ready;
                  const linkText = (
                    <><SkillDot skill={key} /><span>{label}</span>
                      {!comingSoon ? <small>{t('common.minutesShort', { count: sessionMinutes(key) })}</small> : null}
                      {record?.completed ? <span className="intensive-done" aria-label={t('intensive.complete')}>✓</span> : null}
                    </>
                  );
                  return (
                    <li key={key}>
                      {comingSoon ? <span aria-disabled="true">{linkText}<Tag>{t('intensive.audioSoon')}</Tag></span> : owned ? (
                        <Link aria-label={`${label} · ${unit.title}`} to={`/intensive/${unit.slug}/${key}`}>{linkText}</Link>
                      ) : paused ? <span aria-disabled="true">{linkText}<Tag>{t('intensive.paused')}</Tag></span>
                        : <a href={pricingHref(key)}>{linkText}<Tag>{t('practice.locked')}</Tag></a>}
                    </li>
                  );
                })}
              </ul>
              {finished ? <p className="hint">{t('intensive.unitProgress', { done: finished, total: visibleSkills.length })}</p> : null}
            </Panel>
          );
        })}
      </div>
    </>
  );
};
