import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  Plus,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { translate } from '../../i18n';
import {
  type AssessmentCandidate,
  assessmentCommand,
  type AssessmentItem,
  type AssessmentPaper,
  type AssessmentReport,
  type AssessmentWorkspace,
  assessmentWorkspace,
  skills,
} from '../../lib/assessmentServices';
import { teacherStudioConvertLead, teacherStudioUpsertClassroomMembership } from '../../lib/client';
import { AssessmentReportView } from './AssessmentReportView';
import './assessments.css';

const blankReport: AssessmentReport = {
  level: '',
  basis: '',
  strengths: '',
  next_steps: '',
  recommended_course: '',
  learning_plan: '',
  support_needed: false,
};
const newQuestion = (): AssessmentItem => ({
  id: crypto.randomUUID(),
  skill: 'grammar',
  kind: 'choice',
  prompt: '',
  rubric: '',
  passage: '',
  media_url: '',
  options: ['', '', '', ''],
  correct: 0,
  points: 1,
});
const statusLabel = (value: string) =>
  translate(
    ({
      invited: 'Registered',
      in_progress: 'Taking assessment',
      submitted: 'Needs review',
      reviewed: 'Ready to share',
      released: 'Report shared',
      draft: 'Preparing',
      open: 'Open',
      closed: 'Closed',
    } as Record<string, string>)[value] || value,
  );
const laneCopy = {
  placement: {
    title: 'Placement',
    intro: 'Help each learner start in the right course.',
    steps: ['Register students', 'Assess skills', 'Review the report', 'Choose a group'],
    icon: GraduationCap,
  },
  exam: {
    title: 'Exam day',
    intro: 'Prepare the session, welcome candidates, and share reviewed results.',
    steps: ['Prepare the paper', 'Register candidates', 'Open the session', 'Review and share'],
    icon: CalendarDays,
  },
  audit: {
    title: 'Academic progress',
    intro: 'Understand learning progress and decide where support will help.',
    steps: ['Set a baseline', 'Repeat the assessment', 'Compare the evidence', 'Plan support'],
    icon: TrendingUp,
  },
} as const;
type Lane = keyof typeof laneCopy;
type Props = {
  academyId: string;
  formatDate: (value: string | null | undefined) => string;
  onOpenContact: (id: string) => void;
  onOpenAdmissions: () => void;
};

