import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  Building2,
  CheckCircle2,
  GitBranch,
  Languages,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UsersRound,
  WalletCards,
} from "lucide-react";
import {
  teacherStudioBusinessIntelligence,
  teacherStudioCreateAutomationVersion,
  teacherStudioExecuteAutomationEvent,
  teacherStudioRequestAiAssistance,
  teacherStudioReviewAiAssistance,
  teacherStudioReviewAutomationExecution,
  teacherStudioUpsertLocalization,
  type AcademyBusinessIntelligence,
} from "../../lib/client";

type Props = {
  academyId: string;
  formatDate: (value: string | null | undefined) => string;
};
type Tab =
  | "pulse"
  | "journey"
  | "economics"
  | "people"
  | "automations"
  | "assistant"
  | "localization";

const text = (value: unknown) => String(value ?? "");
const number = (value: unknown) => Number(value ?? 0);
const label = (value: unknown) => text(value).replaceAll("_", " ");
const money = (value: unknown, currency = "UZS") =>
  `${new Intl.NumberFormat("uz-UZ").format(number(value))} ${currency}`;
const jsonObject = (value: string, field: string): Record<string, unknown> => {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error(`${field} must be a JSON object.`);
  return parsed as Record<string, unknown>;
};
const jsonArray = (value: string, field: string): unknown[] => {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`${field} must be a JSON array.`);
  return parsed;
};

