import { Link } from 'react-router-dom';
import { L1Why } from '../../components/L1Why';
import { useT } from '../../i18n';
import { EXAM_SECTIONS, type MarkPriority, type MockResult, type PracticeLink, type SectionResult } from '../../lib/exam';
import { handbookTopicHref } from '../../lib/handbookSearch';
import { LevelBadge } from '../../ui/kit';
import { levelText } from './parts';
import '../../components/practice.css';

const practiceHref = (priority: Pick<MarkPriority, 'practice' | 'topic'>): string => {
  switch (priority.practice) {
    case 'grammar': return priority.topic ? handbookTopicHref(priority.topic) : '/grammar';
    case 'vocabulary': return '/vocabulary';
    case 'roleplay': return '/roleplay';
    case 'speaking': return '/speaking';
    default: return '/writing';
  }
};

/** One section's estimated score, what went wrong and what to practise. */
export const SectionResultView = ({ result }: { result: SectionResult }) => {
  const t = useT();
  const marked = result.marked;
  return (
    <div className="en-stack">
      <div className="en-bands">
        <div className="en-band is-overall">
          <small>{t(`exam.section.${result.section}`)} · {t('exam.result.estimate')}</small>
          <strong>{t('exam.result.score', { score: result.score })}</strong>
          <p>{levelText(result.level, t)}</p>
        </div>
        {result.objective ? result.objective.parts.map((part) => (
          <div key={part.id} className="en-band">
            <small>{t('exam.result.part', { part: part.id.slice(1) })} <LevelBadge level={part.level} muted /></small>
            <strong>{part.correct}/{part.total}</strong>
          </div>
        )) : null}
        {marked ? Object.entries(marked.parts).map(([key, part]) => (
          <div key={key} className="en-band">
            <small>{t(`exam.result.task.${key}`)}</small>
            <strong>{part.score}/{part.max}</strong>
            {part.comment ? <p lang="en">{part.comment}</p> : null}
          </div>
        )) : null}
      </div>
      {result.objective ? <p className="hint" style={{ margin: 0 }}>{t('exam.result.objectiveNote', { correct: result.objective.correct, total: result.objective.total })}</p> : null}
      {marked ? <p className="hint" style={{ margin: 0 }}>{t('exam.result.markedNote', { raw: marked.raw, max: marked.raw_max })}</p> : null}
      {result.section === 'speaking' ? <p className="hint" style={{ margin: 0 }}>{result.spoken ? t('exam.result.pronSpoken') : t('exam.result.pronTyped')}</p> : null}
      {result.overtime ? <p className="en-explain" style={{ margin: 0 }}>{t('exam.result.overtime')}</p> : null}

      {marked?.priorities.length ? (
        <div className="en-stack" style={{ gap: '.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '.95rem' }}>{t('exam.result.priorities')}</h3>
          <ol className="en-list" style={{ paddingLeft: '1.2rem' }}>
            {marked.priorities.map((priority, index) => (
              <li key={index} className="en-stack" style={{ gap: '.3rem' }}>
                <span lang="en">{priority.text}</span>
                <span><Link className="en-button-quiet" to={practiceHref(priority)}>{t(`exam.practice.${priority.practice}`)}</Link></span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {marked?.fixes.length ? (
        <div className="en-stack" style={{ gap: '.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '.95rem' }}>{t('exam.result.fixes')}</h3>
          <ul className="en-list">
            {marked.fixes.map((fix, index) => (
              <li key={index} className="en-stack" style={{ gap: '.3rem' }}>
                <span className="en-diff" lang="en"><del>{fix.said}</del> <span aria-hidden="true">→</span> <ins>{fix.better}</ins></span>
                {fix.why ? <span className="hint" lang="en">{fix.why}</span> : null}
                <L1Why noteId={fix.l1} original={fix.said} corrected={fix.better} explanation={fix.why} topic={fix.topic} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};

const PracticeLinks = ({ links }: { links: PracticeLink[] }) => {
  const t = useT();
  if (!links.length) return null;
  return (
    <div className="en-stack" style={{ gap: '.5rem' }}>
      <h3 style={{ margin: 0, fontSize: '.95rem' }}>{t('exam.result.fixNext')}</h3>
      <ul className="en-list">
        {links.map((link) => (
          <li key={`${link.skill}/${link.slug}`}>
            <Link to={`/${link.skill}/${encodeURIComponent(link.slug)}`}>{link.title}</Link>
            {' '}<LevelBadge level={link.level} muted /> <span className="hint">· {t(`exam.section.${link.section}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** A finished mock: the overall estimate (full mocks), every section, and where to practise next. */
export const MockResultView = ({ result }: { result: MockResult }) => {
  const t = useT();
  const sections = EXAM_SECTIONS.filter((section) => result.sections[section]);
  const weakest = result.summary.weakest;
  return (
    <div className="en-stack">
      {result.kind === 'full' ? (
        <div className="en-bands">
          <div className="en-band is-overall">
            <small>{t('exam.result.overall')}</small>
            <strong>{result.summary.overall === null ? '—' : t('exam.result.score', { score: result.summary.overall })}</strong>
            <p>{levelText(result.summary.level, t)}</p>
          </div>
          {sections.map((section) => (
            <div key={section} className="en-band">
              <small>{t(`exam.section.${section}`)}</small>
              <strong>{result.sections[section]!.score}</strong>
              <p>{levelText(result.sections[section]!.level, t)}</p>
            </div>
          ))}
        </div>
      ) : null}
      <p className="hint" style={{ margin: 0 }}>{t('exam.result.disclaimer')}</p>
      {result.kind === 'full' && weakest ? <p className="en-explain" style={{ margin: 0 }}>{t('exam.result.weakest', { section: t(`exam.section.${weakest}`) })}</p> : null}
      <PracticeLinks links={result.practice ?? []} />
      {sections.map((section) => (
        <details key={section} open={result.kind !== 'full'}>
          <summary style={{ cursor: 'pointer' }}><strong>{t(`exam.section.${section}`)}</strong> · {t('exam.result.score', { score: result.sections[section]!.score })}</summary>
          <div style={{ marginTop: '.75rem' }}><SectionResultView result={result.sections[section]!} /></div>
        </details>
      ))}
    </div>
  );
};