function PaperBuilder(
  { busy, onSave }: { busy: boolean; onSave: (body: Record<string, unknown>) => Promise<boolean> },
) {
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState(45);
  const [items, setItems] = useState<AssessmentItem[]>([newQuestion()]);
  const change = (index: number, patch: Partial<AssessmentItem>) =>
    setItems((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (await onSave({ title, duration_minutes: minutes, items })) {
      setTitle('');
      setItems([newQuestion()]);
    }
  };
  return (
    <form className='assessment-form' onSubmit={(event) => void submit(event)}>
      <h3>{translate('Prepare an assessment paper')}</h3>
      <p className='muted'>
        {translate(
          'Write your own questions and marking guidance. Saved papers cannot be changed, so every result keeps the same reference.',
        )}
      </p>
      <div className='assessment-form-grid'>
        <label>
          {translate('Paper title')}
          <input
            className='input'
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          {translate('Time allowed (minutes)')}
          <input
            className='input'
            type='number'
            min={5}
            max={240}
            required
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          />
        </label>
      </div>
      {items.map((item, index) => (
        <fieldset className='assessment-question' key={item.id}>
          <legend>{translate('Question')} {index + 1}</legend>
          <div className='assessment-form-grid'>
            <label>
              {translate('Skill')}
              <select
                className='input'
                value={item.skill}
                onChange={(e) =>
                  change(index, {
                    skill: e.target.value as AssessmentItem['skill'],
                    ...(['speaking', 'writing'].includes(e.target.value)
                      ? {
                        kind: e.target.value === 'speaking'
                          ? 'interview' as const
                          : 'written' as const,
                      }
                      : {}),
                  })}
              >
                {skills.map((skill) => <option key={skill} value={skill}>{translate(skill)}
                </option>)}
              </select>
            </label>
            <label>
              {translate('Answer format')}
              <select
                className='input'
                value={item.kind}
                onChange={(e) => change(index, { kind: e.target.value as AssessmentItem['kind'] })}
              >
                {!['writing', 'speaking'].includes(item.skill) && (
                  <option value='choice'>{translate('Multiple choice')}</option>
                )}
                <option value='written'>{translate('Written response')}</option>
                <option value='interview'>{translate('Teacher interview')}</option>
              </select>
            </label>
          </div>
          <label>
            {translate('Question or task')}
            <textarea
              className='input'
              required
              maxLength={6000}
              value={item.prompt}
              onChange={(e) => change(index, { prompt: e.target.value })}
            />
          </label>
          <label>
            {translate('Reading text or task instructions')}
            <textarea
              className='input'
              maxLength={15000}
              value={item.passage}
              onChange={(e) => change(index, { passage: e.target.value })}
            />
          </label>
          {item.kind !== 'choice' && (
            <label>
              {translate('Teacher marking guidance')}
              <textarea
                className='input'
                required
                minLength={10}
                maxLength={3000}
                value={item.rubric || ''}
                onChange={(e) => change(index, { rubric: e.target.value })}
              />
              <small>
                {translate(
                  'Describe what earns each mark. This guidance is visible to teachers only.',
                )}
              </small>
            </label>
          )}
          {item.skill === 'listening' && (
            <label>
              {translate('Listening audio link')}
              <input
                className='input'
                type='url'
                placeholder={translate('Secure audio link')}
                required
                value={item.media_url}
                onChange={(e) => change(index, { media_url: e.target.value })}
              />
            </label>
          )}
          {item.kind === 'choice' && (
            <div className='assessment-options'>
              {item.options.map((option, optionIndex) => (
                <label key={optionIndex}>
                  <input
                    type='radio'
                    name={`correct-${item.id}`}
                    checked={item.correct === optionIndex}
                    onChange={() => change(index, { correct: optionIndex })}
                    aria-label={`${translate('Correct answer')} ${optionIndex + 1}`}
                  />
                  <input
                    className='input'
                    aria-label={`${translate('Answer choice')} ${optionIndex + 1}`}
                    required
                    maxLength={1000}
                    value={option}
                    onChange={(e) =>
                      change(index, {
                        options: item.options.map((old, i) =>
                          i === optionIndex ? e.target.value : old
                        ),
                      })}
                  />
                </label>
              ))}
            </div>
          )}
          <div className='assessment-form-grid'>
            <label>
              {translate('Maximum marks')}
              <input
                className='input'
                type='number'
                min={1}
                max={100}
                required
                value={item.points}
                onChange={(e) => change(index, { points: Number(e.target.value) })}
              />
            </label>
            {items.length > 1 && (
              <button
                type='button'
                className='secondary-btn'
                onClick={() => setItems(items.filter((_, i) => i !== index))}
              >
                {translate('Remove question')}
              </button>
            )}
          </div>
        </fieldset>
      ))}
      <div className='assessment-actions'>
        <button
          type='button'
          className='secondary-btn'
          disabled={items.length >= 100}
          onClick={() => setItems([...items, newQuestion()])}
        >
          <Plus size={16} />
          {translate('Add question')}
        </button>
        <button className='primary-btn' disabled={busy}>
          {translate('Save assessment paper')}
        </button>
      </div>
    </form>
  );
}

function ReportReview(
  { candidate, paper, busy, onSave }: {
    candidate: AssessmentCandidate;
    paper: AssessmentPaper;
    busy: boolean;
    onSave: (body: Record<string, unknown>) => Promise<boolean>;
  },
) {
  const [report, setReport] = useState<AssessmentReport>({ ...blankReport, ...candidate.report });
  const [notes, setNotes] = useState(candidate.review_notes || '');
  const [marks, setMarks] = useState<Record<string, number>>({ ...candidate.marks });
  return (
    <form
      className='assessment-form'
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({ candidate_id: candidate.id, report, review_notes: notes, marks });
      }}
    >
      <h3>{translate('Review the evidence')}</h3>
      <p className='muted'>
        {translate(
          'Check each response and record interview evidence before recommending a course. A score alone does not establish a CEFR level.',
        )}
      </p>
      {paper.items.map((item, index) => (
        <div className='assessment-question' key={item.id}>
          <strong>{index + 1}. {translate(item.skill)} · {item.prompt}</strong>
          <p className='assessment-response'>
            {item.kind === 'choice'
              ? (typeof candidate.answers[item.id] === 'number'
                ? item.options[Number(candidate.answers[item.id])]
                : null) || translate('No answer')
              : String(
                candidate.answers[item.id] || translate(
                  item.kind === 'interview'
                    ? 'Record interview evidence in review notes.'
                    : 'No answer',
                ),
              )}
          </p>
          {item.kind === 'choice'
            ? (
              <p>
                {translate('Automatically marked')}: {candidate.marks[item.id] ?? 0}/{item.points}
              </p>
            )
            : (
              <label>
                {translate('Awarded marks')} / {item.points}
                <p className='muted'>{item.rubric}</p>
                <input
                  className='input'
                  type='number'
                  min={0}
                  max={item.points}
                  step='0.5'
                  required
                  value={marks[item.id] ?? ''}
                  onChange={(e) => setMarks({ ...marks, [item.id]: Number(e.target.value) })}
                />
              </label>
            )}
        </div>
      ))}
      <label>
        {translate('Review notes and interview evidence')}
        <textarea
          className='input'
          required
          minLength={10}
          maxLength={5000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <label>
        {translate('Estimated level (optional)')}
        <select
          className='input'
          value={report.level}
          onChange={(e) => setReport({ ...report, level: e.target.value })}
        >
          <option value=''>{translate('Not estimated')}</option>
          {['Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((level) => (
            <option key={level}>{level}</option>
          ))}
        </select>
      </label>
      {([
        ['basis', 'Assessment evidence'],
        ['strengths', 'Strengths'],
        ['recommended_course', 'Recommended course'],
        ['next_steps', 'Next learning steps'],
        ['learning_plan', 'Learning plan'],
      ] as const).map(([key, label]) => (
        <label key={key}>
          {translate(label)}
          <textarea
            className='input'
            required={key === 'basis'}
            minLength={key === 'basis' ? 20 : undefined}
            maxLength={key === 'recommended_course' ? 200 : 3000}
            value={report[key]}
            onChange={(e) => setReport({ ...report, [key]: e.target.value })}
          />
        </label>
      ))}
      <p className='muted'>
        {translate(
          'Explain unassessed skills and uncertainty. Any learning timeline is a teacher planning estimate, not a guaranteed exam result.',
        )}
      </p>
      <label className='assessment-check'>
        <input
          type='checkbox'
          checked={report.support_needed}
          onChange={(e) => setReport({ ...report, support_needed: e.target.checked })}
        />
        {translate('Follow-up support recommended')}
      </label>
      <button className='primary-btn' disabled={busy}>
        {translate('Approve report for sharing')}
      </button>
    </form>
  );
}

