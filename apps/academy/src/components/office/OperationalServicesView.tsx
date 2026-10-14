import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarRange,
  CircleDollarSign,
  ClipboardList,
  KeyRound,
  Link2,
  MessageSquareText,
  RefreshCw,
  ShieldAlert,
  UsersRound,
} from 'lucide-react';
import { translate } from '../../i18n';
import {
  teacherStudioAccessInvitations,
  teacherStudioCollectionCases,
  teacherStudioCommunicationJourneys,
  teacherStudioCompetencyPlans,
  teacherStudioIntegrationEndpoints,
  teacherStudioOperationalCommand,
  teacherStudioSensitiveCases,
  teacherStudioServiceRequests,
  teacherStudioTimetablePlanning,
  teacherStudioWorkforceRequests,
  type AcademyOperationalData,
  type AcademyOperationalRecord,
  type TeacherStudioAccessProfile,
  type TeacherStudioClassroom,
  type TeacherStudioContact,
} from '../../lib/client';
import { hasAccessPermission } from '../../lib/academyAccess';

type Lane = 'access' | 'support' | 'teaching' | 'workforce' | 'communications';
type Props = {
  academyId: string;
  actorId: string;
  access: TeacherStudioAccessProfile | null;
  contacts: TeacherStudioContact[];
  classrooms: TeacherStudioClassroom[];
  formatDate: (value: string | null | undefined) => string;
};

const value = (record: Record<string, unknown>, key: string): string => String(record[key] ?? '');
const label = (input: unknown): string => translate(String(input ?? '').replaceAll('_', ' '));
const today = (): string => new Date().toISOString().slice(0, 10);
const inMonths = (months: number): string => {
  const result = new Date();
  result.setMonth(result.getMonth() + months);
  return result.toISOString().slice(0, 10);
};
const errorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  const payload = message.match(/failed \(\d{3}\): ([\s\S]+)$/)?.[1];
  if (!payload) return message;
  try {
    const data = JSON.parse(payload) as { error?: unknown };
    if (typeof data?.error === 'string') return data.error;
  } catch { /* Keep transport details out of the task interface. */ }
  return translate('The service could not complete this request. Please try again.');
};
const statusTone = (status: unknown): string => {
  const normalized = String(status ?? '').toLowerCase();
  if (
    ['active', 'approved', 'completed', 'delivered', 'accepted', 'ready', 'sent', 'resolved', 'fulfilled'].includes(
      normalized,
    )
  )
    return 'status status--ok';
  if (['failed', 'rejected', 'revoked', 'cancelled', 'expired'].includes(normalized)) return 'status status--bad';
  return 'status status--pending';
};

const csvCell = (input: unknown): string => {
  const serialized = typeof input === 'object' && input !== null ? JSON.stringify(input) : String(input ?? '');
  return `"${serialized.replaceAll('"', '""')}"`;
};

