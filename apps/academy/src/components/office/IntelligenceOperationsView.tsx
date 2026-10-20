import { getLocaleTag, translate } from '../../i18n';
import './IntelligenceOperationsView.css';
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
  actorId: string;
  formatDate: (value: string | null | undefined) => string;
};
type Tab =
  "dashboard" | "retention" | "renewals" | "actions" | "search" | "imports";
const s = (value: unknown) => String(value ?? "");
const n = (value: unknown) => Number(value ?? 0);
const label = (value: unknown) => translate(s(value).replaceAll("_", " "));
const importTypeLabel = (value: unknown) => translate(({
  contacts: 'Students and contacts', leads: 'Inquiries', guardians: 'Parents',
  staff: 'Staff', classrooms: 'Groups', balances: 'Starting balances',
  enrollments: 'Group enrollments', attendance: 'Attendance',
} as Record<string,string>)[s(value)] ?? 'Other records');
const importStatus = (value: unknown) => translate(({
  draft: 'Not checked', ready: 'Ready to save', committing: 'Saving',
  completed: 'Saved', failed: 'Needs review', pending: 'Not checked',
  valid: 'Ready to save', invalid: 'Needs changes', duplicate: 'Already exists', committed: 'Saved',
} as Record<string,string>)[s(value)] ?? 'Needs review');
const importIssues = (value: unknown) => Array.isArray(value)
  ? value.flatMap((item) => typeof item === 'string' ? [translate(item)] : []).join(' · ')
  : '';
const money = (value: unknown, currency = "UZS") =>
  `${new Intl.NumberFormat(getLocaleTag()).format(n(value))} ${currency}`;
