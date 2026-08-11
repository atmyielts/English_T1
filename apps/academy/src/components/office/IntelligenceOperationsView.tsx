import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Target,
  UserRoundCheck,
} from "lucide-react";
import { readSheet } from "read-excel-file/browser";
import {
  teacherStudioAddImportRow,
  teacherStudioBusinessIntelligence,
  teacherStudioCommitImportJob,
  teacherStudioCreateImportJob,
  teacherStudioRollbackImportJob,
  teacherStudioCreateIntervention,
  teacherStudioEvaluateRetentionRisk,
  teacherStudioGlobalSearch,
  teacherStudioRecordInterventionActivity,
  teacherStudioRecordRenewalActivity,
  teacherStudioUpdateIntervention,
  teacherStudioUpdateOperationalAction,
  teacherStudioUpsertRenewalOpportunity,
  teacherStudioUpsertRiskDefinition,
  type AcademyBusinessIntelligence,
} from "../../lib/client";

type Props = {
  academyId: string;
  formatDate: (value: string | null | undefined) => string;
};
type Tab =
  "dashboard" | "retention" | "renewals" | "actions" | "search" | "imports";
const s = (value: unknown) => String(value ?? "");
const n = (value: unknown) => Number(value ?? 0);
const label = (value: unknown) => s(value).replaceAll("_", " ");
const money = (value: unknown, currency = "UZS") =>
  `${new Intl.NumberFormat("uz-UZ").format(n(value))} ${currency}`;
type ImportCell = string | number | boolean | Date | null;
const normalizeImportCell = (value: unknown): ImportCell => {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value instanceof Date) return value;
  return String(value);
};
type ImportRow = Record<string, ImportCell>;
const importFields: Record<
  string,
  Array<{ key: string; required?: boolean }>
