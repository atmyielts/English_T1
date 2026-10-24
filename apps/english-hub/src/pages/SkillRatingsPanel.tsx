import { Link } from 'react-router-dom';
import { useT } from '../i18n';
import { getRatings, IELTS_MOCK_URL, IELTS_PRACTICE_URL, type IeltsSkill, type RatingsResponse, type SkillRating } from '../lib/engine';
import { SKILLS } from '../lib/skills';
import { useResource } from '../lib/useResource';
import { LevelBadge, Loading, Panel, ProgressBar, SkillDot, Tag } from '../ui/kit';
import '../engine.css';

const IELTS_ORDER: IeltsSkill[] = ['listening', 'reading', 'writing', 'speaking'];

const band = (value: number) => value.toFixed(1);

const RatingRow = ({ rating }: { rating: SkillRating }) => {
  const t = useT();
  const skill = SKILLS.find((entry) => entry.key === rating.skill);
  if (!skill) return null;
  const name = t(`skill.${skill.key}`);
  return (
    <div className="en-rating-row">
      <Link to={skill.path}><SkillDot skill={skill.key} />{name}</Link>
      <div className="en-stack" style={{ gap: '.2rem' }}>
        {rating.level && rating.progress !== null ? (
          <>
            <ProgressBar value={rating.progress} label={t('engine.rating.barLabel', { skill: name })} skill={skill.key} />
            <small>
              {rating.next_level ? t('engine.rating.toward', { progress: rating.progress, level: rating.next_level }) : t('engine.rating.top')}
              {' · '}
              {rating.confidence === 'none' ? t('engine.rating.basis.none') : t('engine.rating.basis.some', { count: rating.attempts })}
            </small>
          </>
        ) : <small>{t('engine.rating.noData')}</small>}
      </div>
      {rating.level && rating.progress !== null
        ? <span className="en-rating-value">{t('engine.rating.value', { level: rating.level, progress: rating.progress })}</span>
        : <Tag>—</Tag>}
    </div>
  );
};

const IeltsBridge = ({ ielts }: { ielts: RatingsResponse['ielts'] }) => {
  const t = useT();
  const shown = IELTS_ORDER.filter((skill) => ielts.per_skill[skill] !== undefined);
  return (
    <Panel title={t('engine.ielts.title')} aside={<span className="en-estimate-tag">{t('engine.ielts.label')}</span>}>
      <p className="hint" style={{ marginTop: 0 }}>{t('engine.ielts.lead')}</p>
      {shown.length ? (
        <ul className="en-ielts-bands">
          {ielts.overall !== null ? (
            <li className="is-overall">
              <small>{t('engine.ielts.overall')}</small>
              <strong>{band(ielts.overall)}</strong>
            </li>
          ) : null}
          {shown.map((skill) => (
            <li key={skill}>
              <small>{t(`skill.${skill}`)}</small>
              <strong>{band(ielts.per_skill[skill]!)}</strong>
            </li>
          ))}
        </ul>
      ) : <p>{t('engine.ielts.empty')}</p>}
      {ielts.overall !== null && ielts.based_on.length < IELTS_ORDER.length
        ? <p className="hint">{t('engine.ielts.basedOn', { count: ielts.based_on.length })}</p>
        : null}
      {ielts.tentative ? <p className="hint">{t('engine.ielts.tentative')}</p> : null}
      <p className="hint">{t('engine.ielts.mockHint')}</p>
      <div className="en-actions">
        <a className="en-button" href={IELTS_MOCK_URL}>{t('engine.ielts.mock')}</a>
        <a className="en-button-quiet" href={IELTS_PRACTICE_URL}>{t('engine.ielts.practice')}</a>
      </div>
    </Panel>
  );
};

/** Fine-grained level per skill ("B1 · 62%") and the IELTS band estimate built from it. */
export const SkillRatingsPanel = ({ reloadKey = '' }: { reloadKey?: string }) => {
  const t = useT();
  const ratings = useResource((signal) => getRatings(signal), [reloadKey]);
  const data = ratings.data;
  const anyRated = data?.skills.some((rating) => rating.value !== null) ?? false;
  return (
    <div className="en-grid-2">
      <Panel title={t('engine.rating.title')}>
        <p className="hint" style={{ marginTop: 0 }}>{t('engine.rating.lead')}</p>
        {!data ? (
          ratings.error ? <p className="hint">{t('engine.rating.error')}</p> : <Loading lines={5} />
        ) : !anyRated ? (
          <p>{t('engine.rating.empty')}</p>
        ) : (
          <div className="en-ratings">
            {data.overall.level && data.overall.progress !== null ? (
              <div className="en-rating-overall">
                <span className="hint">{t('engine.rating.overall')}</span>
                <strong>{t('engine.rating.value', { level: data.overall.level, progress: data.overall.progress })}</strong>
                {data.target_level ? <><span aria-hidden="true">→</span><LevelBadge level={data.target_level} muted /></> : null}
              </div>
            ) : null}
            {data.skills.map((rating) => <RatingRow key={rating.skill} rating={rating} />)}
          </div>
        )}
      </Panel>
      {data ? <IeltsBridge ielts={data.ielts} /> : ratings.error ? null : <Panel title={t('engine.ielts.title')}><Loading lines={3} /></Panel>}
    </div>
  );
};
