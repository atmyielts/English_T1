import { translate } from '../../i18n';
import type { AssessmentReport, AssessmentSummary } from '../../lib/assessmentServices';

export function AssessmentReportView(
  { academy, name, code, title, report, summary, date }: {
    academy: string;
    name?: string;
    code: string;
    title: string;
    report: AssessmentReport;
    summary: AssessmentSummary;
    date: string;
  },
) {
  return (
    <article className='assessment-report'>
      <header>
        <span className='assessment-eyebrow'>{academy}{' · Schood'}</span>
        <h2>{translate('Assessment report')}</h2>
        <p>{title}</p>
        <strong>{name}</strong>
        <p>{translate('Candidate')} {code} · {date}</p>
      </header>
      <div className='assessment-report-result'>
        <div>
          <span>{translate('Assessment score')}</span>
          <strong>
            {summary.percent === null ? translate('Awaiting review') : `${summary.percent}%`}
          </strong>
        </div>
        <div>
          <span>{translate('Estimated level')}</span>
          <strong>{report.level || translate('Not estimated')}</strong>
        </div>
      </div>
      <div className='assessment-skill-grid'>
        {summary.skills.map((skill) => (
          <div key={skill.skill}>
            <span>{translate(skill.skill)}</span>
            <strong>
              {skill.percent === null
                ? translate(skill.pending ? 'Awaiting review' : 'Not assessed')
                : `${skill.percent}%`}
            </strong>
          </div>
        ))}
      </div>
      {([
        ['Assessment evidence', report.basis],
        ['Strengths', report.strengths],
        ['Recommended course', report.recommended_course],
        ['Next learning steps', report.next_steps],
        ['Learning plan', report.learning_plan],
      ] as const).filter(([, value]) => value).map(([label, value]) => (
        <section key={label}>
          <h3>{translate(label)}</h3>
          <p>{value}</p>
        </section>
      ))}
      <p className='assessment-caution'>
        {translate(
          'This is a learning and placement report, not an official IELTS result or CEFR certificate. Level estimates apply only to the evidence reviewed. Learning timelines depend on attendance, practice, and future assessments.',
        )}
      </p>
      <button
        className='secondary-btn assessment-no-print'
        type='button'
        onClick={() => window.print()}
      >
        {translate('Print or save report')}
      </button>
    </article>
  );
}