> = {
  contacts: [
    { key: "first_name", required: true },
    { key: "last_name" },
    { key: "email" },
    { key: "phone" },
    { key: "primary_branch_id", required: true },
    { key: "status" },
    { key: "lifecycle_stage" },
  ],
  leads: [
    { key: "full_name", required: true },
    { key: "email" },
    { key: "phone" },
    { key: "branch_id", required: true },
    { key: "currency" },
  ],
  guardians: [
    { key: "full_name", required: true },
    { key: "email" },
    { key: "phone" },
    { key: "telegram_user_id" },
    { key: "locale" },
    { key: "notes" },
  ],
  staff: [
    { key: "email", required: true },
    { key: "display_name" },
    { key: "role", required: true },
    { key: "classroom_ids" },
    { key: "is_active" },
  ],
  classrooms: [
    { key: "name", required: true },
    { key: "branch_id", required: true },
    { key: "description" },
    { key: "student_capacity" },
    { key: "is_active" },
  ],
  balances: [
    { key: "contact_id", required: true },
    { key: "amount", required: true },
    { key: "currency" },
    { key: "effective_at" },
    { key: "reason", required: true },
  ],
  enrollments: [
    { key: "contact_id", required: true },
    { key: "classroom_id", required: true },
    { key: "status" },
    { key: "joined_at" },
    { key: "started_at" },
  ],
  attendance: [
    { key: "contact_id", required: true },
    { key: "classroom_id", required: true },
    { key: "session_date", required: true },
    { key: "status", required: true },
    { key: "notes" },
  ],
};
const normalizeHeading = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
const rowsFromMatrix = (
  matrix: ImportCell[][],
): { headers: string[]; rows: ImportRow[] } => {
  if (matrix.length < 2)
    throw new Error("The file needs a header and at least one data row.");
  const headers = matrix[0].map((value) => s(value).trim());
  if (headers.some((value) => !value))
    throw new Error("Every source column needs a header.");
  if (new Set(headers.map(normalizeHeading)).size !== headers.length)
    throw new Error("Source headers must be unique.");
  if (matrix.length > 5001)
    throw new Error("Import files are limited to 5,000 rows per job.");
  return {
    headers,
    rows: matrix
      .slice(1)
      .filter((row) => row.some((value) => s(value).trim()))
      .map((row) =>
        Object.fromEntries(
          headers.map((header, index) => [header, row[index] ?? null]),
        ),
      ),
  };
};
const parseCsv = (value: string): ImportCell[][] => {
  const rows: ImportCell[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (character === '"') {
      if (quoted && value[index + 1] === '"') {
        cell += '"';
        index++;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && value[index + 1] === "\n") index++;
      row.push(cell.trim());
      if (row.some((item) => item !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  row.push(cell.trim());
  if (row.some((item) => item !== "")) rows.push(row);
  return rows;
};
const autoMapping = (headers: string[], type: string) =>
  Object.fromEntries(
    (importFields[type] ?? []).map((field) => {
      const key = normalizeHeading(field.key);
      return [
        field.key,
        headers.find((header) => normalizeHeading(header) === key) || "",
      ];
    }),
  );
export function IntelligenceOperationsView({ academyId, formatDate }: Props) {
  const [data, setData] = useState<AcademyBusinessIntelligence | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [definition, setDefinition] = useState({
    definition_key: "standard_retention",
    name: "Standard retention risk",
    version: 1,
    status: "active",
    explanation:
      "Explainable weighted model using attendance, homework, overdue debt, and engagement.",
  });
  const [evaluation, setEvaluation] = useState({
    contact_id: "",
    definition_id: "",
  });
  const [intervention, setIntervention] = useState({
    contact_id: "",
    risk_evaluation_id: "",
    priority: "high",
    assigned_to: "",
    next_follow_up_at: "",
  });
  const [activity, setActivity] = useState({
    case_id: "",
    activity_type: "call",
    note: "",
    next_follow_up_at: "",
  });
  const [renewal, setRenewal] = useState({
    contact_id: "",
    subscription_id: "",
    renewal_due_on: "",
    status: "identified",
    likelihood: 70,
    expected_amount: 0,
    currency: "UZS",
    assigned_to: "",
    next_action_at: "",
    offer_notes: "",
  });
  const [renewalActivity, setRenewalActivity] = useState({
    opportunity_id: "",
    activity_type: "call",
    note: "",
    next_action_at: "",
  });
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<Record<string, unknown>>
  >([]);
  const [importForm, setImportForm] = useState({
    import_type: "contacts",
    source_filename: "academy-import.csv",
    duplicate_strategy: "reject",
    csv: "first_name,last_name,email,phone,primary_branch_id\nAli,Karimov,ali@example.test,+998900000000,BRANCH_UUID",
  });
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>(
    {},
  );
  const [selectedImport, setSelectedImport] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const next = await teacherStudioBusinessIntelligence(academyId);
      setData(next);
      setEvaluation((previous) => ({
        ...previous,
        contact_id: previous.contact_id || s(next.contacts[0]?.id),
        definition_id:
          previous.definition_id ||
          s(next.risk_definitions.find((item) => item.status === "active")?.id),
      }));
      setIntervention((previous) => ({
        ...previous,
        contact_id: previous.contact_id || s(next.contacts[0]?.id),
        risk_evaluation_id:
          previous.risk_evaluation_id || s(next.risk_evaluations[0]?.id),
      }));
      setActivity((previous) => ({
        ...previous,
        case_id: previous.case_id || s(next.interventions[0]?.id),
      }));
      setRenewal((previous) => ({
        ...previous,
        contact_id: previous.contact_id || s(next.contacts[0]?.id),
        subscription_id:
          previous.subscription_id || s(next.subscriptions[0]?.id),
        expected_amount:
          previous.expected_amount || n(next.subscriptions[0]?.agreed_amount),
      }));
      setRenewalActivity((previous) => ({
        ...previous,
        opportunity_id: previous.opportunity_id || s(next.renewals[0]?.id),
      }));
      setSelectedImport(
        (previous) =>
          previous ||
          s(next.import_jobs.find((item) => item.status === "ready")?.id),
      );
    } catch (next) {
      setError(
        next instanceof Error
          ? next.message
          : "Unable to load intelligence operations.",
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
      setError(next instanceof Error ? next.message : "Operation failed.");
    } finally {
      setBusy(false);
    }
  };
  const contactById = useMemo(
    () =>
      new Map(
        (data?.contacts ?? []).map((item) => [
          s(item.id),
          `${s(item.first_name)} ${s(item.last_name)}`.trim(),
        ]),
      ),
    [data?.contacts],
  );
  const owner = data?.owner ?? {};
  const applyImportMatrix = (matrix: ImportCell[][], filename: string) => {
    const parsed = rowsFromMatrix(matrix);
    setImportHeaders(parsed.headers);
    setImportRows(parsed.rows);
    setColumnMapping(autoMapping(parsed.headers, importForm.import_type));
    setImportForm((previous) => ({ ...previous, source_filename: filename }));
  };
  const loadImportFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024)
      throw new Error("Import files are limited to 10 MB.");
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension === "xlsx") {
      const workbookRows = (await readSheet(file)) as unknown[][];
      const matrix = workbookRows.map((row) => row.map(normalizeImportCell));
      applyImportMatrix(matrix, file.name);
      return;
    }
    if (extension === "csv") {
      applyImportMatrix(parseCsv(await file.text()), file.name);
      return;
    }
    throw new Error("Choose a .csv or .xlsx file.");
  };
  const loadPastedCsv = () =>
    applyImportMatrix(
      parseCsv(importForm.csv),
      importForm.source_filename || "academy-import.csv",
    );
  const stageImport = async () => {
    if (!importRows.length || !importHeaders.length)
      throw new Error("Load and preview a CSV or XLSX file before staging.");
    const fields = importFields[importForm.import_type] ?? [];
    const missing = fields
      .filter((field) => field.required && !columnMapping[field.key])
      .map((field) => field.key);
    if (missing.length)
      throw new Error(`Map required fields: ${missing.join(", ")}.`);
    const created = await teacherStudioCreateImportJob(academyId, {
      import_type: importForm.import_type,
      source_filename: importForm.source_filename,
      import_mode: "dry_run",
      duplicate_strategy: importForm.duplicate_strategy,
      column_mapping: columnMapping,
      idempotency_key: crypto.randomUUID(),
    });
    const jobId = s(created.import_job.id);
    for (let offset = 0; offset < importRows.length; offset += 8) {
      await Promise.all(
        importRows.slice(offset, offset + 8).map((raw, relativeIndex) => {
          const mapped = Object.fromEntries(
            fields.map((field) => [
              field.key,
              columnMapping[field.key]
                ? (raw[columnMapping[field.key]] ?? "")
                : "",
            ]),
          );
          return teacherStudioAddImportRow(academyId, {
            import_job_id: jobId,
            row_number: offset + relativeIndex + 1,
            raw_data: raw,
            mapped_data: mapped,
          });
        }),
      );
    }
    setSelectedImport(jobId);
  };
  if (!data)
    return (
      <section className="panel">
        <p>{error || "Loading owner intelligence…"}</p>
      </section>
    );
  return (
    <section className="commercial-core">
      <div className="section-heading commercial-core__heading">
        <div>
          <span className="eyebrow">Observe → explain → act → measure</span>
          <h2>Retention, renewal, and owner intelligence</h2>
          <p>
            Versioned risk evidence feeds assigned interventions, renewal work,
            and one SLA-aware action queue.
          </p>
        </div>
        <button
          className="ghost-btn"
          onClick={() => void load()}
          disabled={busy}
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
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
      <div className="commercial-core__stats">
        <article>
          <BarChart3 size={18} />
          <span>Active students</span>
          <strong>{n(owner.active_students)}</strong>
        </article>
        <article>
          <AlertTriangle size={18} />
          <span>High-risk evaluations</span>
          <strong>{n(owner.high_risk_evaluations)}</strong>
        </article>
        <article>
          <Target size={18} />
          <span>Open interventions</span>
          <strong>{n(owner.open_interventions)}</strong>
        </article>
        <article>
          <UserRoundCheck size={18} />
          <span>Open renewals</span>
          <strong>{n(owner.open_renewals)}</strong>
        </article>
      </div>
      <nav
        className="business-tabs"
        aria-label="Intelligence operations sections"
      >
        {(
          [
            ["dashboard", "Owner dashboard"],
            ["retention", "Retention"],
            ["renewals", "Renewals"],
            ["actions", "Action queue"],
            ["search", "Global search"],
            ["imports", "Imports"],
          ] as Array<[Tab, string]>
        ).map(([id, text]) => (
          <button
            key={id}
            className={tab === id ? "is-active" : ""}
            onClick={() => setTab(id)}
          >
            {text}
          </button>
        ))}
      </nav>
      {tab === "dashboard" ? (
        <div className="commercial-grid">
          <section className="panel">
            <h3>Commercial and service health</h3>
            <div className="record-list">
              <article>
                <strong>Collections</strong>
                <span>{money(owner.collected_amount)}</span>
              </article>
              <article>
                <strong>Outstanding debt</strong>
                <span>{money(owner.outstanding_debt)}</span>
              </article>
              <article>
                <strong>Admissions</strong>
                <span>
                  {n(owner.open_leads)} open leads · {n(owner.conversions)}{" "}
                  conversions
                </span>
              </article>
              <article>
                <strong>Action SLA</strong>
                <span>
                  {n(owner.open_actions)} open · {n(owner.overdue_actions)}{" "}
                  overdue
                </span>
              </article>
            </div>
          </section>
          <section className="panel commercial-span">
            <h3>Branch comparison</h3>
            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Branch</th>
                    <th>Students</th>
                    <th>Subscriptions</th>
                    <th>Collected</th>
                    <th>Interventions</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.branches.map((item) => (
                    <tr key={s(item.branch_id)}>
                      <td>{s(item.name)}</td>
                      <td>{n(item.active_students)}</td>
                      <td>{n(item.active_subscriptions)}</td>
                      <td>{money(item.collected_amount)}</td>
                      <td>{n(item.open_interventions)}</td>
                      <td>{n(item.open_actions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
      {tab === "retention" ? (
        <div className="commercial-grid">
          <form
            className="panel compact-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void run(
                () =>
                  teacherStudioUpsertRiskDefinition(academyId, {
                    ...definition,
                    weights: {
                      attendance: 30,
                      homework: 20,
                      debt: 30,
                      engagement: 20,
                    },
                    thresholds: { low: 25, medium: 50, high: 70, critical: 85 },
                  }),
                "Versioned risk definition saved.",
              );
            }}
          >
            <h3>Versioned risk definition</h3>
            <label>
              Definition key
              <input
                className="input"
                value={definition.definition_key}
                onChange={(e) =>
                  setDefinition({
                    ...definition,
                    definition_key: e.target.value,
                  })
                }
              />
            </label>
            <label>
              Name
              <input
                className="input"
                value={definition.name}
                onChange={(e) =>
                  setDefinition({ ...definition, name: e.target.value })
                }
              />
            </label>
            <label>
              Version
              <input
                className="input"
                type="number"
                min="1"
                value={definition.version}
                onChange={(e) =>
                  setDefinition({
                    ...definition,
                    version: Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Explanation
              <textarea
                className="input"
                value={definition.explanation}
                onChange={(e) =>
                  setDefinition({ ...definition, explanation: e.target.value })
                }
              />
            </label>
            <button className="primary-btn" disabled={busy}>
              Activate risk model
            </button>
          </form>
          <form
            className="panel compact-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void run(
                () =>
                  teacherStudioEvaluateRetentionRisk(academyId, {
                    ...evaluation,
                    idempotency_key: crypto.randomUUID(),
                  }),
                "Explainable retention risk evaluated.",
              );
            }}
          >
            <h3>Evaluate learner</h3>
            <label>
              Learner
              <select
                className="input"
                value={evaluation.contact_id}
                onChange={(e) =>
                  setEvaluation({ ...evaluation, contact_id: e.target.value })
                }
              >
                {data.contacts.map((item) => (
                  <option key={s(item.id)} value={s(item.id)}>
                    {contactById.get(s(item.id))}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Active definition
              <select
                className="input"
                value={evaluation.definition_id}
                onChange={(e) =>
                  setEvaluation({
                    ...evaluation,
                    definition_id: e.target.value,
                  })
                }
              >
                {data.risk_definitions
                  .filter((item) => item.status === "active")
                  .map((item) => (
                    <option key={s(item.id)} value={s(item.id)}>
                      {s(item.name)} v{s(item.version)}
                    </option>
                  ))}
              </select>
            </label>
            <button className="primary-btn" disabled={busy}>
              Evaluate and explain
            </button>
          </form>
          <section className="panel commercial-span">
            <h3>Risk evidence</h3>
            <div className="record-list">
              {data.risk_evaluations.map((item) => (
                <article key={s(item.id)}>
                  <div>
                    <strong>
                      {contactById.get(s(item.contact_id))} ·{" "}
                      {label(item.risk_level)} · {s(item.score)}/100
                    </strong>
                    <p>{s(item.summary)}</p>
                  </div>
                  <button
                    className="small-btn"
                    onClick={() =>
                      setIntervention({
                        ...intervention,
                        contact_id: s(item.contact_id),
                        risk_evaluation_id: s(item.id),
                      })
                    }
                  >
                    Use in intervention
                  </button>
                </article>
              ))}
            </div>
          </section>
          <form
            className="panel compact-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void run(
                () => teacherStudioCreateIntervention(academyId, intervention),
                "Assigned intervention opened with SLA follow-up.",
              );
            }}
          >
            <h3>Open intervention</h3>
            <label>
              Learner
              <select
                className="input"
                value={intervention.contact_id}
                onChange={(e) =>
                  setIntervention({
                    ...intervention,
                    contact_id: e.target.value,
                  })
                }
              >
                {data.contacts.map((item) => (
                  <option key={s(item.id)} value={s(item.id)}>
                    {contactById.get(s(item.id))}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Risk evaluation
              <select
                className="input"
                value={intervention.risk_evaluation_id}
                onChange={(e) =>
                  setIntervention({
                    ...intervention,
                    risk_evaluation_id: e.target.value,
                  })
                }
              >
                {data.risk_evaluations.map((item) => (
                  <option key={s(item.id)} value={s(item.id)}>
                    {label(item.risk_level)} · {s(item.score)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Next follow-up
              <input
                className="input"
                type="datetime-local"
                value={intervention.next_follow_up_at}
                onChange={(e) =>
                  setIntervention({
                    ...intervention,
                    next_follow_up_at: e.target.value,
                  })
                }
              />
            </label>
            <button className="primary-btn" disabled={busy}>
              Open case
            </button>
          </form>
          <form
            className="panel compact-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void run(
                () =>
                  teacherStudioRecordInterventionActivity(academyId, activity),
                "Intervention contact and next follow-up recorded.",
              );
            }}
          >
            <h3>Record intervention activity</h3>
            <label>
              Case
              <select
                className="input"
                value={activity.case_id}
                onChange={(e) =>
                  setActivity({ ...activity, case_id: e.target.value })
                }
              >
                {data.interventions.map((item) => (
                  <option key={s(item.id)} value={s(item.id)}>
                    {contactById.get(s(item.contact_id))} · {label(item.status)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Channel
              <select
                className="input"
                value={activity.activity_type}
                onChange={(e) =>
                  setActivity({ ...activity, activity_type: e.target.value })
                }
              >
                {[
                  "call",
                  "telegram",
                  "meeting",
                  "academic_plan",
                  "payment_plan",
                  "schedule_change",
                  "guardian_contact",
                  "follow_up",
                  "note",
                ].map((value) => (
                  <option key={value}>{label(value)}</option>
                ))}
              </select>
            </label>
            <label>
              Observation and agreed action
              <textarea
                className="input"
                value={activity.note}
                onChange={(e) =>
                  setActivity({ ...activity, note: e.target.value })
                }
                required
              />
            </label>
            <label>
              Next follow-up
              <input
                className="input"
                type="datetime-local"
                value={activity.next_follow_up_at}
                onChange={(e) =>
                  setActivity({
                    ...activity,
                    next_follow_up_at: e.target.value,
                  })
                }
              />
            </label>
            <button className="primary-btn" disabled={busy}>
              Record activity
            </button>
          </form>
          <section className="panel commercial-span">
            <h3>Intervention outcomes</h3>
            <div className="record-list">
              {data.interventions.map((item) => (
                <article key={s(item.id)}>
                  <div>
                    <strong>
                      {contactById.get(s(item.contact_id))} ·{" "}
                      {label(item.status)}
                    </strong>
                    <p>
                      Follow-up{" "}
                      {item.next_follow_up_at
                        ? formatDate(s(item.next_follow_up_at))
                        : "not assigned"}{" "}
                      · {s(item.outcome || "outcome pending")}
                    </p>
                  </div>
                  {!["resolved", "closed_unsuccessful"].includes(
                    s(item.status),
                  ) ? (
                    <button
                      className="small-btn"
                      onClick={() =>
                        void run(
                          () =>
                            teacherStudioUpdateIntervention(academyId, {
                              id: item.id,
                              status: "resolved",
                              outcome: "retained",
                              outcome_reason: "Resolved by operator",
                            }),
                          "Intervention outcome recorded.",
                        )
                      }
                    >
                      Resolve retained
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}
      {tab === "renewals" ? (
        <div className="commercial-grid">
          <form
            className="panel compact-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void run(
                () => teacherStudioUpsertRenewalOpportunity(academyId, renewal),
                "Renewal opportunity and next action saved.",
              );
            }}
          >
            <h3>Create renewal opportunity</h3>
            <label>
              Learner
              <select
                className="input"
                value={renewal.contact_id}
                onChange={(e) =>
                  setRenewal({ ...renewal, contact_id: e.target.value })
                }
              >
                {data.contacts.map((item) => (
                  <option key={s(item.id)} value={s(item.id)}>
                    {contactById.get(s(item.id))}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Subscription
              <select
                className="input"
                value={renewal.subscription_id}
                onChange={(e) =>
                  setRenewal({ ...renewal, subscription_id: e.target.value })
                }
              >
                <option value="">No linked subscription</option>
                {data.subscriptions.map((item) => (
                  <option key={s(item.id)} value={s(item.id)}>
                    {s(item.id).slice(0, 8)} · {label(item.status)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Renewal due
              <input
                className="input"
                type="date"
                value={renewal.renewal_due_on}
                onChange={(e) =>
                  setRenewal({ ...renewal, renewal_due_on: e.target.value })
                }
                required
              />
            </label>
            <div className="form-grid two-col">
              <label>
                Expected amount
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={renewal.expected_amount}
                  onChange={(e) =>
                    setRenewal({
                      ...renewal,
                      expected_amount: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Likelihood %
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="100"
                  value={renewal.likelihood}
                  onChange={(e) =>
                    setRenewal({
                      ...renewal,
                      likelihood: Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
            <label>
              Offer notes
              <textarea
                className="input"
                value={renewal.offer_notes}
                onChange={(e) =>
                  setRenewal({ ...renewal, offer_notes: e.target.value })
                }
              />
            </label>
            <button className="primary-btn" disabled={busy}>
              Save renewal work
            </button>
          </form>
          <form
            className="panel compact-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void run(
                () =>
                  teacherStudioRecordRenewalActivity(
                    academyId,
                    renewalActivity,
                  ),
                "Renewal activity recorded.",
              );
            }}
          >
            <h3>Record renewal contact</h3>
            <label>
              Opportunity
              <select
                className="input"
                value={renewalActivity.opportunity_id}
                onChange={(e) =>
                  setRenewalActivity({
                    ...renewalActivity,
                    opportunity_id: e.target.value,
                  })
                }
              >
                {data.renewals.map((item) => (
                  <option key={s(item.id)} value={s(item.id)}>
                    {contactById.get(s(item.contact_id))} ·{" "}
                    {s(item.renewal_due_on)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Activity
              <select
                className="input"
                value={renewalActivity.activity_type}
                onChange={(e) =>
                  setRenewalActivity({
                    ...renewalActivity,
                    activity_type: e.target.value,
                  })
                }
              >
                {[
                  "call",
                  "telegram",
                  "meeting",
                  "offer",
                  "follow_up",
                  "status_change",
                  "note",
                ].map((value) => (
                  <option key={value}>{label(value)}</option>
                ))}
              </select>
            </label>
            <label>
              Note
              <textarea
                className="input"
                value={renewalActivity.note}
                onChange={(e) =>
                  setRenewalActivity({
                    ...renewalActivity,
                    note: e.target.value,
                  })
                }
                required
              />
            </label>
            <button className="primary-btn" disabled={busy}>
              Record renewal contact
            </button>
          </form>
          <section className="panel commercial-span">
            <h3>Renewal pipeline and outcome history</h3>
            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Learner</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th>Likelihood</th>
                    <th>Expected</th>
                    <th>Next action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.renewals.map((item) => (
                    <tr key={s(item.id)}>
                      <td>{contactById.get(s(item.contact_id))}</td>
                      <td>{s(item.renewal_due_on)}</td>
                      <td>{label(item.status)}</td>
                      <td>{s(item.likelihood)}%</td>
                      <td>{money(item.expected_amount, s(item.currency))}</td>
                      <td>
                        {item.next_action_at
                          ? formatDate(s(item.next_action_at))
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
      {tab === "actions" ? (
        <section className="panel">
          <h3>Unified SLA-aware action queue</h3>
          <div className="finance-table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Category</th>
                  <th>Action</th>
                  <th>Learner</th>
                  <th>Assignee</th>
                  <th>SLA</th>
                  <th>Status</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {data.actions.map((item) => (
                  <tr key={s(item.id)}>
                    <td>{label(item.priority)}</td>
                    <td>{label(item.category)}</td>
                    <td>
                      <strong>{s(item.title)}</strong>
                      <br />
                      <span>{s(item.recommended_action)}</span>
                    </td>
                    <td>{contactById.get(s(item.contact_id)) ?? "—"}</td>
                    <td>{s(item.assigned_to || "unassigned")}</td>
                    <td>
                      {item.sla_due_at ? formatDate(s(item.sla_due_at)) : "—"}
                    </td>
                    <td>{label(item.status)}</td>
                    <td>
                      {item.status === "open" ? (
                        <button
                          className="small-btn"
                          onClick={() =>
                            void run(
                              () =>
                                teacherStudioUpdateOperationalAction(
                                  academyId,
                                  {
                                    id: item.id,
                                    status: "resolved",
                                    outcome: "completed",
                                    resolution_note:
                                      "Completed in unified queue",
                                  },
                                ),
                              "Action completed with outcome evidence.",
                            )
                          }
                        >
                          <CheckCircle2 size={14} /> Complete
                        </button>
                      ) : (
                        s(item.outcome || "—")
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {tab === "search" ? (
        <div className="commercial-grid">
          <form
            className="panel compact-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              setBusy(true);
              void teacherStudioGlobalSearch(academyId, query)
                .then((result) => setSearchResults(result.results))
                .catch((next) =>
                  setError(
                    next instanceof Error ? next.message : "Search failed.",
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            <h3>Permission-filtered global search</h3>
            <label>
              Search contacts, classrooms, leads, and guardians
              <input
                className="input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                minLength={2}
                required
              />
            </label>
            <button className="primary-btn" disabled={busy}>
              <Search size={16} /> Search
            </button>
          </form>
          <section className="panel commercial-span">
            <h3>Search results</h3>
            <div className="record-list">
              {searchResults.map((item) => (
                <article key={`${s(item.result_type)}:${s(item.result_id)}`}>
                  <div>
                    <strong>
                      {label(item.result_type)} · {s(item.label)}
                    </strong>
                    <p>{s(item.context)}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}
      {tab === "imports" ? (
        <div className="commercial-grid">
          <form
            className="panel compact-form commercial-span"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void run(
                stageImport,
                "Import staged and validated; no records committed yet.",
              );
            }}
          >
            <div className="section-heading">
              <div>
                <h3>Governed CSV/XLSX migration</h3>
                <p>
                  Load a file, map its source columns, inspect the preview, then
                  run server-side validation before any commit.
                </p>
              </div>
            </div>
            <div className="form-grid two-col">
              <label>
                Import type
                <select
                  className="input"
                  value={importForm.import_type}
                  onChange={(event) => {
                    const import_type = event.target.value;
                    setImportForm({ ...importForm, import_type });
                    setColumnMapping(autoMapping(importHeaders, import_type));
                  }}
                >
                  {Object.keys(importFields).map((value) => (
                    <option key={value} value={value}>
                      {label(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Duplicate handling
                <select
                  className="input"
                  value={importForm.duplicate_strategy}
                  onChange={(event) =>
                    setImportForm({
                      ...importForm,
                      duplicate_strategy: event.target.value,
                    })
                  }
                >
                  <option value="reject">Reject duplicates</option>
                  <option value="skip">Skip duplicates</option>
                  <option value="update_safe_fields">Update safe fields</option>
                </select>
              </label>
              <label>
                CSV or XLSX file
                <input
                  className="input"
                  type="file"
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file)
                      void loadImportFile(file).catch((next) =>
                        setError(
                          next instanceof Error
                            ? next.message
                            : "Unable to read import file.",
                        ),
                      );
                  }}
                />
              </label>
              <label>
                Source filename
                <input
                  className="input"
                  value={importForm.source_filename}
                  onChange={(event) =>
                    setImportForm({
                      ...importForm,
                      source_filename: event.target.value,
                    })
                  }
                />
              </label>
            </div>
            <details>
              <summary>Or paste CSV data</summary>
              <label>
                CSV data
                <textarea
                  className="input"
                  rows={6}
                  value={importForm.csv}
                  onChange={(event) =>
                    setImportForm({ ...importForm, csv: event.target.value })
                  }
                />
              </label>
              <button
                className="small-btn"
                type="button"
                onClick={() => {
                  try {
                    loadPastedCsv();
                    setError("");
                  } catch (next) {
                    setError(
                      next instanceof Error
                        ? next.message
                        : "Unable to parse CSV.",
                    );
                  }
                }}
              >
                Load pasted CSV
              </button>
            </details>
            {importHeaders.length ? (
              <>
                <h4>Column mapping</h4>
                <div className="import-mapping-grid">
                  {(importFields[importForm.import_type] ?? []).map((field) => (
                    <label key={field.key}>
                      {label(field.key)}
                      {field.required ? " *" : ""}
                      <select
                        className="input"
                        value={columnMapping[field.key] ?? ""}
                        onChange={(event) =>
                          setColumnMapping({
                            ...columnMapping,
                            [field.key]: event.target.value,
                          })
                        }
                      >
                        <option value="">Ignore / not provided</option>
                        {importHeaders.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <p className="muted-copy">
                  {importRows.length} rows loaded. Required mappings are marked
                  with *.
                </p>
              </>
            ) : null}
            {importRows.length ? (
              <div className="finance-table-wrap">
                <table className="finance-table">
                  <caption>Source preview — first five rows</caption>
                  <thead>
                    <tr>
                      {importHeaders.map((header) => (
                        <th key={header}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.slice(0, 5).map((row, index) => (
                      <tr key={index}>
                        {importHeaders.map((header) => (
                          <td key={header}>{s(row[header])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <button
              className="primary-btn"
              disabled={busy || !importRows.length}
            >
              <FileSpreadsheet size={16} /> Stage dry run and validate
            </button>
          </form>
          <section className="panel commercial-span">
            <h3>Audited import jobs</h3>
            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Valid</th>
                    <th>Invalid</th>
                    <th>Committed</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.import_jobs.map((item) => (
                    <tr key={s(item.id)}>
                      <td>{s(item.source_filename)}</td>
                      <td>{label(item.import_type)}</td>
                      <td>{label(item.status)}</td>
                      <td>{n(item.total_rows)}</td>
                      <td>{n(item.valid_rows)}</td>
                      <td>{n(item.invalid_rows)}</td>
                      <td>{n(item.committed_rows)}</td>
                      <td>
                        <div className="inline-actions">
                          {item.status === "ready" ? (
                            <button
                              className="small-btn"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  () =>
                                    teacherStudioCommitImportJob(academyId, {
                                      import_job_id: item.id,
                                      confirm_commit: true,
                                    }),
                                  "Validated import committed with row-level evidence.",
                                )
                              }
                            >
                              Commit valid rows
                            </button>
                          ) : null}
                          {["available", "partial", "manual_required"].includes(
                            s(item.rollback_status),
                          ) ? (
                            <button
                              className="small-btn danger"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  () =>
                                    teacherStudioRollbackImportJob(academyId, {
                                      import_job_id: item.id,
                                      reason:
                                        "Operator-requested rollback from import workspace",
                                    }),
                                  "Import rollback processed with per-effect evidence.",
                                )
                              }
                            >
                              Rollback
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel commercial-span">
            <h3>Row validation evidence</h3>
            <div className="record-list">
              {data.import_rows
                .filter(
                  (item) =>
                    !selectedImport || s(item.import_job_id) === selectedImport,
                )
                .map((item) => (
                  <article key={s(item.id)}>
                    <div>
                      <strong>
                        Row {s(item.row_number)} ·{" "}
                        {label(item.validation_status)}
                      </strong>
                      <p>{JSON.stringify(item.validation_errors)}</p>
                    </div>
                    <span>{s(item.target_id || "not committed")}</span>
                  </article>
                ))}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