export function AssessmentServicesView(
  { academyId, formatDate, onOpenContact, onOpenAdmissions }: Props,
) {
  const [data, setData] = useState<AssessmentWorkspace | null>(null);
  const [lane, setLane] = useState<Lane>('placement');
  const [runId, setRunId] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showPaper, setShowPaper] = useState(false);
  const [showRun, setShowRun] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [groupId, setGroupId] = useState('');
  const [leadId, setLeadId] = useState('');
  const [form, setForm] = useState({
    title: '',
    paper_id: '',
    classroom_id: '',
    starts_at: '',
    ends_at: '',
    capacity: 120,
    room: '',
    instructions: '',
  });
  const load = useCallback(async () => {
    const result = await assessmentWorkspace(academyId);
    setData(result);
  }, [academyId]);
  useEffect(() => {
    let live = true;
    setData(null);
    assessmentWorkspace(academyId).then((result) => {
      if (live) setData(result);
    }).catch((err: Error) => {
      if (live) setError(err.message);
    });
    return () => {
      live = false;
    };
  }, [academyId]);
  const perform = async (work: () => Promise<unknown>, message: string): Promise<boolean> => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      await load();
      setNotice(translate(message));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('Unable to save. Please try again.'));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const command = (name: string, body: Record<string, unknown>, message: string) =>
    perform(() => assessmentCommand(academyId, name, body), message);
  const visibleRuns = data?.runs.filter((run) => run.kind === lane) ?? [];
  const selectedRun = visibleRuns.find((run) => run.id === runId);
  const selectedCandidate = data?.candidates.find((candidate) =>
    candidate.id === candidateId && candidate.run_id === selectedRun?.id
  );
  const paper = data?.papers.find((p) => p.id === selectedRun?.paper_id);
  const roster = data?.candidates.filter((candidate) => candidate.run_id === selectedRun?.id) ?? [];
  const availableContacts = data?.contacts.filter((contact) =>
    !selectedRun?.classroom_id ||
    data.memberships.some((m) =>
      m.contact_id === contact.id && m.classroom_id === selectedRun.classroom_id
    )
  ) ?? [];
  const name = (id: string) => {
    const contact = data?.contacts.find((c) => c.id === id);
    return contact
      ? `${contact.first_name} ${contact.last_name}`.trim() || contact.email || translate('Student')
      : translate('Student');
  };
  const progressGroups = useMemo(() => {
    const groups = new Map<string, { paper: string; group: string; changes: number[] }>();
    for (const row of data?.progress ?? []) {
      const key = `${row.paper_id}:${row.classroom_id}`;
      const group = groups.get(key) ||
        {
          paper: data?.papers.find((p) => p.id === row.paper_id)?.title || '',
          group: data?.classrooms.find((c) => c.id === row.classroom_id)?.name ||
            translate('Intake students'),
          changes: [],
        };
      group.changes.push(row.change);
      groups.set(key, group);
    }
    return [...groups.values()];
  }, [data]);
  const switchLane = (next: Lane) => {
    setLane(next);
    setRunId('');
    setCandidateId('');
    setSelectedContacts([]);
    setShowRun(false);
  };
  const copy = laneCopy[lane];
  return (
    <div className='assessment-services'>
      <header className='assessment-intro'>
        <span className='assessment-eyebrow'>{translate('Assessment & learning support')}</span>
        <h2>{translate('The right starting point. Clearer progress.')}</h2>
        <p>
          {translate(
            'Place new learners with care, run organized exam days, and turn assessment evidence into useful next steps.',
          )}
        </p>
      </header>
      <nav className='assessment-lanes' aria-label={translate('Assessment services')}>
        {(Object.entries(laneCopy) as Array<[Lane, typeof copy]>).map(([key, value]) => (
          <button
            key={key}
            type='button'
            className={key === lane ? 'is-active' : ''}
            aria-pressed={key === lane}
            onClick={() => switchLane(key)}
          >
            <value.icon size={22} />
            <strong>{translate(value.title)}</strong>
            <span>{translate(value.intro)}</span>
          </button>
        ))}
      </nav>
      {error && (
        <div className='assessment-error' role='alert'>
          {translate(error)}
          <button
            className='secondary-btn'
            disabled={busy}
            onClick={() => void perform(load, 'Assessment workspace refreshed.')}
          >
            {translate('Try again')}
          </button>
        </div>
      )}
      {notice && <p className='assessment-notice' role='status'>{notice}</p>}
      {!data ? (!error && <p role='status'>{translate('Loading assessments…')}</p>) : (
        <>
          {data.limited && (
            <p className='assessment-caution'>
              {translate(
                'This workspace shows a limited history. Do not treat these figures as a complete center-wide audit.',
              )}
            </p>
          )}
          <ol className='assessment-journey'>
            {copy.steps.map((step, i) => (
              <li key={step}>
                <span>{i + 1}</span>
                {translate(step)}
              </li>
            ))}
          </ol>
          <div className='assessment-actions'>
            <button
              className='secondary-btn'
              disabled={busy}
              onClick={() => void perform(load, 'Assessment workspace refreshed.')}
            >
              <RefreshCw size={16} />
              {translate('Refresh')}
            </button>
            {data.permissions.run && (
              <button
                className='primary-btn'
                onClick={() => setShowRun(!showRun)}
              >
                <Plus size={16} />
                {translate('Plan assessment session')}
              </button>
            )}
            {data.permissions.create && (
              <button
                className='secondary-btn'
                onClick={() => setShowPaper(!showPaper)}
              >
                {translate('Prepare a paper')}
              </button>
            )}
            {lane === 'placement' && data.permissions.admissions && (
              <button className='secondary-btn' onClick={onOpenAdmissions}>
                {translate('Open admissions')}
              </button>
            )}
          </div>
          {showPaper && data.permissions.create && (
            <PaperBuilder
              busy={busy}
              onSave={(body) =>
                command(
                  'create_paper',
                  body,
                  'Assessment paper saved. You can now plan a session.',
                )}
            />
          )}
          {showRun && data.permissions.run && (
            <form
              className='assessment-form'
              onSubmit={(event) => {
                event.preventDefault();
                void command('create_run', {
                  ...form,
                  kind: lane,
                  classroom_id: form.classroom_id || null,
                  starts_at: new Date(form.starts_at).toISOString(),
                  ends_at: new Date(form.ends_at).toISOString(),
                }, 'Assessment session prepared. Register students, then open it.').then((ok) => {
                  if (ok) setShowRun(false);
                });
              }}
            >
              <h3>{translate('Plan assessment session')}</h3>
              <p className='muted'>
                {translate(
                  'For intake sessions, the teacher who prepared the paper reviews the submissions. Academy owners and administrators can also review them.',
                )}
              </p>
              {!data.papers.length && (
                <p className='assessment-caution'>
                  {translate(
                    'Ask a teacher to prepare a paper before planning your first session.',
                  )}
                </p>
              )}
              <div className='assessment-form-grid'>
                <label>
                  {translate('Session name')}
                  <input
                    className='input'
                    required
                    maxLength={200}
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </label>
                <label>
                  {translate('Assessment paper')}
                  <select
                    className='input'
                    required
                    value={form.paper_id}
                    onChange={(e) => setForm({ ...form, paper_id: e.target.value })}
                  >
                    <option value=''>{translate('Choose a paper')}</option>
                    {data.papers.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.title} · {p.duration_minutes} {translate('min')}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {translate('Group')}
                  <select
                    className='input'
                    required={!data.permissions.intake}
                    value={form.classroom_id}
                    onChange={(e) => setForm({ ...form, classroom_id: e.target.value })}
                  >
                    <option value=''>
                      {translate(data.permissions.intake ? 'Intake students' : 'Choose a group')}
                    </option>
                    {data.classrooms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label>
                  {translate('Available seats')}
                  <input
                    className='input'
                    type='number'
                    min={1}
                    max={500}
                    required
                    value={form.capacity}
                    onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                  />
                </label>
                <label>
                  {translate('Starts at')}
                  <input
                    className='input'
                    type='datetime-local'
                    required
                    value={form.starts_at}
                    onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                  />
                </label>
                <label>
                  {translate('Closes at')}
                  <input
                    className='input'
                    type='datetime-local'
                    required
                    value={form.ends_at}
                    onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                  />
                </label>
              </div>
              <label>
                {translate('Room or meeting point')}
                <input
                  className='input'
                  maxLength={200}
                  value={form.room}
                  onChange={(e) => setForm({ ...form, room: e.target.value })}
                />
              </label>
              <label>
                {translate('Candidate instructions')}
                <textarea
                  className='input'
                  maxLength={3000}
                  value={form.instructions}
                  onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                />
              </label>
              <p className='muted'>
                {translate(
                  'Times use your device timezone. The assessment ends at the earlier of the personal time limit or session closing time.',
                )}
              </p>
              <button className='primary-btn' disabled={busy || !data.papers.length}>
                {translate('Save session')}
              </button>
            </form>
          )}
          {lane === 'audit' && (
            <section className='assessment-form'>
              <h3>{translate('Progress on comparable assessments')}</h3>
              <p>
                {translate(
                  'Only students with at least two shared reports on the same paper and in the same group are compared. Changes are percentage points, not CEFR levels or proof of teacher effectiveness. Repeated questions may also improve through familiarity.',
                )}
              </p>
              {progressGroups.length
                ? (
                  <div className='assessment-progress'>
                    {progressGroups.map((group, index) => (
                      <article key={index}>
                        <span>{group.paper}</span>
                        <h4>{group.group}</h4>
                        <strong>
                          {(group.changes.reduce((sum, value) => sum + value, 0) /
                            group.changes.length).toFixed(1)} {translate('percentage points')}
                        </strong>
                        <p>{group.changes.length} {translate('matched students')}</p>
                      </article>
                    ))}
                  </div>
                )
                : (
                  <p className='assessment-empty'>
                    {translate(
                      'No comparable results yet. Run a baseline and a follow-up with the same paper, then review and share both reports.',
                    )}
                  </p>
                )}
            </section>
          )}
          {lane === 'audit' && data.progress.length > 0 && (
            <section className='assessment-form'>
              <h3>{translate('Individual progress')}</h3>
              <div className='assessment-progress'>
                {data.progress.map((row) => (
                  <article key={`${row.contact_id}:${row.paper_id}:${row.classroom_id}`}>
                    <strong>{name(row.contact_id)}</strong>
                    <span>
                      {data.papers.find((p) =>
                        p.id === row.paper_id
                      )?.title}
                    </span>
                    <p>
                      {row.baseline}% → {row.latest}% ({row.change > 0 ? '+' : ''}
                      {row.change} {translate('percentage points')})
                    </p>
                    <small>{formatDate(row.from)} → {formatDate(row.to)}</small>
                  </article>
                ))}
              </div>
            </section>
          )}
          <section className='assessment-form'>
            <h3>{translate('Assessment sessions')}</h3>
            {!visibleRuns.length
              ? (
                <p className='assessment-empty'>
                  {translate(
                    'No sessions yet. Start with a paper and a session date; student records and reports will stay together here.',
                  )}
                </p>
              )
              : (
                <div className='assessment-session-list'>
                  {visibleRuns.map((run) => (
                    <button
                      className={run.id === selectedRun?.id ? 'is-active' : ''}
                      key={run.id}
                      onClick={() => {
                        setRunId(run.id);
                        setCandidateId('');
                        setSelectedContacts([]);
                      }}
                    >
                      <strong>{run.title}</strong>
                      <span>
                        {formatDate(run.starts_at)} · {run.room || translate('Room not set')}
                      </span>
                      <span>
                        {statusLabel(run.status)} ·{' '}
                        {data.candidates.filter((c) => c.run_id === run.id).length}/{run.capacity}
                      </span>
                    </button>
                  ))}
                </div>
              )}
          </section>
          {selectedRun && (
            <section className='assessment-form'>
              <header className='assessment-actions'>
                <div>
                  <h3>{selectedRun.title}</h3>
                  <p>{paper?.title} · {paper?.duration_minutes} {translate('min')}</p>
                </div>
                {data.permissions.run && selectedRun.status === 'draft' && (
                  <button
                    className='primary-btn'
                    disabled={busy}
                    onClick={() =>
                      void command(
                        'open',
                        { run_id: selectedRun.id },
                        'Session opened. Registered students can start at the scheduled time.',
                      )}
                  >
                    {translate('Open session')}
                  </button>
                )}
                {data.permissions.run && selectedRun.status === 'open' && (
                  <button
                    className='secondary-btn'
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          translate(
                            'Close this session? Students will only be able to submit answers already saved.',
                          ),
                        )
                      ) {
                        void command(
                          'close',
                          { run_id: selectedRun.id },
                          'Session closed. Saved answers remain available for submission.',
                        );
                      }
                    }}
                  >
                    {translate('Close session')}
                  </button>
                )}
              </header>
              <p className='assessment-caution'>
                {translate(
                  'Students sign in to Academy with the email on their student record and open My assessments. Candidate IDs help staff check attendance; timers do not replace supervised exam conditions.',
                )}
              </p>
              {data.permissions.run && selectedRun.status !== 'closed' && (
                <details>
                  <summary>{translate('Register students')}</summary>
                  <p>
                    {translate(
                      'New applicant? Create the student record through Admissions or Contacts first. No paid enrollment is required to take a placement assessment.',
                    )}
                  </p>
                  <div className='assessment-candidate-picker'>
                    {availableContacts.filter((c) => !roster.some((r) => r.contact_id === c.id))
                      .map((contact) => (
                        <label className='assessment-check' key={contact.id}>
                          <input
                            type='checkbox'
                            checked={selectedContacts.includes(contact.id)}
                            onChange={(e) =>
                              setSelectedContacts(
                                e.target.checked
                                  ? [...selectedContacts, contact.id]
                                  : selectedContacts.filter((id) => id !== contact.id),
                              )}
                          />
                          {name(contact.id)}
                          <small>
                            {contact.email || translate('Add an email to enable student access')}
                          </small>
                        </label>
                      ))}
                  </div>
                  <button
                    className='primary-btn'
                    disabled={busy || !selectedContacts.length}
                    onClick={() =>
                      void command('register', {
                        run_id: selectedRun.id,
                        contact_ids: selectedContacts,
                      }, 'Students registered. Share the session instructions with them.').then(
                        (ok) => {
                          if (ok) setSelectedContacts([]);
                        },
                      )}
                  >
                    {translate('Register selected students')} ({selectedContacts.length})
                  </button>
                </details>
              )}
              {selectedRun.kind === 'placement' && !selectedRun.classroom_id &&
                data.leads.length > 0 && selectedRun.status !== 'closed' && (
                <div className='assessment-form'>
                  <h4>{translate('Invite an applicant from Admissions')}</h4>
                  <p>
                    {translate(
                      'This creates or links the learner record without marking the lead as enrolled. Use the learner’s own email for secure access.',
                    )}
                  </p>
                  <label>
                    {translate('Applicant')}
                    <select
                      className='input'
                      value={leadId}
                      onChange={(e) => setLeadId(e.target.value)}
                    >
                      <option value=''>{translate('Choose an applicant')}</option>
                      {data.leads.map((lead) => (
                        <option key={lead.id} value={lead.id}>
                          {lead.full_name} · {lead.email || translate('Email required')}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className='primary-btn'
                    disabled={busy || !leadId}
                    onClick={() =>
                      void command(
                        'register_lead',
                        { run_id: selectedRun.id, lead_id: leadId },
                        'Applicant registered for placement. Their lead stays open until enrollment.',
                      )}
                  >
                    {translate('Register applicant for placement')}
                  </button>
                </div>
              )}
              <div className='assessment-roster'>
                {roster.map((candidate) => (
                  <button
                    className={candidate.id === selectedCandidate?.id ? 'is-active' : ''}
                    key={candidate.id}
                    onClick={() => {
                      setCandidateId(candidate.id);
                      setGroupId('');
                    }}
                  >
                    <span>
                      <strong>{name(candidate.contact_id)}</strong>
                      <small>{candidate.candidate_code}</small>
                    </span>
                    <span>
                      {statusLabel(candidate.status)}
                      {candidate.report?.support_needed && (
                        <small>{translate('Follow-up support recommended')}</small>
                      )}
                    </span>
                  </button>
                ))}
                {!roster.length && <p>{translate('No students registered yet.')}</p>}
              </div>
            </section>
          )}
          {selectedCandidate && selectedRun && paper && (
            <section className='assessment-form'>
              <header className='assessment-actions'>
                <h3>{name(selectedCandidate.contact_id)}</h3>
                {(data.permissions.intake ||
                  data.memberships.some((m) => m.contact_id === selectedCandidate.contact_id)) && (
                  <button
                    className='secondary-btn'
                    onClick={() => onOpenContact(selectedCandidate.contact_id)}
                  >
                    {translate('Open student record')}
                  </button>
                )}
              </header>
              {data.permissions.review && selectedCandidate.status === 'in_progress' && (
                <div className='assessment-actions'>
                  <p>
                    {translate(
                      'If the learner left without submitting, collect the answers saved before their deadline. This is available only after time ends or the session closes.',
                    )}
                  </p>
                  <button
                    className='secondary-btn'
                    disabled={busy ||
                      (selectedRun.status === 'open' &&
                        Date.parse(selectedCandidate.expires_at || '') > Date.now())}
                    onClick={() =>
                      void command(
                        'collect',
                        { candidate_id: selectedCandidate.id },
                        'Saved answers collected. You can now review the work.',
                      )}
                  >
                    {translate('Collect saved answers')}
                  </button>
                </div>
              )}
              {data.permissions.review &&
                ['submitted', 'reviewed'].includes(selectedCandidate.status) && (
                <ReportReview
                  key={`${selectedCandidate.id}:${selectedCandidate.status}`}
                  candidate={selectedCandidate}
                  paper={paper}
                  busy={busy}
                  onSave={(body) =>
                    command(
                      'review',
                      body,
                      'Report approved. Check it before sharing with the student.',
                    )}
                />
              )}
              {selectedCandidate.status === 'reviewed' && data.permissions.review && (
                <div className='assessment-actions'>
                  <p>
                    {translate(
                      'Sharing makes this report visible to the student and preserves it in their assessment history.',
                    )}
                  </p>
                  <button
                    className='primary-btn'
                    disabled={busy}
                    onClick={() =>
                      void command(
                        'release',
                        { candidate_id: selectedCandidate.id },
                        'Report shared with the student.',
                      )}
                  >
                    <ClipboardCheck size={16} />
                    {translate('Share report with student')}
                  </button>
                </div>
              )}
              {selectedCandidate.status === 'released' && selectedCandidate.report &&
                selectedCandidate.summary && (
                <>
                  <AssessmentReportView
                    academy={data.academy.name}
                    name={name(selectedCandidate.contact_id)}
                    code={selectedCandidate.candidate_code}
                    title={selectedRun.title}
                    report={selectedCandidate.report}
                    summary={selectedCandidate.summary}
                    date={formatDate(selectedCandidate.released_at)}
                  />
                  {lane === 'placement' && data.permissions.enroll && (
                    <div className='assessment-form'>
                      <h3>{translate('Choose the next group')}</h3>
                      <p>
                        {translate(
                          'Confirm the schedule, available places, and learner preference before enrolling. This does not create a tuition charge.',
                        )}
                      </p>
                      <label>
                        {translate('Group')}
                        <select
                          className='input'
                          value={groupId}
                          onChange={(e) => setGroupId(e.target.value)}
                        >
                          <option value=''>{translate('Choose a group')}</option>
                          {data.classrooms.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </label>
                      {data.memberships.some((m) =>
                          m.contact_id === selectedCandidate.contact_id &&
                          m.classroom_id === groupId && m.status === 'active'
                        )
                        ? <p role='status'>{translate('Already enrolled in this group')}</p>
                        : (
                          <button
                            className='primary-btn'
                            disabled={busy || !groupId}
                            onClick={() =>
                              void perform(
                                () =>
                                  selectedCandidate.lead_id
                                    ? teacherStudioConvertLead(academyId, {
                                      lead_id: selectedCandidate.lead_id,
                                      existing_contact_id: selectedCandidate.contact_id,
                                      classroom_id: groupId,
                                      idempotency_key:
                                        `placement-enroll-${selectedCandidate.id}-${groupId}`,
                                    })
                                    : teacherStudioUpsertClassroomMembership(academyId, {
                                      contact_id: selectedCandidate.contact_id,
                                      classroom_id: groupId,
                                      role: 'student',
                                      membership_status: 'active',
                                    }),
                                'Student enrolled. Their assessment history remains available here.',
                              )}
                          >
                            {translate('Enroll in this group')}
                          </button>
                        )}
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
