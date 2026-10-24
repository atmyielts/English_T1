import { Link } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { useT } from '../i18n';
import { focusSkillOf } from '../lib/focusSkill';
import { skillByKey } from '../lib/skills';
import { Panel, SkillDot } from '../ui/kit';

/** Today, for a learner who bought exactly one skill: a quiet shortcut back to it. */
export const FocusSkillCard = () => {
  const t = useT();
  const { access } = useEnglish();
  const skill = skillByKey(focusSkillOf(access));
  if (!skill) return null;
  const name = t(`skill.${skill.key}`);
  return (
    <Panel title={<><SkillDot skill={skill.key} /> {t('pwa.focus.title', { skill: name })}</>}>
      <p>
        {t('pwa.focus.body', { skill: name })}
        {access.freePerDay > 0 ? ` ${t('pwa.focus.free')}` : ''}
      </p>
      <div className="en-actions">
        <Link className="en-button" to={skill.path}>{t('pwa.focus.cta', { skill: name })}</Link>
      </div>
    </Panel>
  );
};
