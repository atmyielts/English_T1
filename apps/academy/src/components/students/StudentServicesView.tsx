import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Flag, RefreshCw, Target } from 'lucide-react';
import { translate } from '../../i18n';
import {
  teacherStudioCreateStudentServiceRequest,
  teacherStudioStudentLearningPlans,
  teacherStudioStudentServiceRequests,
  teacherStudioSubmitSensitiveReport,
  type AcademyOperationalRecord,
  type AcademyServiceRequest,
  type TeacherStudioClassroom,
} from '../../lib/client';

type Props = {
  academyId: string;
  mode: 'requests' | 'plan';
  classrooms: TeacherStudioClassroom[];
  formatDate: (value: string | null | undefined) => string;
};

const text = (record: Record<string, unknown>, key: string): string => String(record[key] ?? '');
const label = (input: unknown): string => translate(String(input ?? '').replaceAll('_', ' '));

export function StudentServicesView({ academyId, mode, classrooms, formatDate }: Props) {
  const [requests, setRequests] = useState<AcademyServiceRequest[]>([]);
  const [plans, setPlans] = useState<AcademyOperationalRecord[]>([]);
  const [items, setItems] = useState<AcademyOperationalRecord[]>([]);
  const [competencies, setCompetencies] = useState<AcademyOperationalRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [request, setRequest] = useState({
    request_type: 'support',
    subject: '',
    details: '',
    classroom_id: '',
    desired_date: '',
  });
  const [report, setReport] = useState({
    case_type: 'complaint',
    title: '',
    description: '',
    severity: 'medium',
  });

  const load = useCallback(async () => {
    setError('');
    try {
      if (mode === 'requests') {
        const response = await teacherStudioStudentServiceRequests(academyId);
        setRequests(response.requests ?? []);
      } else {
        const response = (await teacherStudioStudentLearningPlans(academyId)) as unknown as {
          plans: AcademyOperationalRecord[];
          items: AcademyOperationalRecord[];
          competencies: AcademyOperationalRecord[];
        };
        setPlans(response.plans ?? []);
        setItems(response.items ?? []);
        setCompetencies(response.competencies ?? []);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }, [academyId, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (work: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      setNotice(success);
      setShowForm(false);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusy(false);
    }
  };

  const competencyById = useMemo(() => new Map(competencies.map((item) => [item.id, item])), [competencies]);

  if (mode === 'plan') {
    return (
      <section className="student-service-view">
        <header className="section-heading">
          <div>
            <span className="eyebrow">
              <Target size={14} /> {translate('My learning plan')}
            </span>
            <h2>{translate('What I am working toward')}</h2>
            <p>
              {translate(
                'Goals published by your academy, with the evidence and progress your teachers have recorded.',
              )}
            </p>
          </div>
          <button className="ghost-btn" type="button" onClick={() => void load()}>
            <RefreshCw size={16} /> {translate('Refresh')}
          </button>
        </header>
        {error ? (
          <p className="form-error" role="alert">
            {translate(error)}
          </p>
        ) : null}
        <div className="student-plan-list">
          {plans.map((plan) => {
            const planItems = items.filter((item) => text(item, 'plan_id') === plan.id);
            return (
              <article className="panel" key={plan.id}>
                <div className="section-heading">
                  <div>
                    <h3>{text(plan, 'title')}</h3>
                    <p>{text(plan, 'goal')}</p>
                  </div>
                  <span className="status status--ok">{label(text(plan, 'status'))}</span>
                </div>
                <div className="progress-goals">
                  {planItems.map((item) => {
                    const competency = competencyById.get(text(item, 'competency_id'));
                    const current = Number(item.current_level ?? item.baseline_level ?? 0);
                    const target = Math.max(1, Number(item.target_level ?? 1));
                    return (
                      <div key={item.id}>
                        <div>
                          <strong>{text(competency ?? {}, 'title') || translate('Learning goal')}</strong>
                          <span>
                            {current} / {target}
                          </span>
                        </div>
                        <progress max={target} value={Math.min(current, target)} />
                        <small>{label(text(item, 'status'))}</small>
                      </div>
                    );
                  })}
                  {planItems.length === 0 ? (
                    <p className="muted">
                      {translate(
                        'Your teacher has published the plan. Specific goals will appear here when they are added.',
                      )}
                    </p>
                  ) : null}
                </div>
              </article>
            );
          })}
          {plans.length === 0 && !error ? (
            <div className="panel empty-state">
              <Target size={22} />
              <h3>{translate('No learning plan has been published yet')}</h3>
              <p>{translate('Your classes still work normally. Ask your teacher if you expect an individual plan.')}</p>
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="student-service-view">
      <header className="section-heading">
        <div>
          <span className="eyebrow">
            <CalendarClock size={14} /> {translate('My requests')}
          </span>
          <h2>{translate('Ask the academy for help')}</h2>
          <p>
            {translate(
              'Use one clear request for schedule changes, make-up lessons, freezes, transfers, documents, refunds, or general support.',
            )}
          </p>
        </div>
        <button
          className="primary-btn"
          type="button"
          aria-expanded={showForm}
          onClick={() => setShowForm((open) => !open)}
        >
          {showForm ? translate('Close form') : translate('New request')}
        </button>
      </header>
      {error ? (
        <p className="form-error" role="alert">
          {translate(error)}
        </p>
      ) : null}
      {notice ? (
        <p className="form-success" role="status">
          {translate(notice)}
        </p>
      ) : null}
      {showForm ? (
        <form
          className="panel compact-form student-request-form"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void run(
              () =>
                teacherStudioCreateStudentServiceRequest(academyId, {
                  ...request,
                  classroom_id: request.classroom_id || null,
                  desired_date: request.desired_date || null,
                }),
              'Your request was sent. You can follow its status here.',
            );
          }}
        >
          <div className="form-grid two-col">
            <label>
              {translate('What do you need?')}
              <select
                className="input"
                value={request.request_type}
                onChange={(event) => setRequest({ ...request, request_type: event.target.value })}
              >
                {['make_up', 'freeze', 'transfer', 'schedule_change', 'document', 'refund', 'support', 'other'].map(
                  (type) => (
                    <option key={type} value={type}>
                      {label(type)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              {translate('Classroom, if relevant')}
              <select
                className="input"
                value={request.classroom_id}
                onChange={(event) => setRequest({ ...request, classroom_id: event.target.value })}
              >
                <option value="">{translate('Not about one classroom')}</option>
                {classrooms.map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>
                    {classroom.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            {translate('Short title')}
            <input
              className="input"
              value={request.subject}
              onChange={(event) => setRequest({ ...request, subject: event.target.value })}
              required
            />
          </label>
          <label>
            {translate('What should the academy know?')}
            <textarea
              className="input"
              value={request.details}
              onChange={(event) => setRequest({ ...request, details: event.target.value })}
              required
            />
          </label>
          <label>
            {translate('Preferred date, if any')}
            <input
              className="input"
              type="date"
              value={request.desired_date}
              onChange={(event) => setRequest({ ...request, desired_date: event.target.value })}
            />
          </label>
          <button className="primary-btn" disabled={busy}>
            {translate('Send request')}
          </button>
        </form>
      ) : null}
      <div className="student-request-list">
        {requests.map((item) => (
          <article className="panel" key={item.id}>
            <div>
              <strong>{item.subject}</strong>
              <p>
                {label(item.request_type)} · {formatDate(item.created_at)}
              </p>
            </div>
            <span
              className={
                ['completed', 'approved'].includes(item.status) ? 'status status--ok' : 'status status--pending'
              }
            >
              {label(item.status)}
            </span>
          </article>
        ))}
        {requests.length === 0 && !error ? (
          <div className="panel empty-state">
            <CalendarClock size={22} />
            <h3>{translate('No requests yet')}</h3>
            <p>{translate('When you need an academy decision, start here instead of wondering whom to contact.')}</p>
          </div>
        ) : null}
      </div>
      <details className="sensitive-report">
        <summary>
          <Flag size={16} /> {translate('Report a serious or private concern')}
        </summary>
        <form
          className="panel compact-form"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void run(
              () =>
                teacherStudioSubmitSensitiveReport({
                  academy_id: academyId,
                  reporter_kind: 'student',
                  ...report,
                }),
              'Your private report was sent to the restricted case team.',
            );
          }}
        >
          <p>
            {translate(
              'Use this for safeguarding, harassment, privacy, conduct, or another concern that should not enter the normal request queue.',
            )}
          </p>
          <div className="form-grid two-col">
            <label>
              {translate('Concern type')}
              <select
                className="input"
                value={report.case_type}
                onChange={(event) => setReport({ ...report, case_type: event.target.value })}
              >
                {['complaint', 'safeguarding', 'harassment', 'conduct', 'privacy', 'academic_integrity', 'other'].map(
                  (type) => (
                    <option key={type} value={type}>
                      {label(type)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              {translate('Urgency')}
              <select
                className="input"
                value={report.severity}
                onChange={(event) => setReport({ ...report, severity: event.target.value })}
              >
                {['low', 'medium', 'high', 'critical'].map((severity) => (
                  <option key={severity} value={severity}>
                    {label(severity)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            {translate('Short title')}
            <input
              className="input"
              value={report.title}
              onChange={(event) => setReport({ ...report, title: event.target.value })}
              required
            />
          </label>
          <label>
            {translate('What happened?')}
            <textarea
              className="input"
              value={report.description}
              onChange={(event) => setReport({ ...report, description: event.target.value })}
              required
            />
          </label>
          <button className="primary-btn" disabled={busy}>
            {translate('Send private report')}
          </button>
        </form>
      </details>
    </section>
  );
}