import {normalizeImportCell,normalizeImportHeading as normalizeHeading,importRowsFromMatrix as rowsFromMatrix,parseImportCsv as parseCsv,mappedImportCell,type ImportCell,type ImportRow} from "../../lib/importFile";
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
const importCapabilities:Record<string,string>={contacts:'manageContacts',leads:'manageAdmissions',guardians:'manageGuardians',staff:'manageStaff',classrooms:'manageClassrooms',balances:'adjustFinance',enrollments:'manageRoster',attendance:'markAttendance'};
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
export function IntelligenceOperationsView({ academyId, actorId, formatDate }: Props) {
  const [data, setData] = useState<AcademyBusinessIntelligence | null>(null);
  const permittedImportTypes=useMemo(()=>{
    if(!data)return [];
    const permissions=data.access.permissions as unknown as Record<string,boolean>;
    const types=data.allowed_import_types??Object.keys(importFields).filter(type=>permissions.manageImports&&permissions[importCapabilities[type]]);
    return types.filter(type=>Object.hasOwn(importFields,type));
  },[data]);
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
  useEffect(()=>{
    if(permittedImportTypes.length&&!permittedImportTypes.includes(importForm.import_type)){
      const type=permittedImportTypes[0];
      setImportForm({...importForm,import_type:type});
      setColumnMapping(autoMapping(importHeaders,type));
      setSelectedImport('');
    }
  },[permittedImportTypes,importForm,importHeaders]);
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
  const run = async (work: () => Promise<unknown>, message: string | ((result: unknown) => string)) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await work();
      const partial = result && typeof result === 'object' && 'failed_rows' in result && n(result.failed_rows) > 0;
      const needsReview = result && typeof result === 'object' && 'manual_required' in result && n(result.manual_required) > 0;
      setNotice(partial ? 'Some rows could not be saved. Review the rows below.' : typeof message === 'function' ? message(result) : needsReview ? 'Some records need staff review before their changes can be undone.' : message);
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
      throw new Error("Choose an Excel or CSV file first.");
    if(!permittedImportTypes.includes(importForm.import_type)){setError(translate('Forbidden'));return;}
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
                ? mappedImportCell(raw[columnMapping[field.key]] ?? null, field.key)
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
    <section className="commercial-core intelligence-workspace">
      <div className="section-heading commercial-core__heading">
        <div>
          <span className="eyebrow">{translate("Keep students on track")}</span>
          <h2>{translate("Students and follow-ups")}</h2>
          <p>
            {translate("See who needs help, follow up on renewals, and keep track of tasks.")}{' '}</p>
        </div>
        <button
          className="ghost-btn"
          onClick={() => void load()}
          disabled={busy}
        >
          <RefreshCw size={16} /> {translate("Refresh")}{' '}</button>
      </div>
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
      <div className="commercial-core__stats">
        <article>
          <BarChart3 size={18} />
          <span>{translate("Active students")}</span>
          <strong>{n(owner.active_students)}</strong>
        </article>
        <article>
          <AlertTriangle size={18} />
          <span>{translate("Student alerts (30 days)")}</span>
          <strong>{n(owner.high_risk_evaluations)}</strong>
        </article>
        <article>
          <Target size={18} />
          <span>{translate("Follow-ups to do")}</span>
          <strong>{n(owner.open_interventions)}</strong>
        </article>
        <article>
          <UserRoundCheck size={18} />
          <span>{translate("Renewals to check")}</span>
          <strong>{n(owner.open_renewals)}</strong>
        </article>
      </div>
      <nav
        className="business-tabs"
        aria-label={translate("Intelligence operations sections")}
      >
        {(
          [
            ["dashboard", "Owner dashboard"],
            ["retention", "Retention"],
            ["renewals", "Renewals"],
            ["actions", "Tasks"],
            ["search", "Search"],
            ["imports", "Imports"],
          ] as Array<[Tab, string]>
        ).map(([id, text]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            className={tab === id ? "is-active" : ""}
            onClick={() => setTab(id)}
          >
            {translate(text)}
          </button>
        ))}
      </nav>
      {tab === "dashboard" ? (
        <div className="commercial-grid">
          <section className="panel">
            <h3>{translate("Commercial and service health")}</h3>
            <div className="record-list">
              <article>
                <strong>{translate("Collections")}</strong>
                <span>{money(owner.collected_amount)}</span>
              </article>
              <article>
                <strong>{translate("Outstanding debt")}</strong>
                <span>{money(owner.outstanding_debt)}</span>
              </article>
              <article>
                <strong>{translate("Admissions")}</strong>
                <span>
                  {n(owner.open_leads)} {translate("open leads ·")}{' '}{n(owner.conversions)}{" "}
                  {translate("conversions")}{' '}</span>
              </article>
              <article>
                <strong>{translate("Follow-up deadlines")}</strong>
                <span>
                  {n(owner.open_actions)} {translate("open ·")}{' '}{n(owner.overdue_actions)}{" "}
                  {translate("overdue")}{' '}</span>
              </article>
            </div>
          </section>
          <section className="panel commercial-span">
            <h3>{translate("Branch comparison")}</h3>
            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>{translate("Branch")}</th>
                    <th>{translate("Students")}</th>
                    <th>{translate("Subscriptions")}</th>
                    <th>{translate("Collected")}</th>
                    <th>{translate("Interventions")}</th>
                    <th>{translate("Actions")}</th>
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
                "Student alert rule saved.",
              );
            }}
          >
            <h3>{translate("When to flag a student")}</h3>
            <label>
              {translate("Definition key")}{' '}<input
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
              {translate("Name")}{' '}<input
                className="input"
                value={definition.name}
                onChange={(e) =>
                  setDefinition({ ...definition, name: e.target.value })
                }
              />
            </label>
            <label>
              {translate("Version")}{' '}<input
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
              {translate("Explanation")}{' '}<textarea
                className="input"
                value={definition.explanation}
                onChange={(e) =>
                  setDefinition({ ...definition, explanation: e.target.value })
                }
              />
            </label>
            <button className="primary-btn" disabled={busy}>
              {translate("Activate risk model")}{' '}</button>
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
            <h3>{translate("Evaluate learner")}</h3>
            <label>
              {translate("Learner")}{' '}<select
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
              {translate("Active definition")}{' '}<select
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
                      {s(item.name)} {translate("v")}{s(item.version)}
                    </option>
                  ))}
              </select>
            </label>
            <button className="primary-btn" disabled={busy}>
              {translate("Evaluate and explain")}{' '}</button>
          </form>
          <section className="panel commercial-span">
            <h3>{translate("Students who may need help")}</h3>
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
                    {translate("Plan follow-up")}{' '}</button>
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
                "Follow-up task created with a due date.",
              );
            }}
          >
            <h3>{translate("Add follow-up")}</h3>
            <label>
              {translate("Learner")}{' '}<select
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
              {translate("Risk evaluation")}{' '}<select
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
              {translate("Next follow-up")}{' '}<input
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
              {translate("Open case")}{' '}</button>
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
            <h3>{translate("Record intervention activity")}</h3>
            <label>
              {translate("Case")}{' '}<select
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
              {translate("Channel")}{' '}<select
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
                  <option key={value}>{importTypeLabel(value)}</option>
                ))}
              </select>
            </label>
            <label>
              {translate("Observation and agreed action")}{' '}<textarea
                className="input"
                value={activity.note}
                onChange={(e) =>
                  setActivity({ ...activity, note: e.target.value })
                }
                required
              />
            </label>
            <label>
              {translate("Next follow-up")}{' '}<input
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
              {translate("Record activity")}{' '}</button>
          </form>
          <section className="panel commercial-span">
            <h3>{translate("Follow-up results")}</h3>
            <div className="record-list">
              {data.interventions.map((item) => (
                <article key={s(item.id)}>
                  <div>
                    <strong>
                      {contactById.get(s(item.contact_id))} ·{" "}
                      {label(item.status)}
                    </strong>
                    <p>
                      {translate("Follow-up")}{" "}
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
                      {translate("Student is continuing")}{' '}</button>
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
            <h3>{translate("Create renewal opportunity")}</h3>
            <label>
              {translate("Learner")}{' '}<select
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
              {translate("Subscription")}{' '}<select
                className="input"
                value={renewal.subscription_id}
                onChange={(e) =>
                  setRenewal({ ...renewal, subscription_id: e.target.value })
                }
              >
                <option value="">{translate("No linked subscription")}</option>
                {data.subscriptions.map((item) => (
                  <option key={s(item.id)} value={s(item.id)}>
                    {s(item.id).slice(0, 8)} · {label(item.status)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {translate("Renewal due")}{' '}<input
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
                {translate("Expected amount")}{' '}<input
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
                {translate("Likelihood %")}{' '}<input
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
              {translate("Offer notes")}{' '}<textarea
                className="input"
                value={renewal.offer_notes}
                onChange={(e) =>
                  setRenewal({ ...renewal, offer_notes: e.target.value })
                }
              />
            </label>
            <button className="primary-btn" disabled={busy}>
              {translate("Save renewal work")}{' '}</button>
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
            <h3>{translate("Record renewal contact")}</h3>
            <label>
              {translate("Opportunity")}{' '}<select
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
              {translate("Activity")}{' '}<select
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
                  <option key={value}>{importTypeLabel(value)}</option>
                ))}
              </select>
            </label>
            <label>
              {translate("Note")}{' '}<textarea
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
              {translate("Record renewal contact")}{' '}</button>
          </form>
          <section className="panel commercial-span">
            <h3>{translate("Renewal pipeline and outcome history")}</h3>
            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>{translate("Learner")}</th>
                    <th>{translate("Due")}</th>
                    <th>{translate("Status")}</th>
                    <th>{translate("Likelihood")}</th>
                    <th>{translate("Expected")}</th>
                    <th>{translate("Next action")}</th>
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
          <h3>{translate("Tasks and deadlines")}</h3>
          <div className="finance-table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>{translate("Priority")}</th>
                  <th>{translate("Category")}</th>
                  <th>{translate("Action")}</th>
                  <th>{translate("Learner")}</th>
                  <th>{translate("Assignee")}</th>
                  <th>{translate("Due date")}</th>
                  <th>{translate("Status")}</th>
                  <th>{translate("Outcome")}</th>
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
                              "Task completed and result saved.",
                            )
                          }
                        >
                          <CheckCircle2 size={14} /> {translate("Complete")}{' '}</button>
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
            <h3>{translate("Permission-filtered global search")}</h3>
            <label>
              {translate("Search contacts, classrooms, leads, and guardians")}{' '}<input
                className="input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                minLength={2}
                required
              />
            </label>
            <button className="primary-btn" disabled={busy}>
              <Search size={16} /> {translate("Search")}{' '}</button>
          </form>
          <section className="panel commercial-span">
            <h3>{translate("Search results")}</h3>
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
                "Rows checked. Review the results below before saving.",
              );
            }}
          >
            <div className="section-heading">
              <div>
                <h3>{translate("Import from Excel or CSV")}</h3>
                <p>
                  {translate("Choose your file, match its columns, and check the rows before saving.")}{' '}</p>
              </div>
            </div>
            <div className="form-grid two-col">
              <label>
                {translate("Import type")}{' '}<select
                  className="input"
                  value={importForm.import_type}
                  onChange={(event) => {
                    const import_type = event.target.value;
                    setImportForm({ ...importForm, import_type });
                    setColumnMapping(autoMapping(importHeaders, import_type));
                  }}
                >
                  {permittedImportTypes.map((value) => (
                    <option key={value} value={value}>
                      {importTypeLabel(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {translate("If a record already exists")}{' '}<select
                  className="input"
                  value={importForm.duplicate_strategy}
                  onChange={(event) =>
                    setImportForm({
                      ...importForm,
                      duplicate_strategy: event.target.value,
                    })
                  }
                >
                  <option value="reject">{translate("Ask before adding existing records")}</option>
                  <option value="skip">{translate("Skip existing records")}</option>
                  <option value="update_safe_fields">{translate("Update existing details")}</option>
                </select>
              </label>
              <label>
                {translate("CSV or XLSX file")}{' '}<input
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
                {translate("File name")}{' '}<input
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
              <summary>{translate("Or paste CSV data")}</summary>
              <label>
                {translate("CSV data")}{' '}<textarea
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
                {translate("Load pasted CSV")}{' '}</button>
            </details>
            {importHeaders.length ? (
              <>
                <h4>{translate("Match columns")}</h4>
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
                        <option value="">{translate("Ignore / not provided")}</option>
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
                  {importRows.length} {translate("rows loaded. Match the fields marked with *.")}{' '}</p>
              </>
            ) : null}
            {importRows.length ? (
              <div className="finance-table-wrap">
                <table className="finance-table">
                  <caption>{translate("Source preview — first five rows")}</caption>
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
              <FileSpreadsheet size={16} /> {translate("Check rows")}{' '}</button>
          </form>
          <section className="panel commercial-span">
            <h3>{translate("Import history")}</h3>
            <div className="finance-table-wrap">
              <table className="finance-table intelligence-import-jobs">
                <thead>
                  <tr>
                    <th>{translate("File")}</th>
                    <th>{translate("Type")}</th>
                    <th>{translate("Status")}</th>
                    <th>{translate("Total")}</th>
                    <th>{translate("Valid")}</th>
                    <th>{translate("Invalid")}</th>
                    <th>{translate("Saved")}</th>
                    <th>{translate("Action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.import_jobs.map((item) => (
                    <tr key={s(item.id)}>
                      <td data-label={translate('File')}>{s(item.source_filename)}</td>
                      <td data-label={translate('Type')}>{importTypeLabel(item.import_type)}</td>
                      <td data-label={translate('Status')}>{importStatus(item.status)}</td>
                      <td data-label={translate('Total')}>{n(item.total_rows)}</td>
                      <td data-label={translate('Valid')}>{n(item.valid_rows)}</td>
                      <td data-label={translate('Invalid')}>{n(item.invalid_rows)}</td>
                      <td data-label={translate('Saved')}>{n(item.committed_rows)}</td>
                      <td data-label={translate('Action')}>
                        <div className="inline-actions">
                          {(item.status === "ready" || ['committing','failed'].includes(s(item.status))) && !['in_progress','partial','manual_required','completed'].includes(s(item.rollback_status)) ? (
                            <button
                              className="small-btn"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  () =>
                                    teacherStudioCommitImportJob(academyId, {
                                      import_job_id: item.id,
                                      confirm_commit: true,
                                    }, actorId),
                                  (result) => n((result as Record<string,unknown>)?.pending_rows) > 0
                                    ? translate('Import batch saved. Continue to import the remaining rows.')
                                    : n((result as Record<string,unknown>)?.failed_rows) > 0
                                      ? 'Valid rows were saved. Review the invalid rows before continuing.'
                                      : 'Import saved.',
                                )
                              }
                            >
                              {translate(item.status === 'committing' ? 'Continue import' : 'Save checked rows')}{' '}</button>
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
                                    }, actorId),
                                  (result) => n((result as Record<string,unknown>)?.recovery_pending) > 0
                                    ? translate('Recovery batch saved. Continue to recover the remaining rows.')
                                    : n((result as Record<string,unknown>)?.manual_required) > 0
                                      ? translate('Used or changed records were retained for review.')
                                      : 'Import changes undone. Check the updated results below.',
                                )
                              }
                            >
                              {translate("Undo import")}{' '}</button>
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
            <h3>{translate("Rows to review")}</h3>
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
                        {translate("Row")}{' '}{s(item.row_number)} ·{" "}
                        {importStatus(item.validation_status)}
                      </strong>
                      {importIssues(item.validation_errors) ? <p>{importIssues(item.validation_errors)}</p> : null}
                    </div>
                    <span>{translate(item.validation_status === 'committed' ? 'Saved' : 'Not saved')}</span>
                  </article>
                ))}
              {!data.import_rows.length ? <p className="muted-copy">{translate('Choose a file and check its rows to see the results here.')}</p> : null}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