export function BusinessPlatformView({ academyId, formatDate }: Props) {
  const [data, setData] = useState<AcademyBusinessIntelligence | null>(null);
  const [tab, setTab] = useState<Tab>("pulse");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [automation, setAutomation] = useState({
    rule_key: "missed-trial-follow-up",
    name: "Missed trial follow-up",
    branch_id: "",
    trigger_key: "trial.missed",
    condition_tree:
      '{"all":[{"field":"trial.status","operator":"eq","value":"missed"}]}',
    actions:
      '[{"type":"create_task","payload":{"title":"Follow up after missed trial","priority":"high","category":"admissions"}}]',
    safeguard_mode: "standard",
    status: "active",
  });
  const [execution, setExecution] = useState({
    rule_version_id: "",
    trigger_key: "manual",
    subject_type: "lead",
    subject_id: "",
    input_snapshot: '{"trial":{"status":"missed"}}',
  });
  const [assistant, setAssistant] = useState({
    request_kind: "operations_summary",
    branch_id: "",
    subject_type: "",
    subject_id: "",
    question: "What requires attention today?",
  });
  const [localization, setLocalization] = useState({
    default_locale: "uz",
    enabled_locales: ["uz", "ru", "en"],
    timezone: "Asia/Tashkent",
    currency: "UZS",
    phone_country_code: "+998",
    date_format: "DD.MM.YYYY",
    time_format: "24h",
    translation_key: "",
    translation_locale: "uz",
    translated_value: "",
  });

  const load = useCallback(async () => {
    setError("");
    try {
      const next = await teacherStudioBusinessIntelligence(academyId);
      setData(next);
      const firstBranch = text(next.branches[0]?.branch_id);
      setAutomation((previous) => ({
        ...previous,
        branch_id: previous.branch_id || firstBranch,
      }));
      setAssistant((previous) => ({
        ...previous,
        branch_id: previous.branch_id || firstBranch,
      }));
      setExecution((previous) => ({
        ...previous,
        rule_version_id:
          previous.rule_version_id ||
          text(
            next.automation_versions.find((item) => item.status === "active")
              ?.id,
          ),
        trigger_key:
          previous.trigger_key === "manual"
            ? text(
                next.automation_versions.find(
                  (item) => item.status === "active",
                )?.trigger_key || "manual",
              )
            : previous.trigger_key,
      }));
      const settings = next.localization;
      if (settings && Object.keys(settings).length)
        setLocalization((previous) => ({
          ...previous,
          default_locale:
            text(settings.default_locale) || previous.default_locale,
          enabled_locales: Array.isArray(settings.enabled_locales)
            ? settings.enabled_locales.map(String)
            : previous.enabled_locales,
          timezone: text(settings.timezone) || previous.timezone,
          currency: text(settings.currency) || previous.currency,
          phone_country_code:
            text(settings.phone_country_code) || previous.phone_country_code,
          date_format: text(settings.date_format) || previous.date_format,
          time_format: text(settings.time_format) || previous.time_format,
        }));
    } catch (next) {
      setError(
        next instanceof Error
          ? next.message
          : "Unable to load the business platform.",
      );
    }
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);
  const run = async (work: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice(message);
      await load();
    } catch (next) {
      setError(
        next instanceof Error
          ? next.message
          : "The operation could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const dashboard = data?.dashboard ?? data?.owner ?? {};
  const contactNames = useMemo(
    () =>
      new Map(
        (data?.contacts ?? []).map((item) => [
          text(item.id),
          `${text(item.first_name)} ${text(item.last_name)}`.trim(),
        ]),
      ),
    [data?.contacts],
  );
  const canManageAutomation =
    data?.access.permissions.manageAutomation === true;
  const canUseAi = data?.access.permissions.useAcademyAI === true;
  const canManageLocalization =
    data?.access.permissions.manageLocalization === true;
  const canSeeEconomics =
    data?.access.permissions.viewFinancialReports === true;

  if (!data)
    return (
      <section className="panel">
        <p>{error || "Loading the education business platform…"}</p>
      </section>
    );

  const createAutomation = () => {
    const conditionTree = jsonObject(automation.condition_tree, "Conditions");
    const actions = jsonArray(automation.actions, "Actions");
    return teacherStudioCreateAutomationVersion(academyId, {
      ...automation,
      condition_tree: conditionTree,
      actions,
      branch_id: automation.branch_id || null,
      idempotency_key: crypto.randomUUID(),
    });
  };
  const executeAutomation = () =>
    teacherStudioExecuteAutomationEvent(academyId, {
      ...execution,
      input_snapshot: jsonObject(execution.input_snapshot, "Input evidence"),
      idempotency_key: crypto.randomUUID(),
    });
  const requestAssistant = () =>
    teacherStudioRequestAiAssistance(academyId, {
      ...assistant,
      branch_id: assistant.branch_id || null,
      subject_type: assistant.subject_type || null,
      subject_id: assistant.subject_id || null,
      idempotency_key: crypto.randomUUID(),
    });

  return (
    <section className="business-platform">
      <header className="business-platform__hero">
        <div>
          <span className="eyebrow">
            One student record · one operating truth
          </span>
          <h2>Education business platform</h2>
          <p>
            Follow the student journey from first enquiry through learning,
            collection, retention, and renewal—with every automated or
            AI-assisted decision reviewable.
          </p>
        </div>
        <button
          className="ghost-btn"
          onClick={() => void load()}
          disabled={busy}
        >
          <RefreshCw size={16} /> Refresh evidence
        </button>
      </header>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="form-success" role="status">
          {notice}
        </p>
      ) : null}

      <nav
        className="business-platform__tabs"
        aria-label="Education business platform sections"
      >
        {(
          [
            ["pulse", Activity, "Today"],
            ["journey", GitBranch, "Student journey"],
            ["economics", WalletCards, "Economics"],
            ["people", UsersRound, "People"],
            ["automations", Bot, "Automations"],
            ["assistant", Sparkles, "AI assistant"],
            ["localization", Languages, "Localization"],
          ] as Array<[Tab, typeof Activity, string]>
        )
          .filter(([id]) => id !== "economics" || canSeeEconomics)
          .map(([id, Icon, name]) => (
            <button
              key={id}
              className={tab === id ? "is-active" : ""}
              onClick={() => setTab(id)}
            >
              <Icon size={15} />
              {name}
            </button>
          ))}
      </nav>

      {tab === "pulse" ? (
        <div className="business-platform__grid">
          <section
            className="business-platform__scoreboard"
            aria-label="Current operating pulse"
          >
            <article>
              <span>Students learning</span>
              <strong>{number(dashboard.active_students)}</strong>
              <small>{number(dashboard.new_students)} new this month</small>
            </article>
            <article>
              <span>Admissions</span>
              <strong>
                {number(dashboard.active_leads ?? dashboard.open_leads)}
              </strong>
              <small>{number(dashboard.conversions)} converted</small>
            </article>
            {canSeeEconomics ? (
              <article>
                <span>Collected</span>
                <strong>
                  {money(
                    dashboard.collected_revenue ?? dashboard.collected_amount,
                  )}
                </strong>
                <small>
                  {money(
                    dashboard.outstanding_amount ?? dashboard.outstanding_debt,
                  )}{" "}
                  outstanding
                </small>
              </article>
            ) : (
              <article>
                <span>Attendance health</span>
                <strong>{number(data.branches[0]?.attendance_percent)}%</strong>
                <small>Financial detail is role-restricted</small>
              </article>
            )}
            <article>
              <span>Needs a decision</span>
              <strong>
                {number(dashboard.pending_actions ?? dashboard.open_actions)}
              </strong>
              <small>
                {number(
                  dashboard.high_risk_students ??
                    dashboard.high_risk_evaluations,
                )}{" "}
                high-risk learners
              </small>
            </article>
          </section>
          <section className="panel business-platform__wide">
            <div className="business-platform__section-title">
              <div>
                <h3>Branch operating picture</h3>
                <p>
                  Comparable operational evidence; contribution is not statutory
                  profit.
                </p>
              </div>
              <Building2 size={20} />
            </div>
            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Branch</th>
                    <th>Students</th>
                    <th>Collected</th>
                    <th>Outstanding</th>
                    <th>Attendance</th>
                    <th>Contribution</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.branches.map((item) => (
                    <tr key={text(item.branch_id)}>
                      <td>
                        <strong>{text(item.name)}</strong>
                      </td>
                      <td>{number(item.active_students)}</td>
                      <td>
                        {money(item.collected_revenue ?? item.collected_amount)}
                      </td>
                      <td>{money(item.outstanding_amount)}</td>
                      <td>
                        {text(item.attendance_percent || "—")}
                        {item.attendance_percent ? "%" : ""}
                      </td>
                      <td>{money(item.contribution)}</td>
                      <td>{number(item.open_actions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <h3>Open action queue</h3>
            <div className="record-list">
              {data.actions.slice(0, 8).map((item) => (
                <article key={text(item.id)}>
                  <div>
                    <strong>{text(item.title)}</strong>
                    <p>
                      {label(item.category)} ·{" "}
                      {contactNames.get(text(item.contact_id)) ||
                        "Academy operation"}
                    </p>
                  </div>
                  <span
                    className={`business-status business-status--${text(item.priority)}`}
                  >
                    {label(item.priority)}
                  </span>
                </article>
              ))}
              {!data.actions.length ? (
                <p>
                  No open actions. New evidence-driven work will appear here.
                </p>
              ) : null}
            </div>
          </section>
          <section className="panel">
            <h3>Governed metric definitions</h3>
            <div className="record-list">
              {data.metric_definitions.map((item) => (
                <article key={`${text(item.metric_key)}:${text(item.version)}`}>
                  <div>
                    <strong>
                      {text(
                        (item.name_i18n as Record<string, unknown>)?.en ||
                          item.metric_key,
                      )}
                    </strong>
                    <p>{text(item.formula)}</p>
                  </div>
                  <span>{label(item.unit)}</span>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {tab === "journey" ? (
        <div className="business-platform__grid">
          <section className="panel business-platform__wide">
            <div className="business-platform__section-title">
              <div>
                <h3>Student intelligence</h3>
                <p>
                  Academic, attendance, financial, guardian, and retention
                  signals remain evidence—not an automated verdict.
                </p>
              </div>
              <ShieldCheck size={20} />
            </div>
            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Stage</th>
                    <th>Attendance 30d</th>
                    <th>Academic 90d</th>
                    <th>Balance</th>
                    <th>Risk</th>
                    <th>Open work</th>
                  </tr>
                </thead>
                <tbody>
                  {data.student_intelligence.map((item) => (
                    <tr key={text(item.contact_id)}>
                      <td>
                        <strong>{text(item.student_name)}</strong>
                      </td>
                      <td>{label(item.lifecycle_stage)}</td>
                      <td>
                        {text(item.attendance_30d_percent ?? "—")}
                        {item.attendance_30d_percent != null ? "%" : ""}
                      </td>
                      <td>
                        {text(item.academic_90d_percent ?? "—")}
                        {item.academic_90d_percent != null ? "%" : ""}
                      </td>
                      <td>{money(item.outstanding_balance)}</td>
                      <td>
                        {label(item.latest_risk_level || "not evaluated")}
                      </td>
                      <td>
                        {number(item.open_actions) +
                          number(item.open_interventions)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel business-platform__wide">
            <h3>Immutable lifecycle trail</h3>
            <div className="journey-rail">
              {data.lifecycle_events.slice(0, 40).map((item) => (
                <article key={text(item.id)}>
                  <span aria-hidden="true" />
                  <div>
                    <strong>{label(item.event_key)}</strong>
                    <p>
                      {contactNames.get(text(item.contact_id)) ||
                        label(item.source_table)}{" "}
                      · {formatDate(text(item.occurred_at))}
                    </p>
                  </div>
                  <code>{text(item.source_id).slice(0, 8)}</code>
                </article>
              ))}
              {!data.lifecycle_events.length ? (
                <p>
                  The lifecycle trail begins when a lead, enrollment, lesson,
                  payment, or renewal event is recorded.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {tab === "economics" && canSeeEconomics ? (
        <div className="business-platform__grid">
          <section className="panel business-platform__wide">
            <h3>Marketing attribution</h3>
            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Source / campaign</th>
                    <th>Leads</th>
                    <th>Trials</th>
                    <th>Students</th>
                    <th>Lead → student</th>
                    <th>Attributed revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.marketing_attribution.map((item, index) => (
                    <tr
                      key={`${text(item.source_id)}:${text(item.campaign_id)}:${index}`}
                    >
                      <td>
                        {text(item.campaign_id || item.source_id || "Direct")}
                      </td>
                      <td>{number(item.leads)}</td>
                      <td>{number(item.trials)}</td>
                      <td>{number(item.students)}</td>
                      <td>{text(item.lead_to_student_percent || 0)}%</td>
                      <td>{money(item.attributed_revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel business-platform__wide">
            <h3>Classroom unit economics</h3>
            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Classroom</th>
                    <th>Students</th>
                    <th>Fill</th>
                    <th>Revenue</th>
                    <th>Teacher cost</th>
                    <th>Contribution</th>
                    <th>Revenue / student</th>
                  </tr>
                </thead>
                <tbody>
                  {data.unit_economics.map((item) => (
                    <tr key={text(item.entity_id)}>
                      <td>
                        <strong>{text(item.entity_name)}</strong>
                      </td>
                      <td>{number(item.active_students)}</td>
                      <td>
                        {text(item.fill_percent ?? "—")}
                        {item.fill_percent != null ? "%" : ""}
                      </td>
                      <td>{money(item.generated_revenue)}</td>
                      <td>{money(item.teacher_cost)}</td>
                      <td>{money(item.contribution)}</td>
                      <td>{money(item.revenue_per_student)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {tab === "people" ? (
        <div className="business-platform__grid">
          <section className="panel business-platform__wide">
            <h3>Teacher evidence</h3>
            <p className="business-platform__guardrail">
              No automated ranking. Use sufficient sample size and read the
              operational context.
            </p>
            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Teacher</th>
                    <th>Groups</th>
                    <th>Students</th>
                    <th>Lessons</th>
                    <th>Attendance</th>
                    <th>Academic outcome</th>
                    <th>Observed quality</th>
                  </tr>
                </thead>
                <tbody>
                  {data.teacher_performance.map((item) => (
                    <tr key={text(item.staff_id)}>
                      <td>
                        <strong>
                          {text(item.display_name || item.staff_id)}
                        </strong>
                      </td>
                      <td>{number(item.assigned_groups)}</td>
                      <td>{number(item.active_students)}</td>
                      <td>{number(item.lessons_delivered)}</td>
                      <td>
                        {text(item.attendance_percent ?? "—")}
                        {item.attendance_percent != null ? "%" : ""}
                      </td>
                      <td>
                        {text(item.academic_outcome_percent ?? "—")}
                        {item.academic_outcome_percent != null ? "%" : ""}
                      </td>
                      <td>{text(item.observed_quality_rating ?? "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel business-platform__wide">
            <h3>Staff operating evidence</h3>
            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Staff member</th>
                    <th>Role</th>
                    <th>Leads</th>
                    <th>Activities</th>
                    <th>Conversions</th>
                    <th>Actions resolved</th>
                    <th>Open actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.staff_performance.map((item) => (
                    <tr key={text(item.staff_id)}>
                      <td>
                        <strong>
                          {text(item.display_name || item.staff_id)}
                        </strong>
                      </td>
                      <td>{label(item.role)}</td>
                      <td>{number(item.assigned_leads)}</td>
                      <td>{number(item.completed_activities)}</td>
                      <td>{number(item.lead_conversions)}</td>
                      <td>{number(item.resolved_actions)}</td>
                      <td>{number(item.open_actions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {tab === "automations" ? (
        <div className="business-platform__grid">
          <form
            className="panel compact-form"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void run(
                createAutomation,
                "Automation version saved with typed conditions and safeguards.",
              );
            }}
          >
            <h3>Create a versioned automation</h3>
            <label>
              Rule name
              <input
                className="input"
                value={automation.name}
                onChange={(event) =>
                  setAutomation({ ...automation, name: event.target.value })
                }
                required
              />
            </label>
            <label>
              Rule key
              <input
                className="input"
                value={automation.rule_key}
                onChange={(event) =>
                  setAutomation({ ...automation, rule_key: event.target.value })
                }
                required
              />
            </label>
            <label>
              Branch
              <select
                className="input"
                value={automation.branch_id}
                onChange={(event) =>
                  setAutomation({
                    ...automation,
                    branch_id: event.target.value,
                  })
                }
              >
                <option value="">Academy-wide</option>
                {data.branches.map((item) => (
                  <option
                    key={text(item.branch_id)}
                    value={text(item.branch_id)}
                  >
                    {text(item.name)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Trigger
              <select
                className="input"
                value={automation.trigger_key}
                onChange={(event) =>
                  setAutomation({
                    ...automation,
                    trigger_key: event.target.value,
                  })
                }
              >
                {[
                  "lead.created",
                  "lead.assigned",
                  "lead.stage_changed",
                  "trial.scheduled",
                  "trial.missed",
                  "student.enrolled",
                  "student.absent",
                  "attendance.threshold_crossed",
                  "payment.due_soon",
                  "payment.overdue",
                  "payment.received",
                  "grade.published",
                  "assignment.missing",
                  "risk.score_changed",
                  "subscription.expiring",
                  "student.course_completed",
                  "manual",
                ].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Conditions JSON
              <textarea
                className="input code-input"
                rows={5}
                value={automation.condition_tree}
                onChange={(event) =>
                  setAutomation({
                    ...automation,
                    condition_tree: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Actions JSON
              <textarea
                className="input code-input"
                rows={6}
                value={automation.actions}
                onChange={(event) =>
                  setAutomation({ ...automation, actions: event.target.value })
                }
              />
            </label>
            <label>
              Safeguard
              <select
                className="input"
                value={automation.safeguard_mode}
                onChange={(event) =>
                  setAutomation({
                    ...automation,
                    safeguard_mode: event.target.value,
                  })
                }
              >
                <option value="standard">Standard</option>
                <option value="human_review_required">
                  Human review required
                </option>
              </select>
            </label>
            <button
              className="primary-btn"
              disabled={busy || !canManageAutomation}
            >
              Save active version
            </button>
            {!canManageAutomation ? (
              <small>
                Your role can inspect automation evidence but cannot change
                rules.
              </small>
            ) : null}
          </form>
          <form
            className="panel compact-form"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void run(
                executeAutomation,
                "Automation evaluated and every effect recorded.",
              );
            }}
          >
            <h3>Test an event</h3>
            <label>
              Active version
              <select
                className="input"
                value={execution.rule_version_id}
                onChange={(event) => {
                  const version = data.automation_versions.find(
                    (item) => text(item.id) === event.target.value,
                  );
                  setExecution({
                    ...execution,
                    rule_version_id: event.target.value,
                    trigger_key: text(version?.trigger_key || "manual"),
                  });
                }}
              >
                {data.automation_versions
                  .filter((item) => item.status === "active")
                  .map((item) => (
                    <option key={text(item.id)} value={text(item.id)}>
                      {text(item.trigger_key)} · v{text(item.version)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Subject type
              <select
                className="input"
                value={execution.subject_type}
                onChange={(event) =>
                  setExecution({
                    ...execution,
                    subject_type: event.target.value,
                  })
                }
              >
                <option value="lead">Lead</option>
                <option value="contact">Student</option>
                <option value="classroom">Classroom</option>
              </select>
            </label>
            <label>
              Subject ID
              <input
                className="input"
                value={execution.subject_id}
                onChange={(event) =>
                  setExecution({ ...execution, subject_id: event.target.value })
                }
              />
            </label>
            <label>
              Input evidence JSON
              <textarea
                className="input code-input"
                rows={6}
                value={execution.input_snapshot}
                onChange={(event) =>
                  setExecution({
                    ...execution,
                    input_snapshot: event.target.value,
                  })
                }
              />
            </label>
            <button
              className="primary-btn"
              disabled={
                busy || !canManageAutomation || !execution.rule_version_id
              }
            >
              Evaluate event
            </button>
          </form>
          <section className="panel business-platform__wide">
            <h3>Execution and effect evidence</h3>
            <div className="record-list">
              {data.automation_executions.map((item) => (
                <article key={text(item.id)}>
                  <div>
                    <strong>
                      {text(item.trigger_key)} · {label(item.status)}
                    </strong>
                    <p>
                      {formatDate(text(item.created_at))} ·{" "}
                      {text(
                        (item.output_summary as Record<string, unknown>)
                          ?.succeeded || 0,
                      )}{" "}
                      succeeded ·{" "}
                      {text(
                        (item.output_summary as Record<string, unknown>)
                          ?.failed || 0,
                      )}{" "}
                      failed
                    </p>
                  </div>
                  {item.status === "awaiting_review" ? (
                    <div className="inline-actions">
                      <button
                        className="small-btn"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              teacherStudioReviewAutomationExecution(
                                academyId,
                                {
                                  execution_id: item.id,
                                  decision: "approved",
                                  note: "Reviewed in business platform",
                                },
                              ),
                            "Automation approved and executed.",
                          )
                        }
                      >
                        Approve
                      </button>
                      <button
                        className="small-btn danger"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              teacherStudioReviewAutomationExecution(
                                academyId,
                                {
                                  execution_id: item.id,
                                  decision: "rejected",
                                  note: "Rejected in business platform",
                                },
                              ),
                            "Automation rejected; no effects executed.",
                          )
                        }
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    <CheckCircle2 size={18} />
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {tab === "assistant" ? (
        <div className="business-platform__grid">
          <form
            className="panel compact-form"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void run(
                requestAssistant,
                "AI proposal generated from authorized evidence and queued for review.",
              );
            }}
          >
            <h3>Ask with evidence</h3>
            <label>
              Request type
              <select
                className="input"
                value={assistant.request_kind}
                onChange={(event) =>
                  setAssistant({
                    ...assistant,
                    request_kind: event.target.value,
                  })
                }
              >
                {[
                  "operations_summary",
                  "student_progress_summary",
                  "parent_report_draft",
                  "lead_history_summary",
                  "follow_up_draft",
                  "classroom_performance_summary",
                  "unusual_change_explanation",
                  "risk_explanation",
                  "announcement_draft",
                  "owner_question",
                ].map((item) => (
                  <option key={item} value={item}>
                    {label(item)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Branch
              <select
                className="input"
                value={assistant.branch_id}
                onChange={(event) =>
                  setAssistant({ ...assistant, branch_id: event.target.value })
                }
              >
                <option value="">Academy-wide</option>
                {data.branches.map((item) => (
                  <option
                    key={text(item.branch_id)}
                    value={text(item.branch_id)}
                  >
                    {text(item.name)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Subject type
              <select
                className="input"
                value={assistant.subject_type}
                onChange={(event) =>
                  setAssistant({
                    ...assistant,
                    subject_type: event.target.value,
                  })
                }
              >
                <option value="">Operating scope</option>
                <option value="contact">Student</option>
                <option value="lead">Lead</option>
                <option value="classroom">Classroom</option>
              </select>
            </label>
            <label>
              Subject ID
              <input
                className="input"
                value={assistant.subject_id}
                onChange={(event) =>
                  setAssistant({ ...assistant, subject_id: event.target.value })
                }
                placeholder="Required when a subject type is selected"
              />
            </label>
            <label>
              Your question
              <textarea
                className="input"
                rows={5}
                value={assistant.question}
                onChange={(event) =>
                  setAssistant({ ...assistant, question: event.target.value })
                }
              />
            </label>
            <button className="primary-btn" disabled={busy || !canUseAi}>
              Generate reviewable proposal
            </button>
          </form>
          <section className="panel commercial-span">
            <h3>Human review queue</h3>
            <div className="record-list">
              {data.ai_requests.map((item) => {
                const output = (item.proposed_output ?? {}) as Record<
                  string,
                  unknown
                >;
                return (
                  <article className="ai-review-card" key={text(item.id)}>
                    <div>
                      <strong>
                        {text(output.title || label(item.request_kind))}
                      </strong>
                      <p>
                        {text(
                          output.summary ||
                            item.ai_error ||
                            "Generation in progress",
                        )}
                      </p>
                      <small>
                        {label(item.status)} · AI status {label(item.ai_status)}{" "}
                        · {formatDate(text(item.requested_at))}
                      </small>
                    </div>
                    {item.status === "ready" ? (
                      <div className="inline-actions">
                        <button
                          className="small-btn"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () =>
                                teacherStudioReviewAiAssistance(academyId, {
                                  request_id: item.id,
                                  decision: "approved",
                                  note: "Evidence and wording reviewed",
                                }),
                              "AI proposal approved as a draft; no operational action was executed.",
                            )
                          }
                        >
                          Approve draft
                        </button>
                        <button
                          className="small-btn danger"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () =>
                                teacherStudioReviewAiAssistance(academyId, {
                                  request_id: item.id,
                                  decision: "rejected",
                                  note: "Proposal requires revision",
                                }),
                              "AI proposal rejected.",
                            )
                          }
                        >
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
              {!data.ai_requests.length ? (
                <p>
                  Generate a proposal to start the review queue. AI never
                  enrolls, charges, grades, or sends on its own.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {tab === "localization" ? (
        <div className="business-platform__grid">
          <form
            className="panel compact-form"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              const translations =
                localization.translation_key && localization.translated_value
                  ? [
                      {
                        translation_key: localization.translation_key,
                        locale: localization.translation_locale,
                        translated_value: localization.translated_value,
                      },
                    ]
                  : [];
              void run(
                () =>
                  teacherStudioUpsertLocalization(academyId, {
                    ...localization,
                    translations,
                  }),
                "Uzbek business defaults and translation overrides saved.",
              );
            }}
          >
            <h3>Uzbek-first operating defaults</h3>
            <label>
              Default language
              <select
                className="input"
                value={localization.default_locale}
                onChange={(event) =>
                  setLocalization({
                    ...localization,
                    default_locale: event.target.value,
                  })
                }
              >
                <option value="uz">O‘zbekcha</option>
                <option value="ru">Русский</option>
                <option value="en">English</option>
              </select>
            </label>
            <fieldset className="locale-options">
              <legend>Enabled languages</legend>
              {[
                ["uz", "O‘zbekcha"],
                ["ru", "Русский"],
                ["en", "English"],
              ].map(([locale, name]) => (
                <label key={locale}>
                  <input
                    type="checkbox"
                    checked={localization.enabled_locales.includes(locale)}
                    disabled={localization.default_locale === locale}
                    onChange={(event) =>
                      setLocalization({
                        ...localization,
                        enabled_locales: event.target.checked
                          ? Array.from(
                              new Set([
                                ...localization.enabled_locales,
                                locale,
                              ]),
                            )
                          : localization.enabled_locales.filter(
                              (value) => value !== locale,
                            ),
                      })
                    }
                  />
                  {name}
                </label>
              ))}
            </fieldset>
            <div className="form-grid two-col">
              <label>
                Timezone
                <input
                  className="input"
                  value={localization.timezone}
                  onChange={(event) =>
                    setLocalization({
                      ...localization,
                      timezone: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Currency
                <input
                  className="input"
                  value={localization.currency}
                  onChange={(event) =>
                    setLocalization({
                      ...localization,
                      currency: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Phone country code
                <input
                  className="input"
                  value={localization.phone_country_code}
                  onChange={(event) =>
                    setLocalization({
                      ...localization,
                      phone_country_code: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Date format
                <input
                  className="input"
                  value={localization.date_format}
                  onChange={(event) =>
                    setLocalization({
                      ...localization,
                      date_format: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Time format
                <select
                  className="input"
                  value={localization.time_format}
                  onChange={(event) =>
                    setLocalization({
                      ...localization,
                      time_format: event.target.value,
                    })
                  }
                >
                  <option value="24h">24-hour</option>
                  <option value="12h">12-hour</option>
                </select>
              </label>
            </div>
            <h4>Translation override</h4>
            <label>
              Translation key
              <input
                className="input"
                value={localization.translation_key}
                onChange={(event) =>
                  setLocalization({
                    ...localization,
                    translation_key: event.target.value,
                  })
                }
                placeholder="navigation.business_platform"
              />
            </label>
            <label>
              Language
              <select
                className="input"
                value={localization.translation_locale}
                onChange={(event) =>
                  setLocalization({
                    ...localization,
                    translation_locale: event.target.value,
                  })
                }
              >
                <option value="uz">O‘zbekcha</option>
                <option value="ru">Русский</option>
                <option value="en">English</option>
              </select>
            </label>
            <label>
              Translated text
              <input
                className="input"
                value={localization.translated_value}
                onChange={(event) =>
                  setLocalization({
                    ...localization,
                    translated_value: event.target.value,
                  })
                }
              />
            </label>
            <button
              className="primary-btn"
              disabled={busy || !canManageLocalization}
            >
              Save localization
            </button>
          </form>
          <section className="panel commercial-span">
            <h3>Active translation overrides</h3>
            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Language</th>
                    <th>Text</th>
                  </tr>
                </thead>
                <tbody>
                  {data.translations.map((item) => (
                    <tr
                      key={`${text(item.translation_key)}:${text(item.locale)}`}
                    >
                      <td>
                        <code>{text(item.translation_key)}</code>
                      </td>
                      <td>{text(item.locale).toUpperCase()}</td>
                      <td>{text(item.translated_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