const downloadRows = (name: string, format: string, rows: Record<string, unknown>[]) => {
  const content =
    format === 'json'
      ? JSON.stringify(rows, null, 2)
      : (() => {
          const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
          return [
            columns.map(csvCell).join(','),
            ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')),
          ].join('\n');
        })();
  const blob = new Blob([content], {
    type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${name}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
};

const RecordQueue = ({
  title,
  rows,
  empty,
  render,
}: {
  title: string;
  rows: AcademyOperationalRecord[];
  empty: string;
  render: (row: AcademyOperationalRecord) => React.ReactNode;
}) => (
  <section className="panel operations-queue">
    <div className="section-heading">
      <div>
        <h3>{translate(title)}</h3>
        <p>
          {rows.length} {translate('records')}
        </p>
      </div>
    </div>
    <div className="record-list">
      {rows.map((row) => (
        <article key={row.id}>{render(row)}</article>
      ))}
      {rows.length === 0 ? (
        <div className="empty-state">
          <p>{translate(empty)}</p>
        </div>
      ) : null}
    </div>
  </section>
);

export function OperationalServicesView({ academyId, actorId, access, contacts, classrooms, formatDate }: Props) {
  const [lane, setLane] = useState<Lane>('support');
  const [data, setData] = useState<AcademyOperationalData>({});
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tool, setTool] = useState('');
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [generation, setGeneration] = useState<Record<string, unknown> | null>(null);
  const actionBusy = useRef(false);
  const generationKeys = useRef(new Map<string, string>());
  const [lastSecret, setLastSecret] = useState('');

  const can = useCallback(
    (permission: keyof TeacherStudioAccessProfile['permissions']) => hasAccessPermission(access, permission),
    [access],
  );
  const canAccess = can('manageRoster') || can('manageStaff') || can('manageGuardians');
  const canTimetable = can('manageAcademicOperations');
  const canSupport = can('manageRetention') || can('manageAcademicOperations') || can('refundFinance');
  const canJourneys = can('manageAutomation');
  const canCollections = can('viewFinance') || can('collectFinance');
  const canSensitive =
    can('manageRetention') && ['owner', 'admin', 'center_admin', 'manager', 'counselor'].includes(access?.role ?? '');
  const canCompetencies = can('manageAssignments') || can('viewAcademicReports');
  const canIntegrations = can('manageAcademy') || can('manageAutomation');
  const canAdvancedConnections = canIntegrations && ['owner', 'admin', 'center_admin'].includes(access?.role ?? '');
  const canReviewWorkforce = can('manageStaff') || can('manageAcademicOperations') || can('viewPayroll');

  const load = useCallback(async () => {
    const loaders: Array<[keyof AcademyOperationalData, boolean, () => Promise<unknown>]> = [
      ['accessInvitations', canAccess, () => teacherStudioAccessInvitations(academyId)],
      ['timetable', canTimetable, () => teacherStudioTimetablePlanning(academyId)],
      ['serviceRequests', canSupport, () => teacherStudioServiceRequests(academyId)],
      ['journeys', canJourneys, () => teacherStudioCommunicationJourneys(academyId)],
      ['collections', canCollections, () => teacherStudioCollectionCases(academyId)],
      ['workforce', true, () => teacherStudioWorkforceRequests(academyId)],
      ['sensitiveCases', canSensitive, () => teacherStudioSensitiveCases(academyId)],
      ['competencyPlans', canCompetencies, () => teacherStudioCompetencyPlans(academyId)],
      ['integrations', canIntegrations, () => teacherStudioIntegrationEndpoints(academyId)],
    ];
    const next: AcademyOperationalData = {};
    const nextErrors: Record<string, string> = {};
    await Promise.all(
      loaders
        .filter(([, allowed]) => allowed)
        .map(async ([key, , loader]) => {
          try {
            Object.assign(next, { [key]: await loader() });
          } catch (loadError) {
            nextErrors[String(key)] = errorMessage(loadError);
          }
        }),
    );
    setData(next);
    setLoadErrors(nextErrors);
  }, [
    academyId,
    canAccess,
    canCollections,
    canCompetencies,
    canIntegrations,
    canJourneys,
    canSensitive,
    canSupport,
    canTimetable,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async <T,>(
    work: () => Promise<T>,
    success: string,
    onResult?: (result: T) => void,
    keepToolOpen = false,
  ) => {
    if (actionBusy.current) return;
    actionBusy.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await work();
      onResult?.(result);
      setNotice(success);
      if (!keepToolOpen) setTool('');
      await load();
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      actionBusy.current = false;
      setBusy(false);
    }
  };

  const downloadExport = async (item: AcademyOperationalRecord) => {
    setBusy(true);
    setError('');
    try {
      const result = await teacherStudioOperationalCommand<{
        export: {
          export_type: string;
          format: string;
          result_data: Record<string, unknown>[];
        };
      }>(academyId, 'download_export', { export_id: item.id });
      downloadRows(
        `academy-${result.export.export_type}-${new Date().toISOString().slice(0, 10)}`,
        result.export.format,
        result.export.result_data ?? [],
      );
      setNotice('Your file is downloading.');
    } catch (downloadError) {
      setError(errorMessage(downloadError));
    } finally {
      setBusy(false);
    }
  };

  const invitationContacts = (data.accessInvitations?.contacts as TeacherStudioContact[] | undefined) ?? contacts;
  const invitationClassrooms =
    (data.accessInvitations?.classrooms as TeacherStudioClassroom[] | undefined) ?? classrooms;
  const timetableClassrooms = data.timetable?.classrooms ?? classrooms;
  const timetableStaff = data.timetable?.staff ?? [];
  const guardianRelationships = data.accessInvitations?.guardian_relationships ?? [];
  const guardians = useMemo(() => data.accessInvitations?.guardians ?? [], [data.accessInvitations?.guardians]);
  const guardianById = useMemo(() => new Map(guardians.map((item) => [item.id, item])), [guardians]);
  const contactById = useMemo(() => new Map(invitationContacts.map((item) => [item.id, item])), [invitationContacts]);
  const classroomById = useMemo(
    () => new Map(invitationClassrooms.map((item) => [item.id, item])),
    [invitationClassrooms],
  );

  const [invite, setInvite] = useState({
    invite_kind: 'student',
    email: '',
    contact_id: '',
    classroom_id: '',
    role: 'teacher',
    guardian_relationship_id: '',
  });
  const [requestDecision, setRequestDecision] = useState({
    request_id: '',
    status: 'in_review',
    note: '',
  });
  const [sensitiveCase, setSensitiveCase] = useState({
    case_type: 'complaint',
    title: '',
    description: '',
    severity: 'medium',
    confidentiality: 'restricted',
  });
  const [term, setTerm] = useState({
    name: 'Next term',
    starts_on: today(),
    ends_on: inMonths(4),
    branch_id: '',
    status: 'draft',
  });
  const [series, setSeries] = useState({
    term_id: '',
    classroom_id: '',
    source_schedule_id: '',
    branch_id: '',
    room_id: '',
    primary_staff_id: '',
    title: 'English lesson',
    delivery_mode: 'physical',
    status: 'draft',
  });
  const generateTimetable = async (dryRun: boolean) => {
    const termId = series.term_id;
    const scope = `${academyId}:${termId}:${dryRun}`;
    let key = generationKeys.current.get(scope);
    if (!key) { key = crypto.randomUUID(); generationKeys.current.set(scope, key); }
    try {
      const result = await teacherStudioOperationalCommand<Record<string, unknown>>(academyId, 'generate_timetable', {
        term_id: termId, dry_run: dryRun, idempotency_key: key,
      });
      generationKeys.current.delete(scope);
      return result;
    } catch (error) {
      const status = error instanceof Error ? Number(error.message.match(/\((\d{3})\)/)?.[1]) : NaN;
      if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
        generationKeys.current.delete(scope);
        setGeneration(null);
      }
      throw error;
    }
  };
  const [framework, setFramework] = useState({
    code: '',
    name: '',
    description: '',
    status: 'draft',
  });
  const [competency, setCompetency] = useState({
    framework_id: '',
    code: '',
    title: '',
    description: '',
  });
  const [plan, setPlan] = useState({
    contact_id: '',
    framework_id: '',
    title: '',
    goal: '',
    target_date: inMonths(3),
    published: false,
    competency_id: '',
    target_level: '3',
  });
  const [evidence, setEvidence] = useState({
    plan_item_id: '',
    evidence_type: 'observation',
    observed_level: '1',
    note: '',
  });
  const [staffRequest, setStaffRequest] = useState({
    request_type: 'leave',
    branch_id: '',
    starts_at: '',
    ends_at: '',
    reason: '',
  });
  const [collection, setCollection] = useState({
    contact_id: '',
    outstanding_amount: '',
    currency: 'UZS',
    stage: 'reminder',
    priority: 'normal',
    next_action_at: '',
  });
  const [attempt, setAttempt] = useState({
    case_id: '',
    attempt_type: 'inapp',
    outcome: 'queued',
    message: '',
    note: '',
    next_action_at: '',
  });
  const [journey, setJourney] = useState({
    name: '',
    audience: 'student',
    trigger_key: 'manual',
    status: 'active',
    channel: 'inapp',
    title: '',
    message: '',
    delay_minutes: '0',
    follow_up: '',
    follow_up_delay: '1440',
  });
  const [enrollment, setEnrollment] = useState({
    journey_id: '',
    recipient_id: '',
    audience: 'student',
  });
  const [endpoint, setEndpoint] = useState({
    name: '',
    endpoint_url: '',
    event_types: 'student.enrolled',
    status: 'active',
  });
  const [event, setEvent] = useState({
    endpoint_id: '',
    event_type: 'student.enrolled',
  });
  const [exportForm, setExportForm] = useState({
    export_type: 'students',
    format: 'csv',
  });

  const laneOptions: Array<{
    id: Lane;
    label: string;
    detail: string;
    icon: React.ReactNode;
    visible: boolean;
    count: number;
  }> = [
    {
      id: 'access',
      label: 'Access',
      detail: 'Invitations and learner preview',
      icon: <KeyRound size={18} />,
      visible: canAccess,
      count: data.accessInvitations?.invitations.filter((item) => item.status === 'pending').length ?? 0,
    },
    {
      id: 'support',
      label: 'Student support',
      detail: 'Requests and protected cases',
      icon: <ClipboardList size={18} />,
      visible: canSupport || canSensitive,
      count:
        data.serviceRequests?.requests.filter((item) => !['completed', 'rejected', 'cancelled'].includes(item.status))
          .length ?? 0,
    },
    {
      id: 'teaching',
      label: 'Teaching plan',
      detail: 'Terms, timetable, and learning plans',
      icon: <CalendarRange size={18} />,
      visible: canTimetable || canCompetencies,
      count:
        (data.timetable?.runs.filter((item) => value(item, 'status') === 'failed').length ?? 0) +
        (data.competencyPlans?.plans.filter((item) => value(item, 'status') === 'active').length ?? 0),
    },
    {
      id: 'workforce',
      label: 'Staff & collections',
      detail: 'Requests, approvals, and payment follow-up',
      icon: <UsersRound size={18} />,
      visible: true,
      count:
        (data.workforce?.requests.filter((item) => ['submitted', 'in_review'].includes(value(item, 'status'))).length ??
          0) + (data.collections?.cases.filter((item) => value(item, 'status') === 'open').length ?? 0),
    },
    {
      id: 'communications',
      label: 'Messages & records',
      detail: 'Follow-ups, reports, and connected services',
      icon: <Link2 size={18} />,
      visible: canJourneys || canIntegrations,
      count:
        (data.journeys?.enrollments.filter((item) => value(item, 'status') === 'active').length ?? 0) +
        (data.integrations?.deliveries.filter((item) =>
          ['queued', 'retrying', 'failed'].includes(value(item, 'status')),
        ).length ?? 0),
    },
  ];
  const lanes = laneOptions.filter((item) => item.visible);

  useEffect(() => {
    if (!lanes.some((item) => item.id === lane) && lanes[0]) setLane(lanes[0].id);
  }, [lane, lanes]);

  const ToolBar = ({ actions }: { actions: Array<{ id: string; label: string }> }) => (
    <div className="operations-actions" aria-label={translate('Available actions')}>
      {actions.map((action) => (
        <button
          key={action.id}
          className={tool === action.id ? 'ghost-btn is-active' : 'ghost-btn'}
          type="button"
          aria-expanded={tool === action.id}
          onClick={() => setTool((current) => (current === action.id ? '' : action.id))}
        >
          {translate(action.label)}
        </button>
      ))}
    </div>
  );

  return (
    <section className="operations-desk">
      <header className="section-heading operations-desk__heading">
        <div>
          <span className="eyebrow">{translate('Service desk')}</span>
          <h2>{translate('Run the work that crosses teams')}</h2>
          <p>
            {translate(
              'Tasks, decisions, and follow-through stay together. Each role sees only the work they are allowed to handle.',
            )}
          </p>
        </div>
        <button className="ghost-btn" type="button" onClick={() => void load()} disabled={busy}>
          <RefreshCw size={16} /> {translate('Refresh')}
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
      {Object.keys(loadErrors).length ? (
        <div className="info-banner" role="status">
          {translate('Some authorized lanes could not load. Retry before making decisions.')}
        </div>
      ) : null}
      <div className="operations-desk__layout">
        <nav className="operations-lanes" aria-label={translate('Service desk lanes')}>
          {lanes.map((item) => (
            <button
              key={item.id}
              type="button"
              className={lane === item.id ? 'is-active' : ''}
              aria-current={lane === item.id ? 'page' : undefined}
              onClick={() => {
                setLane(item.id);
                setTool('');
              }}
            >
              <span className="operations-lanes__icon">{item.icon}</span>
              <span>
                <strong>{translate(item.label)}</strong>
                <small>{translate(item.detail)}</small>
              </span>
              {item.count ? <b>{item.count}</b> : null}
            </button>
          ))}
        </nav>
        <div className="operations-desk__stage">
          {lane === 'access' ? AccessLane() : null}
          {lane === 'support' ? SupportLane() : null}
          {lane === 'teaching' ? TeachingLane() : null}
          {lane === 'workforce' ? WorkforceLane() : null}
          {lane === 'communications' ? CommunicationsLane() : null}
        </div>
      </div>
    </section>
  );

  function AccessLane() {
    const invitations = data.accessInvitations?.invitations ?? [];
    const selectedGuardianRelationship = guardianRelationships.find(
      (item) => item.id === invite.guardian_relationship_id,
    );
    const selectedGuardian = selectedGuardianRelationship
      ? guardianById.get(value(selectedGuardianRelationship, 'guardian_id'))
      : null;
    const submitInvite = (submitEvent: FormEvent) => {
      submitEvent.preventDefault();
      const body: Record<string, unknown> = { ...invite };
      if (invite.invite_kind === 'student')
        Object.assign(body, {
          role: undefined,
          guardian_relationship_id: undefined,
        });
      if (invite.invite_kind === 'staff')
        Object.assign(body, {
          contact_id: undefined,
          guardian_relationship_id: undefined,
          classroom_id: undefined,
          classroom_ids:
            ['teacher', 'assistant'].includes(invite.role) && invite.classroom_id ? [invite.classroom_id] : [],
        });
      if (invite.invite_kind === 'guardian')
        Object.assign(body, {
          role: undefined,
          contact_id: undefined,
          classroom_id: undefined,
        });
      void run(
        () => teacherStudioOperationalCommand(academyId, 'create_access_invitation', body,actorId),
        'Invitation saved and tracked.',
      );
    };
    return (
      <div className="operations-grid">
        <ToolBar
          actions={[
            { id: 'invite', label: 'Send invitation' },
            { id: 'preview', label: 'Preview student view' },
          ]}
        />
        {tool === 'invite' ? (
          <form className="panel compact-form operations-form" onSubmit={submitInvite}>
            <span className="eyebrow">{translate('Controlled access')}</span>
            <h3>{translate('Send an invitation')}</h3>
            <label>
              {translate('Invite for')}
              <select
                className="input"
                value={invite.invite_kind}
                onChange={(event) =>
                  setInvite({
                    ...invite,
                    invite_kind: event.target.value,
                    email: '',
                  })
                }
              >
                {can('manageRoster') ? <option value="student">{translate('Student')}</option> : null}
                {can('manageStaff') ? <option value="staff">{translate('Staff member')}</option> : null}
                {can('manageGuardians') ? <option value="guardian">{translate('Guardian')}</option> : null}
              </select>
            </label>
            {invite.invite_kind === 'student' ? (
              <>
                <label>
                  {translate('Student')}
                  <select
                    className="input"
                    value={invite.contact_id}
                    onChange={(event) => {
                      const selected = contactById.get(event.target.value);
                      setInvite({
                        ...invite,
                        contact_id: event.target.value,
                        email: selected?.email ?? invite.email,
                      });
                    }}
                    required
                  >
                    <option value="">{translate('Choose student')}</option>
                    {invitationContacts.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.first_name} {item.last_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {translate('Classroom')}
                  <select
                    className="input"
                    value={invite.classroom_id}
                    onChange={(event) => setInvite({ ...invite, classroom_id: event.target.value })}
                    required
                  >
                    <option value="">{translate('Choose classroom')}</option>
                    {invitationClassrooms.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            {invite.invite_kind === 'staff' ? (
              <>
                <label>
                  {translate('Role')}
                  <select
                    className="input"
                    value={invite.role}
                    onChange={(event) => setInvite({ ...invite, role: event.target.value })}
                  >
                    {[
                      'admin',
                      'manager',
                      'counselor',
                      'salesperson',
                      'cashier',
                      'accountant',
                      'payroll_officer',
                      'parent_liaison',
                      'teacher',
                      'assistant',
                    ].map((role) => (
                      <option key={role} value={role}>
                        {label(role)}
                      </option>
                    ))}
                  </select>
                </label>
                {['teacher', 'assistant'].includes(invite.role) ? (
                  <label>
                    {translate('Assigned classroom')}
                    <select
                      className="input"
                      value={invite.classroom_id}
                      onChange={(event) =>
                        setInvite({
                          ...invite,
                          classroom_id: event.target.value,
                        })
                      }
                      required
                    >
                      <option value="">{translate('Choose classroom')}</option>
                      {invitationClassrooms.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </>
            ) : null}
            {invite.invite_kind === 'guardian' ? (
              <label>
                {translate('Guardian relationship')}
                <select
                  className="input"
                  value={invite.guardian_relationship_id}
                  onChange={(event) => {
                    const relation = guardianRelationships.find((item) => item.id === event.target.value);
                    const guardian = relation ? guardianById.get(value(relation, 'guardian_id')) : null;
                    setInvite({
                      ...invite,
                      guardian_relationship_id: event.target.value,
                      email: value(guardian ?? {}, 'email'),
                    });
                  }}
                  required
                >
                  <option value="">{translate('Choose authorized relationship')}</option>
                  {guardianRelationships.map((item) => {
                    const guardian = guardianById.get(value(item, 'guardian_id'));
                    const contact = contactById.get(value(item, 'contact_id'));
                    return (
                      <option key={item.id} value={item.id}>
                        {value(guardian ?? {}, 'full_name')} → {contact?.first_name} {contact?.last_name}
                      </option>
                    );
                  })}
                </select>
              </label>
            ) : null}
            <label>
              {translate('Email')}
              <input
                className="input"
                type="email"
                value={invite.email || value(selectedGuardian ?? {}, 'email')}
                onChange={(event) => setInvite({ ...invite, email: event.target.value })}
                required
              />
            </label>
            <button className="primary-btn" disabled={busy}>
              {translate('Send invitation')}
            </button>
          </form>
        ) : null}
        {tool === 'preview' ? (
          <form
            className="panel compact-form operations-form"
            onSubmit={(event) => {
              event.preventDefault();
              const contactId = (event.currentTarget.elements.namedItem('preview_contact') as HTMLSelectElement).value;
              void run(
                () =>
                  teacherStudioOperationalCommand<Record<string, unknown>>(academyId, 'student_preview', {
                    contact_id: contactId,
                  }),
                'Read-only learner preview opened.',
                setPreview,
                true,
              );
            }}
          >
            <span className="eyebrow">{translate('Owner-safe preview')}</span>
            <h3>{translate('Check the student experience')}</h3>
            <p>{translate('This is read-only. It never changes identity, permissions, attendance, or submissions.')}</p>
            <label>
              {translate('Student')}
              <select className="input" name="preview_contact" required>
                <option value="">{translate('Choose student')}</option>
                {invitationContacts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.first_name} {item.last_name}
                  </option>
                ))}
              </select>
            </label>
            <button className="ghost-btn" disabled={busy}>
              {translate('Preview as student')}
            </button>
            {preview ? (
              <div className="preview-evidence" role="region" aria-label={translate('Read-only student preview')}>
                <strong>
                  {value((preview.contact as Record<string, unknown>) ?? {}, 'first_name')}{' '}
                  {value((preview.contact as Record<string, unknown>) ?? {}, 'last_name')}
                </strong>
                <span>
                  {(preview.memberships as unknown[] | undefined)?.length ?? 0} {translate('classrooms')}
                </span>
                <span>
                  {(preview.assignments as unknown[] | undefined)?.length ?? 0} {translate('assignments')}
                </span>
                <span>
                  {(preview.sessions as unknown[] | undefined)?.length ?? 0} {translate('sessions')}
                </span>
                <span>
                  {(preview.service_requests as unknown[] | undefined)?.length ?? 0} {translate('requests')}
                </span>
              </div>
            ) : null}
          </form>
        ) : null}
        <RecordQueue
          title={translate('Invitation ledger')}
          rows={invitations}
          empty="No invitations have been sent."
          render={(item) => (
            <>
              <div>
                <strong>{value(item, 'email')}</strong>
                <p>
                  {label(value(item, 'invite_kind'))} ·{' '}
                  {classroomById.get(value(item, 'classroom_id'))?.name ?? label(value(item, 'role'))}
                </p>
              </div>
              <div className="record-actions">
                <span className={statusTone(value(item, 'status'))}>
                  {label(value(item, 'status'))} · {label(value(item, 'delivery_status'))}
                </span>
                {value(item, 'status') === 'pending' ? (
                  <>
                    <button
                      className="link-btn"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            teacherStudioOperationalCommand(academyId, 'resend_access_invitation', {
                              invitation_id: item.id,
                            },actorId),
                          'Invitation saved and tracked.',
                        )
                      }
                    >
                      {translate('Resend')}
                    </button>
                    <button
                      className="link-btn link-btn--danger"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            teacherStudioOperationalCommand(academyId, 'revoke_access_invitation', {
                              invitation_id: item.id,
                            },actorId),
                          'Invitation revoked.',
                        )
                      }
                    >
                      {translate('Revoke')}
                    </button>
                  </>
                ) : null}
              </div>
            </>
          )}
        />
      </div>
    );
  }

  function SupportLane() {
    const requests = data.serviceRequests?.requests ?? [];
    const cases = data.sensitiveCases?.cases ?? [];
    return (
      <div className="operations-grid">
        <ToolBar
          actions={[
            ...(canSupport ? [{ id: 'request-decision', label: 'Update request' }] : []),
            ...(canSensitive ? [{ id: 'sensitive-case', label: 'Open protected case' }] : []),
          ]}
        />
        {canSupport && tool === 'request-decision' ? (
          <form
            className="panel compact-form operations-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                () => teacherStudioOperationalCommand(academyId, 'update_service_request', requestDecision),
                'Request queue updated.',
              );
            }}
          >
            <span className="eyebrow">{translate('Request desk')}</span>
            <h3>{translate('Decide the next step')}</h3>
            <label>
              {translate('Request')}
              <select
                className="input"
                value={requestDecision.request_id}
                onChange={(event) =>
                  setRequestDecision({
                    ...requestDecision,
                    request_id: event.target.value,
                  })
                }
                required
              >
                <option value="">{translate('Choose request')}</option>
                {requests
                  .filter((item) => !['completed', 'rejected', 'cancelled'].includes(item.status))
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.subject} · {label(item.status)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {translate('Next status')}
              <select
                className="input"
                value={requestDecision.status}
                onChange={(event) =>
                  setRequestDecision({
                    ...requestDecision,
                    status: event.target.value,
                  })
                }
              >
                {[
                  'triaged',
                  'in_review',
                  'waiting_for_requester',
                  'approved',
                  'rejected',
                  'completed',
                  'cancelled',
                ].map((status) => (
                  <option key={status} value={status}>
                    {label(status)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {translate('Visible note')}
              <textarea
                className="input"
                value={requestDecision.note}
                onChange={(event) =>
                  setRequestDecision({
                    ...requestDecision,
                    note: event.target.value,
                  })
                }
              />
            </label>
            <button className="primary-btn" disabled={busy}>
              {translate('Update request')}
            </button>
          </form>
        ) : null}
        {canSensitive && tool === 'sensitive-case' ? (
          <form
            className="panel compact-form operations-form operations-form--restricted"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                () => teacherStudioOperationalCommand(academyId, 'create_sensitive_case', sensitiveCase),
                'Restricted case opened.',
              );
            }}
          >
            <span className="eyebrow">
              <ShieldAlert size={14} /> {translate('Restricted')}
            </span>
            <h3>{translate('Open a protected case')}</h3>
            <div className="form-grid two-col">
              <label>
                {translate('Type')}
                <select
                  className="input"
                  value={sensitiveCase.case_type}
                  onChange={(event) =>
                    setSensitiveCase({
                      ...sensitiveCase,
                      case_type: event.target.value,
                    })
                  }
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
                {translate('Severity')}
                <select
                  className="input"
                  value={sensitiveCase.severity}
                  onChange={(event) =>
                    setSensitiveCase({
                      ...sensitiveCase,
                      severity: event.target.value,
                    })
                  }
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
              {translate('Title')}
              <input
                className="input"
                value={sensitiveCase.title}
                onChange={(event) =>
                  setSensitiveCase({
                    ...sensitiveCase,
                    title: event.target.value,
                  })
                }
                required
              />
            </label>
            <label>
              {translate('Restricted description')}
              <textarea
                className="input"
                value={sensitiveCase.description}
                onChange={(event) =>
                  setSensitiveCase({
                    ...sensitiveCase,
                    description: event.target.value,
                  })
                }
                required
              />
            </label>
            <label>
              {translate('Visibility')}
              <select
                className="input"
                value={sensitiveCase.confidentiality}
                onChange={(event) =>
                  setSensitiveCase({
                    ...sensitiveCase,
                    confidentiality: event.target.value,
                  })
                }
              >
                <option value="restricted">{translate('Restricted case team')}</option>
                {['owner', 'admin'].includes(access?.role ?? '') ? (
                  <option value="owner_only">{translate('Owners only')}</option>
                ) : null}
              </select>
            </label>
            <button className="primary-btn" disabled={busy}>
              {translate('Open protected case')}
            </button>
          </form>
        ) : null}
        <RecordQueue
          title={translate('Student and guardian requests')}
          rows={requests}
          empty="No support requests are waiting."
          render={(item) => (
            <>
              <div>
                <strong>{value(item, 'subject')}</strong>
                <p>
                  {label(value(item, 'request_type'))} · {value(item, 'description') || value(item, 'details')} ·{' '}
                  {formatDate(value(item, 'created_at'))}
                </p>
              </div>
              <span className={statusTone(value(item, 'status'))}>{label(value(item, 'status'))}</span>
            </>
          )}
        />
        {canSensitive ? (
          <RecordQueue
            title={translate('Restricted case register')}
            rows={cases}
            empty="No restricted cases are open."
            render={(item) => (
              <>
                <div>
                  <strong>
                    #{value(item, 'case_number')} · {value(item, 'title')}
                  </strong>
                  <p>
                    {label(value(item, 'case_type'))} · {label(value(item, 'severity'))} ·{' '}
                    {formatDate(value(item, 'created_at'))}
                  </p>
                </div>
                <span className={statusTone(value(item, 'status'))}>{label(value(item, 'status'))}</span>
              </>
            )}
          />
        ) : null}
      </div>
    );
  }

  function TeachingLane() {
    const timetable = data.timetable;
    const competencyData = data.competencyPlans;
    const terms = timetable?.terms ?? [];
    const schedules = timetable?.schedules ?? [];
    const frameworks = competencyData?.frameworks ?? [];
    const competencies = competencyData?.competencies ?? [];
    const planItems = competencyData?.items ?? [];
    const generationRun = generation?.run as Record<string, unknown> | undefined;
    const canCommitGeneration = generationRun?.term_id === series.term_id && generationRun?.dry_run === true
      && generationRun?.status === 'preview_ready' && Number(generationRun?.conflict_count) === 0 && Number(generationRun?.candidate_count) > 0;
    const submitTerm = (event: FormEvent) => {
      event.preventDefault();
      void run(() => teacherStudioOperationalCommand(academyId, 'upsert_timetable_term', term), 'Term saved.');
    };
    const submitSeries = (event: FormEvent) => {
      event.preventDefault();
      void run(
        () =>
          teacherStudioOperationalCommand(academyId, 'upsert_timetable_series', {
            ...series,
            room_id: series.delivery_mode === 'online' ? null : series.room_id,
          }),
        'Recurring timetable series saved.',
      );
    };
    return (
      <div className="operations-grid">
        <ToolBar
          actions={[
            ...(canTimetable
              ? [
                  { id: 'term', label: 'New term' },
                  { id: 'series', label: 'Add weekly lessons' },
                  { id: 'generation', label: 'Build timetable' },
                ]
              : []),
            ...(canCompetencies
              ? [
                  { id: 'framework', label: 'New learning framework' },
                  { id: 'competency', label: 'Add learning goal' },
                  { id: 'plan', label: 'Student learning plan' },
                  { id: 'evidence', label: 'Record progress' },
                ]
              : []),
          ]}
        />
        {canTimetable && tool === 'term' ? (
          <form className="panel compact-form operations-form" onSubmit={submitTerm}>
            <span className="eyebrow">{translate('School term')}</span>
            <h3>{translate('Define the planning window')}</h3>
            <label>
              {translate('Term name')}
              <input
                className="input"
                value={term.name}
                onChange={(event) => setTerm({ ...term, name: event.target.value })}
                required
              />
            </label>
            <div className="form-grid two-col">
              <label>
                {translate('Starts')}
                <input
                  className="input"
                  type="date"
                  value={term.starts_on}
                  onChange={(event) => setTerm({ ...term, starts_on: event.target.value })}
                  required
                />
              </label>
              <label>
                {translate('Ends')}
                <input
                  className="input"
                  type="date"
                  value={term.ends_on}
                  onChange={(event) => setTerm({ ...term, ends_on: event.target.value })}
                  required
                />
              </label>
            </div>
            <label>
              {translate('Branch')}
              <select
                className="input"
                value={term.branch_id}
                onChange={(event) => setTerm({ ...term, branch_id: event.target.value })}
              >
                <option value="">{translate('All academy branches')}</option>
                {timetable?.branches.map((item) => (
                  <option key={item.id} value={item.id}>
                    {value(item, 'name')}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary-btn" disabled={busy}>
              {translate('Save term')}
            </button>
          </form>
        ) : null}
        {canTimetable && tool === 'series' ? (
          <form className="panel compact-form operations-form" onSubmit={submitSeries}>
            <span className="eyebrow">{translate('Recurring series')}</span>
            <h3>{translate('Turn a weekly slot into dated lessons')}</h3>
            <label>
              {translate('Term')}
              <select
                className="input"
                value={series.term_id}
                onChange={(event) => setSeries({ ...series, term_id: event.target.value })}
                required
              >
                <option value="">{translate('Choose term')}</option>
                {terms.map((item) => (
                  <option key={item.id} value={item.id}>
                    {value(item, 'name')}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid two-col">
              <label>
                {translate('Classroom')}
                <select
                  className="input"
                  value={series.classroom_id}
                  onChange={(event) =>
                    setSeries({
                      ...series,
                      classroom_id: event.target.value,
                      source_schedule_id: '',
                    })
                  }
                  required
                >
                  <option value="">{translate('Choose classroom')}</option>
                  {timetableClassrooms.map((item) => (
                    <option key={item.id} value={item.id}>
                      {value(item, 'name')}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {translate('Weekly slot')}
                <select
                  className="input"
                  value={series.source_schedule_id}
                  onChange={(event) =>
                    setSeries({
                      ...series,
                      source_schedule_id: event.target.value,
                    })
                  }
                  required
                >
                  <option value="">{translate('Choose slot')}</option>
                  {schedules
                    .filter((item) => !series.classroom_id || value(item, 'classroom_id') === series.classroom_id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {label(value(item, 'day_of_week'))} · {value(item, 'start_time')}–{value(item, 'end_time')}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div className="form-grid two-col">
              <label>
                {translate('Branch')}
                <select
                  className="input"
                  value={series.branch_id}
                  onChange={(event) =>
                    setSeries({
                      ...series,
                      branch_id: event.target.value,
                      room_id: '',
                    })
                  }
                  required
                >
                  <option value="">{translate('Choose branch')}</option>
                  {timetable?.branches.map((item) => (
                    <option key={item.id} value={item.id}>
                      {value(item, 'name')}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {translate('Teacher')}
                <select
                  className="input"
                  value={series.primary_staff_id}
                  onChange={(event) =>
                    setSeries({
                      ...series,
                      primary_staff_id: event.target.value,
                    })
                  }
                  required
                >
                  <option value="">{translate('Choose teacher')}</option>
                  {timetableStaff.map((item) => (
                    <option key={item.id} value={item.id}>
                      {value(item, 'display_name') || value(item, 'email')}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-grid two-col">
              <label>
                {translate('Mode')}
                <select
                  className="input"
                  value={series.delivery_mode}
                  onChange={(event) =>
                    setSeries({
                      ...series,
                      delivery_mode: event.target.value,
                    })
                  }
                >
                  {['physical', 'online', 'hybrid'].map((mode) => (
                    <option key={mode} value={mode}>
                      {label(mode)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {translate('Room')}
                <select
                  className="input"
                  value={series.room_id}
                  disabled={series.delivery_mode === 'online'}
                  onChange={(event) => setSeries({ ...series, room_id: event.target.value })}
                  required={series.delivery_mode === 'physical'}
                >
                  <option value="">{translate('Choose room')}</option>
                  {timetable?.rooms
                    .filter((item) => !series.branch_id || value(item, 'branch_id') === series.branch_id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {value(item, 'name')}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <label>
              {translate('Lesson title')}
              <input
                className="input"
                value={series.title}
                onChange={(event) => setSeries({ ...series, title: event.target.value })}
                required
              />
            </label>
            <button className="primary-btn" disabled={busy}>
              {translate('Save recurring series')}
            </button>
          </form>
        ) : null}
        {canTimetable && tool === 'generation' ? (
          <section className="panel operations-form">
            <span className="eyebrow">{translate('Check for timetable clashes')}</span>
            <h3>{translate('Preview before creating lessons')}</h3>
            <p>
              {translate(
                'Closures, duplicate dates, teachers, rooms, and classrooms are checked before any session is written.',
              )}
            </p>
            <label>
              {translate('Term')}
              <select
                className="input"
                value={series.term_id}
                onChange={(event) => setSeries({ ...series, term_id: event.target.value })}
              >
                <option value="">{translate('Choose term')}</option>
                {terms.map((item) => (
                  <option key={item.id} value={item.id}>
                    {value(item, 'name')}
                  </option>
                ))}
              </select>
            </label>
            <div className="record-actions">
              <button
                className="ghost-btn"
                type="button"
                disabled={busy || !series.term_id}
                onClick={() =>
                  void run(
                    () =>
                      generateTimetable(true),
                    'Timetable preview generated.',
                    setGeneration,
                    true,
                  )
                }
              >
                {translate('Preview conflicts')}
              </button>
              <button
                className="primary-btn"
                type="button"
                disabled={
                  busy ||
                  !series.term_id ||
                  !canCommitGeneration
                }
                onClick={() =>
                  void run(
                    () =>
                      generateTimetable(false),
                    'Timetable committed.',
                    setGeneration,
                    true,
                  )
                }
              >
                {translate('Create dated lessons')}
              </button>
            </div>
            {generation && generationRun?.term_id === series.term_id ? (
              <div className="preview-evidence">
                <span>
                  {value((generation.run as Record<string, unknown>) ?? {}, 'candidate_count')}{' '}
                  {translate('candidates')}
                </span>
                <span>
                  {value((generation.run as Record<string, unknown>) ?? {}, 'conflict_count')} {translate('conflicts')}
                </span>
                <span>
                  {value((generation.run as Record<string, unknown>) ?? {}, 'skipped_count')} {translate('skipped')}
                </span>
              </div>
            ) : null}
          </section>
        ) : null}
        {canCompetencies && tool === 'framework' ? (
          <form
            className="panel compact-form operations-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                () => teacherStudioOperationalCommand(academyId, 'upsert_competency_framework', framework),
                'Competency framework saved.',
              );
            }}
          >
            <span className="eyebrow">{translate('Learning framework')}</span>
            <h3>{translate('Set up learning skills')}</h3>
            <div className="form-grid two-col">
              <label>
                {translate('Code')}
                <input
                  className="input"
                  value={framework.code}
                  onChange={(event) => setFramework({ ...framework, code: event.target.value })}
                  required
                />
              </label>
              <label>
                {translate('Name')}
                <input
                  className="input"
                  value={framework.name}
                  onChange={(event) => setFramework({ ...framework, name: event.target.value })}
                  required
                />
              </label>
            </div>
            <label>
              {translate('Description')}
              <textarea
                className="input"
                value={framework.description}
                onChange={(event) =>
                  setFramework({
                    ...framework,
                    description: event.target.value,
                  })
                }
              />
            </label>
            <button className="primary-btn" disabled={busy}>
              {translate('Save framework')}
            </button>
          </form>
        ) : null}
        {canCompetencies && tool === 'competency' ? (
          <form
            className="panel compact-form operations-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                () => teacherStudioOperationalCommand(academyId, 'upsert_competency', competency),
                'Competency saved.',
              );
            }}
          >
            <h3>{translate('Add a competency')}</h3>
            <label>
              {translate('Framework')}
              <select
                className="input"
                value={competency.framework_id}
                onChange={(event) =>
                  setCompetency({
                    ...competency,
                    framework_id: event.target.value,
                  })
                }
                required
              >
                <option value="">{translate('Choose framework')}</option>
                {frameworks.map((item) => (
                  <option key={item.id} value={item.id}>
                    {value(item, 'name')}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid two-col">
              <label>
                {translate('Code')}
                <input
                  className="input"
                  value={competency.code}
                  onChange={(event) => setCompetency({ ...competency, code: event.target.value })}
                  required
                />
              </label>
              <label>
                {translate('Title')}
                <input
                  className="input"
                  value={competency.title}
                  onChange={(event) =>
                    setCompetency({
                      ...competency,
                      title: event.target.value,
                    })
                  }
                  required
                />
              </label>
            </div>
            <button className="primary-btn" disabled={busy}>
              {translate('Add competency')}
            </button>
          </form>
        ) : null}
        {canCompetencies && tool === 'plan' ? (
          <form
            className="panel compact-form operations-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                () =>
                  teacherStudioOperationalCommand(academyId, 'upsert_learning_plan', {
                    ...plan,
                    target_level: Number(plan.target_level),
                    items: plan.competency_id
                      ? [
                          {
                            competency_id: plan.competency_id,
                            target_level: Number(plan.target_level),
                          },
                        ]
                      : [],
                  }),
                'Student learning plan saved.',
              );
            }}
          >
            <h3>{translate('Publish a student learning plan')}</h3>
            <div className="form-grid two-col">
              <label>
                {translate('Student')}
                <select
                  className="input"
                  value={plan.contact_id}
                  onChange={(event) => setPlan({ ...plan, contact_id: event.target.value })}
                  required
                >
                  <option value="">{translate('Choose student')}</option>
                  {invitationContacts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.first_name} {item.last_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {translate('Framework')}
                <select
                  className="input"
                  value={plan.framework_id}
                  onChange={(event) =>
                    setPlan({
                      ...plan,
                      framework_id: event.target.value,
                      competency_id: '',
                    })
                  }
                  required
                >
                  <option value="">{translate('Choose framework')}</option>
                  {frameworks.map((item) => (
                    <option key={item.id} value={item.id}>
                      {value(item, 'name')}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              {translate('Plan title')}
              <input
                className="input"
                value={plan.title}
                onChange={(event) => setPlan({ ...plan, title: event.target.value })}
                required
              />
            </label>
            <label>
              {translate('Goal')}
              <textarea
                className="input"
                value={plan.goal}
                onChange={(event) => setPlan({ ...plan, goal: event.target.value })}
                required
              />
            </label>
            <div className="form-grid two-col">
              <label>
                {translate('First competency')}
                <select
                  className="input"
                  value={plan.competency_id}
                  onChange={(event) => setPlan({ ...plan, competency_id: event.target.value })}
                >
                  <option value="">{translate('No item yet')}</option>
                  {competencies
                    .filter((item) => !plan.framework_id || value(item, 'framework_id') === plan.framework_id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {value(item, 'title')}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                {translate('Target level')}
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={plan.target_level}
                  onChange={(event) => setPlan({ ...plan, target_level: event.target.value })}
                />
              </label>
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={plan.published}
                onChange={(event) => setPlan({ ...plan, published: event.target.checked })}
              />
              {translate('Publish to the student')}
            </label>
            <button className="primary-btn" disabled={busy}>
              {translate('Save learning plan')}
            </button>
          </form>
        ) : null}
        {canCompetencies && tool === 'evidence' ? (
          <form
            className="panel compact-form operations-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                () =>
                  teacherStudioOperationalCommand(academyId, 'record_competency_evidence', {
                    ...evidence,
                    observed_level: Number(evidence.observed_level),
                  }),
                'Competency evidence recorded.',
              );
            }}
          >
            <h3>{translate('Save progress')}</h3>
            <label>
              {translate('Learning plan item')}
              <select
                className="input"
                value={evidence.plan_item_id}
                onChange={(event) =>
                  setEvidence({
                    ...evidence,
                    plan_item_id: event.target.value,
                  })
                }
                required
              >
                <option value="">{translate('Choose plan item')}</option>
                {planItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {value(
                      competencies.find((competencyItem) => competencyItem.id === value(item, 'competency_id')) ?? {},
                      'title',
                    )}{' '}
                    · {label(value(item, 'status'))}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid two-col">
              <label>
                {translate('Evidence type')}
                <select
                  className="input"
                  value={evidence.evidence_type}
                  onChange={(event) =>
                    setEvidence({
                      ...evidence,
                      evidence_type: event.target.value,
                    })
                  }
                >
                  {['assignment', 'quiz', 'observation', 'attendance', 'external', 'note'].map((type) => (
                    <option key={type} value={type}>
                      {label(type)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {translate('Observed level')}
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={evidence.observed_level}
                  onChange={(event) =>
                    setEvidence({
                      ...evidence,
                      observed_level: event.target.value,
                    })
                  }
                />
              </label>
            </div>
            <label>
              {translate('Evidence note')}
              <textarea
                className="input"
                value={evidence.note}
                onChange={(event) => setEvidence({ ...evidence, note: event.target.value })}
                required
              />
            </label>
            <button className="primary-btn" disabled={busy}>
              {translate('Save progress')}
            </button>
          </form>
        ) : null}
        {canTimetable ? (
          <RecordQueue
            title={translate('Timetable generation history')}
            rows={timetable?.runs ?? []}
            empty="No timetable preview has been generated."
            render={(item) => (
              <>
                <div>
                  <strong>{label(value(item, 'status'))}</strong>
                  <p>
                    {value(item, 'candidate_count')} {translate('candidates')} · {value(item, 'conflict_count')}{' '}
                    {translate('conflicts')} · {formatDate(value(item, 'created_at'))}
                  </p>
                </div>
                <span className={statusTone(value(item, 'status'))}>
                  {value(item, 'dry_run') === 'true' ? translate('Preview') : translate('Commit')}
                </span>
              </>
            )}
          />
        ) : null}
      </div>
    );
  }

  function WorkforceLane() {
    const requests = data.workforce?.requests ?? [];
    const workforceBranches = data.workforce?.branches ?? [];
    const cases = data.collections?.cases ?? [];
    return (
      <div className="operations-grid">
        <ToolBar
          actions={[
            { id: 'staff-request', label: 'New staff request' },
            ...(canCollections
              ? [
                  { id: 'collection', label: 'New payment follow-up' },
                  {
                    id: 'collection-contact',
                    label: 'Record customer contact',
                  },
                ]
              : []),
          ]}
        />
        {tool === 'staff-request' ? (
          <form
            className="panel compact-form operations-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                () =>
                  teacherStudioOperationalCommand(academyId, 'create_workforce_request', {
                    ...staffRequest,
                    starts_at: staffRequest.starts_at || null,
                    ends_at: staffRequest.ends_at || null,
                  }),
                'Staff request submitted.',
              );
            }}
          >
            <span className="eyebrow">{translate('Staff self-service')}</span>
            <h3>{translate('Ask for a work change')}</h3>
            <label>
              {translate('Request type')}
              <select
                className="input"
                value={staffRequest.request_type}
                onChange={(event) =>
                  setStaffRequest({
                    ...staffRequest,
                    request_type: event.target.value,
                  })
                }
              >
                {[
                  'leave',
                  'availability',
                  'schedule_change',
                  'substitution',
                  'payroll_question',
                  'document',
                  'other',
                ].map((type) => (
                  <option key={type} value={type}>
                    {label(type)}
                  </option>
                ))}
              </select>
            </label>
            {workforceBranches.length > 1 ? (
              <label>
                {translate('Branch')}
                <select
                  className="input"
                  value={staffRequest.branch_id}
                  onChange={(event) => setStaffRequest({ ...staffRequest, branch_id: event.target.value })}
                  required
                >
                  <option value="">{translate('Choose branch')}</option>
                  {workforceBranches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {value(branch, 'name')}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="form-grid two-col">
              <label>
                {translate('Starts')}
                <input
                  className="input"
                  type="datetime-local"
                  value={staffRequest.starts_at}
                  onChange={(event) =>
                    setStaffRequest({
                      ...staffRequest,
                      starts_at: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                {translate('Ends')}
                <input
                  className="input"
                  type="datetime-local"
                  value={staffRequest.ends_at}
                  onChange={(event) =>
                    setStaffRequest({
                      ...staffRequest,
                      ends_at: event.target.value,
                    })
                  }
                />
              </label>
            </div>
            <label>
              {translate('Reason')}
              <textarea
                className="input"
                value={staffRequest.reason}
                onChange={(event) =>
                  setStaffRequest({
                    ...staffRequest,
                    reason: event.target.value,
                  })
                }
                required
              />
            </label>
            <button className="primary-btn" disabled={busy}>
              {translate('Submit staff request')}
            </button>
          </form>
        ) : null}
        {canCollections && tool === 'collection' ? (
          <form
            className="panel compact-form operations-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                () =>
                  teacherStudioOperationalCommand(academyId, 'upsert_collection_case', {
                    ...collection,
                    outstanding_amount: Number(collection.outstanding_amount),
                    next_action_at: collection.next_action_at || null,
                  }),
                'Collection case saved.',
              );
            }}
          >
            <span className="eyebrow">
              <CircleDollarSign size={14} /> {translate('Collections')}
            </span>
            <h3>{translate('Open a payment follow-up')}</h3>
            <label>
              {translate('Student')}
              <select
                className="input"
                value={collection.contact_id}
                onChange={(event) =>
                  setCollection({
                    ...collection,
                    contact_id: event.target.value,
                  })
                }
                required
              >
                <option value="">{translate('Choose student')}</option>
                {invitationContacts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.first_name} {item.last_name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid two-col">
              <label>
                {translate('Outstanding amount')}
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={collection.outstanding_amount}
                  onChange={(event) =>
                    setCollection({
                      ...collection,
                      outstanding_amount: event.target.value,
                    })
                  }
                  required
                />
              </label>
              <label>
                {translate('Currency')}
                <input
                  className="input"
                  value={collection.currency}
                  onChange={(event) =>
                    setCollection({
                      ...collection,
                      currency: event.target.value.toUpperCase(),
                    })
                  }
                />
              </label>
            </div>
            <label>
              {translate('Next action')}
              <input
                className="input"
                type="datetime-local"
                value={collection.next_action_at}
                onChange={(event) =>
                  setCollection({
                    ...collection,
                    next_action_at: event.target.value,
                  })
                }
              />
            </label>
            <button className="primary-btn" disabled={busy}>
              {translate('Open collection case')}
            </button>
          </form>
        ) : null}
        {canCollections && tool === 'collection-contact' ? (
          <form
            className="panel compact-form operations-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                () =>
                  teacherStudioOperationalCommand(academyId, 'record_collection_attempt', {
                    ...attempt,
                    next_action_at: attempt.next_action_at || null,
                  }),
                'Collection attempt recorded.',
              );
            }}
          >
            <h3>{translate('Record the next contact')}</h3>
            <label>
              {translate('Collection case')}
              <select
                className="input"
                value={attempt.case_id}
                onChange={(event) => setAttempt({ ...attempt, case_id: event.target.value })}
                required
              >
                <option value="">{translate('Choose open case')}</option>
                {cases
                  .filter((item) => ['open', 'waiting'].includes(value(item, 'status')))
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {contactById.get(value(item, 'contact_id'))?.first_name ?? translate('Student')} ·{' '}
                      {value(item, 'outstanding_amount')} {value(item, 'currency')}
                    </option>
                  ))}
              </select>
            </label>
            <div className="form-grid two-col">
              <label>
                {translate('Method')}
                <select
                  className="input"
                  value={attempt.attempt_type}
                  onChange={(event) =>
                    setAttempt({
                      ...attempt,
                      attempt_type: event.target.value,
                    })
                  }
                >
                  {['call', 'telegram', 'email', 'inapp', 'meeting', 'payment_link', 'promise', 'note'].map((type) => (
                    <option key={type} value={type}>
                      {label(type)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {translate('Outcome')}
                <select
                  className="input"
                  value={attempt.outcome}
                  onChange={(event) => setAttempt({ ...attempt, outcome: event.target.value })}
                >
                  {[
                    'queued',
                    'sent',
                    'contacted',
                    'no_answer',
                    'promised',
                    'paid',
                    'disputed',
                    'failed',
                    'not_applicable',
                  ].map((outcome) => (
                    <option key={outcome} value={outcome}>
                      {label(outcome)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              {translate('Message or note')}
              <textarea
                className="input"
                value={attempt.message || attempt.note}
                onChange={(event) =>
                  setAttempt({
                    ...attempt,
                    message: event.target.value,
                    note: event.target.value,
                  })
                }
              />
            </label>
            <button className="primary-btn" disabled={busy}>
              {translate('Record attempt')}
            </button>
          </form>
        ) : null}
        <RecordQueue
          title={canReviewWorkforce ? 'Staff approval queue' : 'My staff requests'}
          rows={requests}
          empty="No staff requests are waiting."
          render={(item) => (
            <>
              <div>
                <strong>{label(value(item, 'request_type'))}</strong>
                <p>
                  {value(item, 'reason')} · {formatDate(value(item, 'created_at'))}
                </p>
              </div>
              <div className="record-actions">
                <span className={statusTone(value(item, 'status'))}>{label(value(item, 'status'))}</span>
                {canReviewWorkforce && ['submitted', 'in_review'].includes(value(item, 'status')) ? (
                  <>
                    <button
                      className="link-btn"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            teacherStudioOperationalCommand(academyId, 'update_workforce_request', {
                              request_id: item.id,
                              status: 'approved',
                            }),
                          'Staff request approved and applied.',
                        )
                      }
                    >
                      {translate('Approve')}
                    </button>
                    <button
                      className="link-btn link-btn--danger"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            teacherStudioOperationalCommand(academyId, 'update_workforce_request', {
                              request_id: item.id,
                              status: 'rejected',
                            }),
                          'Staff request rejected.',
                        )
                      }
                    >
                      {translate('Reject')}
                    </button>
                  </>
                ) : null}
              </div>
            </>
          )}
        />
        {canCollections ? (
          <RecordQueue
            title={translate('Collections queue')}
            rows={cases}
            empty="No collection cases are open."
            render={(item) => (
              <>
                <div>
                  <strong>
                    {contactById.get(value(item, 'contact_id'))?.first_name ?? translate('Student')} ·{' '}
                    {value(item, 'outstanding_amount')} {value(item, 'currency')}
                  </strong>
                  <p>
                    {label(value(item, 'stage'))} · {formatDate(value(item, 'next_action_at'))}
                  </p>
                </div>
                <span className={statusTone(value(item, 'status'))}>{label(value(item, 'status'))}</span>
              </>
            )}
          />
        ) : null}
      </div>
    );
  }

  function CommunicationsLane() {
    const journeys = data.journeys?.journeys ?? [];
    const endpoints = data.integrations?.endpoints ?? [];
    const exports = data.integrations?.exports ?? [];
    const submitJourney = (submitEvent: FormEvent) => {
      submitEvent.preventDefault();
      const steps = [
        {
          channel: journey.channel,
          title_template: journey.title,
          body_template: journey.message,
          delay_minutes: Number(journey.delay_minutes),
          requires_review: false,
        },
      ];
      if (journey.follow_up.trim())
        steps.push({
          channel: journey.channel,
          title_template: journey.title,
          body_template: journey.follow_up,
          delay_minutes: Number(journey.follow_up_delay),
          requires_review: false,
        });
      void run(
        () =>
          teacherStudioOperationalCommand(academyId, 'upsert_communication_journey', {
            journey_key: `${journey.name
              .toLowerCase()
              .trim()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')}-${Date.now().toString(36)}`,
            name: journey.name,
            audience: journey.audience,
            trigger_key: journey.trigger_key,
            status: journey.status,
            steps,
          }),
        'Communication journey saved.',
      );
    };
    const recipientOptions =
      enrollment.audience === 'student'
        ? invitationContacts.map((item) => ({
            id: item.id,
            name: `${item.first_name} ${item.last_name}`,
          }))
        : enrollment.audience === 'guardian'
          ? guardians.map((item) => ({
              id: item.id,
              name: value(item, 'full_name'),
            }))
          : timetableStaff.map((item) => ({
              id: item.id,
              name: value(item, 'display_name') || value(item, 'email'),
            }));
    return (
      <div className="operations-grid">
        <ToolBar
          actions={[
            ...(canJourneys
              ? [
                  { id: 'journey', label: 'New follow-up sequence' },
                  { id: 'enroll', label: 'Start follow-up' },
                ]
              : []),
            ...(canIntegrations ? [{ id: 'export', label: 'Prepare report file' }] : []),
            ...(canAdvancedConnections
              ? [
                  { id: 'connection', label: 'Advanced connections' },
                  { id: 'delivery', label: 'Test connected service' },
                ]
              : []),
          ]}
        />
        {canJourneys && tool === 'journey' ? (
          <form className="panel compact-form operations-form" onSubmit={submitJourney}>
            <span className="eyebrow">
              <MessageSquareText size={14} /> {translate('Communication journey')}
            </span>
            <h3>{translate('Create a follow-up task')}</h3>
            <label>
              {translate('Follow-up name')}
              <input
                className="input"
                value={journey.name}
                onChange={(event) => setJourney({ ...journey, name: event.target.value })}
                placeholder={translate('New student welcome')}
                required
              />
            </label>
            <div className="form-grid two-col">
              <label>
                {translate('Audience')}
                <select
                  className="input"
                  value={journey.audience}
                  onChange={(event) => setJourney({ ...journey, audience: event.target.value })}
                >
                  {['student', 'guardian', 'staff'].map((audience) => (
                    <option key={audience} value={audience}>
                      {label(audience)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {translate('Start automatically when')}
                <select
                  className="input"
                  value={journey.trigger_key}
                  onChange={(event) =>
                    setJourney({
                      ...journey,
                      trigger_key: event.target.value,
                    })
                  }
                >
                  {[
                    'manual',
                    'student.enrolled',
                    'student.absent',
                    'payment.due_soon',
                    'payment.overdue',
                    'schedule.changed',
                    'assignment.missing',
                    'course.completed',
                  ].map((trigger) => (
                    <option key={trigger} value={trigger}>
                      {label(trigger)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-grid two-col">
              <label>
                {translate('Send by')}
                <select
                  className="input"
                  value={journey.channel}
                  onChange={(event) => setJourney({ ...journey, channel: event.target.value })}
                >
                  {['inapp', 'telegram', 'email'].map((channel) => (
                    <option key={channel} value={channel}>
                      {label(channel)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {translate('First delay, minutes')}
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={journey.delay_minutes}
                  onChange={(event) =>
                    setJourney({
                      ...journey,
                      delay_minutes: event.target.value,
                    })
                  }
                />
              </label>
            </div>
            <label>
              {translate('Title')}
              <input
                className="input"
                value={journey.title}
                onChange={(event) => setJourney({ ...journey, title: event.target.value })}
              />
            </label>
            <label>
              {translate('First message')}
              <textarea
                className="input"
                value={journey.message}
                onChange={(event) => setJourney({ ...journey, message: event.target.value })}
                placeholder={translate('Use {name} for the recipient name.')}
                required
              />
            </label>
            <label>
              {translate('Optional follow-up')}
              <textarea
                className="input"
                value={journey.follow_up}
                onChange={(event) => setJourney({ ...journey, follow_up: event.target.value })}
              />
            </label>
            {journey.follow_up ? (
              <label>
                {translate('Follow-up delay, minutes')}
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={journey.follow_up_delay}
                  onChange={(event) =>
                    setJourney({
                      ...journey,
                      follow_up_delay: event.target.value,
                    })
                  }
                />
              </label>
            ) : null}
            <button className="primary-btn" disabled={busy}>
              {translate('Save journey')}
            </button>
          </form>
        ) : null}
        {canJourneys && tool === 'enroll' ? (
          <form
            className="panel compact-form operations-form"
            onSubmit={(submitEvent) => {
              submitEvent.preventDefault();
              const subjectKey =
                enrollment.audience === 'student'
                  ? 'contact_id'
                  : enrollment.audience === 'guardian'
                    ? 'guardian_id'
                    : 'staff_id';
              void run(
                () =>
                  teacherStudioOperationalCommand(academyId, 'enroll_communication_journey', {
                    journey_id: enrollment.journey_id,
                    [subjectKey]: enrollment.recipient_id,
                  }),
                'Recipient enrolled.',
              );
            }}
          >
            <h3>{translate('Start a follow-up')}</h3>
            <label>
              {translate('Journey')}
              <select
                className="input"
                value={enrollment.journey_id}
                onChange={(event) => {
                  const selected = journeys.find((item) => item.id === event.target.value);
                  setEnrollment({
                    journey_id: event.target.value,
                    audience: value(selected ?? {}, 'audience') || 'student',
                    recipient_id: '',
                  });
                }}
                required
              >
                <option value="">{translate('Choose active journey')}</option>
                {journeys
                  .filter((item) => value(item, 'status') === 'active')
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {value(item, 'name')}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {translate('Recipient')}
              <select
                className="input"
                value={enrollment.recipient_id}
                onChange={(event) =>
                  setEnrollment({
                    ...enrollment,
                    recipient_id: event.target.value,
                  })
                }
                required
              >
                <option value="">{translate('Choose recipient')}</option>
                {recipientOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary-btn" disabled={busy}>
              {translate('Start follow-up')}
            </button>
          </form>
        ) : null}
        {canAdvancedConnections && tool === 'connection' ? (
          <form
            className="panel compact-form operations-form"
            onSubmit={(submitEvent) => {
              submitEvent.preventDefault();
              void run(
                () =>
                  teacherStudioOperationalCommand<{
                    signing_secret?: string;
                  }>(academyId, 'upsert_integration_endpoint', {
                    ...endpoint,
                    event_types: endpoint.event_types
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean),
                  }),
                'Outbound connection saved.',
                (result) => setLastSecret(result.signing_secret ?? ''),
              );
            }}
          >
            <span className="eyebrow">{translate('Advanced connections')}</span>
            <h3>{translate('Connect another service')}</h3>
            <label>
              {translate('Connection name')}
              <input
                className="input"
                value={endpoint.name}
                onChange={(event) => setEndpoint({ ...endpoint, name: event.target.value })}
                required
              />
            </label>
            <label>
              {translate('Secure delivery address')}
              <input
                className="input"
                type="url"
                value={endpoint.endpoint_url}
                onChange={(event) =>
                  setEndpoint({
                    ...endpoint,
                    endpoint_url: event.target.value,
                  })
                }
                required
              />
            </label>
            <label>
              {translate('Updates to share, comma separated')}
              <input
                className="input"
                value={endpoint.event_types}
                onChange={(event) =>
                  setEndpoint({
                    ...endpoint,
                    event_types: event.target.value,
                  })
                }
                required
              />
            </label>
            <button className="primary-btn" disabled={busy}>
              {translate('Save connection')}
            </button>
            {lastSecret ? (
              <div className="secret-once" role="status">
                <strong>{translate('Copy this security key now')}</strong>
                <code>{lastSecret}</code>
                <p>{translate('It will not be shown again.')}</p>
              </div>
            ) : null}
          </form>
        ) : null}
        {canAdvancedConnections && tool === 'delivery' ? (
          <form
            className="panel compact-form operations-form"
            onSubmit={(submitEvent) => {
              submitEvent.preventDefault();
              void run(
                () =>
                  teacherStudioOperationalCommand(academyId, 'queue_integration_event', {
                    endpoint_id: event.endpoint_id,
                    event_type: event.event_type,
                    payload: {
                      source: 'academy',
                      test: true,
                      sent_at: new Date().toISOString(),
                    },
                  }),
                'Test update is ready to send.',
              );
            }}
          >
            <h3>{translate('Test a connected service')}</h3>
            <label>
              {translate('Connected service')}
              <select
                className="input"
                value={event.endpoint_id}
                onChange={(changeEvent) => {
                  const selected = endpoints.find((item) => item.id === changeEvent.target.value);
                  const events = selected?.event_types as string[] | undefined;
                  setEvent({
                    ...event,
                    endpoint_id: changeEvent.target.value,
                    event_type: events?.[0] ?? event.event_type,
                  });
                }}
                required
              >
                <option value="">{translate('Choose service')}</option>
                {endpoints
                  .filter((item) => value(item, 'status') === 'active')
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {value(item, 'name')}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {translate('Update type')}
              <input
                className="input"
                value={event.event_type}
                onChange={(changeEvent) => setEvent({ ...event, event_type: changeEvent.target.value })}
                required
              />
            </label>
            <div className="record-actions">
              <button className="primary-btn" disabled={busy}>
                {translate('Prepare test update')}
              </button>
              <button
                className="ghost-btn"
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => teacherStudioOperationalCommand(academyId, 'dispatch_integration_events', { limit: 20 }),
                    'Waiting updates sent to connected services.',
                  )
                }
              >
                {translate('Send waiting updates')}
              </button>
            </div>
          </form>
        ) : null}
        {canIntegrations && tool === 'export' ? (
          <form
            className="panel compact-form operations-form"
            onSubmit={(submitEvent) => {
              submitEvent.preventDefault();
              void run(
                () => teacherStudioOperationalCommand(academyId, 'create_export', exportForm),
                'Export prepared.',
              );
            }}
          >
            <span className="eyebrow">{translate('Report file')}</span>
            <h3>{translate('Prepare a file to download')}</h3>
            <div className="form-grid two-col">
              <label>
                {translate('Data set')}
                <select
                  className="input"
                  value={exportForm.export_type}
                  onChange={(changeEvent) =>
                    setExportForm({
                      ...exportForm,
                      export_type: changeEvent.target.value,
                    })
                  }
                >
                  {[
                    'contacts',
                    'students',
                    'attendance',
                    'balances',
                    'payments',
                    'payroll',
                    'service_requests',
                    'learning_plans',
                  ].map((type) => (
                    <option key={type} value={type}>
                      {label(type)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {translate('File type')}
                <select
                  className="input"
                  value={exportForm.format}
                  onChange={(changeEvent) =>
                    setExportForm({
                      ...exportForm,
                      format: changeEvent.target.value,
                    })
                  }
                >
                  <option value="csv">{translate('Spreadsheet file')}</option>
                  <option value="json">{translate('Data file for another system')}</option>
                </select>
              </label>
            </div>
            <button className="primary-btn" disabled={busy}>
              {translate('Prepare file')}
            </button>
          </form>
        ) : null}
        {canJourneys ? (
          <RecordQueue
            title={translate('Follow-up plans')}
            rows={journeys}
            empty="No journeys have been configured."
            render={(item) => (
              <>
                <div>
                  <strong>{value(item, 'name')}</strong>
                  <p>
                    {label(value(item, 'audience'))} · {label(value(item, 'trigger_key'))}
                  </p>
                </div>
                <span className={statusTone(value(item, 'status'))}>{label(value(item, 'status'))}</span>
              </>
            )}
          />
        ) : null}
        {canAdvancedConnections ? (
          <RecordQueue
              title={translate('Connected service activity')}
            rows={data.integrations?.deliveries ?? []}
            empty="No outbound events have been queued."
            render={(item) => (
              <>
                <div>
                  <strong>{value(item, 'event_type')}</strong>
                  <p>
                    {value(item, 'attempts')} {translate('attempts')} ·{' '}
                    {value(item, 'error') || formatDate(value(item, 'created_at'))}
                  </p>
                </div>
                <span className={statusTone(value(item, 'status'))}>{label(value(item, 'status'))}</span>
              </>
            )}
          />
        ) : null}
        {canIntegrations ? (
          <RecordQueue
              title={translate('Prepared files')}
            rows={exports}
            empty="No exports have been prepared."
            render={(item) => (
              <>
                <div>
                  <strong>{label(value(item, 'export_type'))}</strong>
                  <p>
                    {value(item, 'row_count')} {translate('rows')} · {value(item, 'format').toUpperCase()}
                  </p>
                </div>
                <div className="record-actions">
                  <span className={statusTone(value(item, 'status'))}>{label(value(item, 'status'))}</span>
                  {value(item, 'status') === 'ready' ? (
                    <button
                      className="small-btn"
                      type="button"
                      disabled={busy}
                      onClick={() => void downloadExport(item)}
                    >
                      {translate('Download')}
                    </button>
                  ) : null}
                </div>
              </>
            )}
          />
        ) : null}
      </div>
    );
  }
}
