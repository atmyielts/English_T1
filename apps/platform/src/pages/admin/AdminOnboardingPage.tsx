import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy as CopyIcon,
  Eye,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { useAdminPermission } from "../../components/platform/adminAccess";
import { GuideQuestion, StudyRoute } from "../../components/guide/GuideJourney";
import {
  GuideMatchCard,
  GuideSignals,
} from "../../components/guide/GuideMatchCard";
import { guideRequest } from "../../lib/guideClient";
import {
  type Answers,
  type Catalog,
  changeAnswer,
  checkBank,
  type CheckQuestion,
  type Condition,
  type Copy,
  copy,
  destinations,
  emptyCondition,
  type GuideFlow,
  type Locale,
  locales,
  type MatchResult,
  nextQuestion,
  type OfferRule,
  type Predicate,
  type Question,
  type Signal,
  validateFlow,
  type Validation,
} from "../../../../../supabase/functions/_shared/guide";
import "./onboarding.css";

type Version = {
  id: string;
  number: number;
  revision: number;
  config: GuideFlow;
  published_at: string | null;
};
type Release = {
  version_id: string | null;
  enabled: boolean;
  revision: number;
};
type Overview = { versions: Version[]; release: Release; catalog: Catalog };
type Tab =
  | "Questions"
  | "Branches"
  | "Skill checks"
  | "Recommendations"
  | "Appearance"
  | "Preview"
  | "Results";
type Metric = {
  event: string;
  version_id: string;
  audience: string | null;
  locale: string;
  campaign: string;
  question_id: string | null;
  offer_id: string | null;
  count: number;
};
const newId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
const blank = (): Copy => copy("", "", "");
function Localized(
  { label, value, onChange }: {
    label: string;
    value: Copy;
    onChange: (value: Copy) => void;
  },
) {
  return (
    <fieldset className="onboarding-translations">
      <legend>{label}</legend>
      {locales.map((locale) => (
        <label key={locale}>
          <span>{locale.toUpperCase()}</span>
          <textarea
            value={value?.[locale] ?? ""}
            maxLength={4000}
            rows={2}
            onChange={(e) => onChange({ ...value, [locale]: e.target.value })}
          />
        </label>
      ))}
    </fieldset>
  );
}
function OptionsEditor(
  { options, onChange }: {
    options: Question["options"];
    onChange: (options: Question["options"]) => void;
  },
) {
  return (
    <div className="onboarding-options-editor">
      {options.map((option, index) => (
        <div className="onboarding-option-editor" key={option.id}>
          <div className="onboarding-row">
            <code>{option.id}</code>
            <button
              type="button"
              onClick={() =>
                onChange(options.filter((_, i) =>
                  i !== index
                ))}
              aria-label={`Remove option ${index + 1}`}
            >
              <Trash2 size={16} />
            </button>
          </div>
          <Localized
            label={`Answer ${index + 1}`}
            value={option.label}
            onChange={(label) =>
              onChange(
                options.map((o, i) => i === index ? { ...o, label } : o),
              )}
          />
          <Localized
            label="Optional description (fill all languages or leave all empty)"
            value={option.detail ?? blank()}
            onChange={(detail) =>
              onChange(options.map((o, i) =>
                i === index
                  ? {
                    ...o,
                    detail: Object.values(detail).some((v) => v.trim())
                      ? detail
                      : undefined,
                  }
                  : o
              ))}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([...options, { id: newId("answer"), label: blank() }])}
        disabled={options.length >= 12}
      >
        <Plus size={16} /> Add answer
      </button>
    </div>
  );
}
function Conditions(
  { value, questions, signals = false, onChange }: {
    value: Condition;
    questions: Question[];
    signals?: boolean;
    onChange: (condition: Condition) => void;
  },
) {
  const selectable = [
    ...questions,
    ...(signals
      ? ["reading", "grammar", "listening", "math"].map(
        (skill) => ({
          id: `signal_${skill}`,
          title: copy(
            `${skill} sampled accuracy (0–1, at least two answered)`,
            "",
            "",
          ),
          kind: "number",
          min: 0,
          max: 1,
          options: [],
        } as unknown as Question),
      )
      : []),
  ];
  const newPredicate = (): Predicate => {
    const q = selectable[0];
    return {
      question: q?.id ?? "",
      op: q?.kind === "multi" ? "has" : "is",
      value: q?.options?.[0]?.id ?? 0,
    };
  };
  const change = (group: number, index: number, predicate: Predicate) =>
    onChange({
      any: value.any.map((g, i) =>
        i === group
          ? { all: g.all.map((p, j) => j === index ? predicate : p) }
          : g
      ),
    });
  return (
    <div className="onboarding-conditions">
      <p>
        {value.any.length
          ? "Show when any group below matches. Every condition within a group must match."
          : "Always eligible. Add a condition to narrow this down."}
      </p>
      {value.any.map((group, gi) => (
        <fieldset key={gi}>
          <legend>Group {gi + 1}{gi ? " · OR" : ""}</legend>
          {group.all.map((p, pi) => {
            const q = selectable.find((q) => q.id === p.question);
            return (
              <div className="onboarding-condition" key={pi}>
                <select
                  aria-label="Question to compare"
                  value={p.question}
                  onChange={(e) => {
                    const selected = selectable.find((q) =>
                      q.id === e.target.value
                    );
                    change(gi, pi, {
                      question: e.target.value,
                      op: selected?.kind === "multi" ? "has" : "is",
                      value: selected?.options?.[0]?.id ?? 0,
                    });
                  }}
                >
                  <option value="">Choose question</option>
                  {selectable.map((q) => (
                    <option value={q.id} key={q.id}>
                      {q.title.en || q.id}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Comparison"
                  value={p.op}
                  onChange={(e) =>
                    change(gi, pi, {
                      ...p,
                      op: e.target.value as Predicate["op"],
                    })}
                >
                  {(q?.kind === "multi"
                    ? ["has", "not"]
                    : q?.kind === "number" || q?.kind === "date"
                    ? ["is", "not", "gte", "lte"]
                    : ["is", "not"]).map((op) => (
                      <option key={op} value={op}>
                        {{
                          is: "is",
                          not: "is not",
                          has: "includes",
                          gte: "at least / on or after",
                          lte: "at most / on or before",
                        }[op]}
                      </option>
                    ))}
                </select>
                {q?.options?.length
                  ? (
                    <select
                      aria-label="Answer to compare"
                      value={String(p.value)}
                      onChange={(e) =>
                        change(gi, pi, { ...p, value: e.target.value })}
                    >
                      {q.options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label.en || o.id}
                        </option>
                      ))}
                    </select>
                  )
                  : (
                    <input
                      aria-label="Value to compare"
                      type={q?.kind === "date" ? "date" : "number"}
                      value={p.value}
                      step="any"
                      onChange={(e) =>
                        change(gi, pi, {
                          ...p,
                          value: q?.kind === "date"
                            ? e.target.value
                            : Number(e.target.value),
                        })}
                    />
                  )}
                <button
                  type="button"
                  aria-label="Remove condition"
                  onClick={() =>
                    onChange({
                      any: value.any.map((g, i) =>
                        i === gi ? { all: g.all.filter((_, j) => j !== pi) } : g
                      )
                        .filter((g) => g.all.length),
                    })}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() =>
              onChange({
                any: value.any.map((g, i) =>
                  i === gi ? { all: [...g.all, newPredicate()] } : g
                ),
              })}
          >
            + AND condition
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={!selectable.length}
        onClick={() =>
          onChange({ any: [...value.any, { all: [newPredicate()] }] })}
      >
        + {value.any.length ? "OR group" : "Condition"}
      </button>
    </div>
  );
}

export function AdminOnboardingPage() {
  const publishAllowed = useAdminPermission("admin.settings.manage");
  const analyticsAllowed = useAdminPermission("admin.analytics.view");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [selected, setSelected] = useState<Version | null>(null);
  const [flow, setFlow] = useState<GuideFlow | null>(null);
  const [tab, setTab] = useState<Tab>("Questions");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [offerIndex, setOfferIndex] = useState(0);
  const [checkIndex, setCheckIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [validation, setValidation] = useState<Validation | null>(null);
  const [previewAnswers, setPreviewAnswers] = useState<Answers>({});
  const [previewChecks, setPreviewChecks] = useState<
    Record<string, string | null>
  >({});
  const [previewOwned, setPreviewOwned] = useState<string[]>([]);
  const [previewLocale, setPreviewLocale] = useState<Locale>("en");
  const [previewMobile, setPreviewMobile] = useState(false);
  const [previewResult, setPreviewResult] = useState<
    { result: MatchResult; signals: Signal[] } | null
  >(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [funnel, setFunnel] = useState<Metric[]>([]);
  const [metricVersion, setMetricVersion] = useState("");
  const [metricAudience, setMetricAudience] = useState("");
  const [metricLocale, setMetricLocale] = useState("");
  const [metricCampaign, setMetricCampaign] = useState("");
  const [truncated, setTruncated] = useState(false);
  const load = useCallback(async (preferred?: string) => {
    const data = await guideRequest<Overview>("/admin/list");
    setOverview(data);
    const v = data.versions.find((v) => v.id === preferred) ??
      data.versions[0] ?? null;
    setSelected(v);
    setFlow(v?.config ?? null);
    setDirty(false);
    setValidation(null);
    setPreviewAnswers({});
    setPreviewChecks({});
    setPreviewOwned([]);
    setPreviewResult(null);
  }, []);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : "Could not complete the request. Retry.",
      );
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void run(async () => load());
  }, [load]);
  useEffect(() => {
    const listener = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [dirty]);
  const update = (next: GuideFlow) => {
    setFlow(next);
    setDirty(true);
    setValidation(null);
    setPreviewResult(null);
  };
  const q = flow?.questions[questionIndex];
  const offer = flow?.offers[offerIndex];
  const check = flow?.checks[checkIndex];
  const editQuestion = (patch: Partial<Question>) => {
    if (flow) {
      update({
        ...flow,
        questions: flow.questions.map((q, i) =>
          i === questionIndex ? { ...q, ...patch } : q
        ),
      });
    }
  };
  const editOffer = (patch: Partial<OfferRule>) => {
    if (flow) {
      update({
        ...flow,
        offers: flow.offers.map((r, i) =>
          i === offerIndex ? { ...r, ...patch } : r
        ),
      });
    }
  };
  const editCheck = (patch: Partial<CheckQuestion>) => {
    if (flow) {
      update({
        ...flow,
        checks: flow.checks.map((r, i) =>
          i === checkIndex ? { ...r, ...patch } : r
        ),
      });
    }
  };
  const editable = !!selected && !selected.published_at && !busy;
  const newDraft = (cloneId?: string) =>
    void run(async () => {
      if (dirty && !window.confirm("Discard unsaved changes?")) return;
      const response = await guideRequest<{ version: Version }>(
        "/admin/draft",
        {
          method: "POST",
          body: { cloneId },
        },
      );
      await load(response.version.id);
      setMessage("Draft created. It is not visible to visitors.");
    });
  const save = () =>
    void run(async () => {
      if (!selected || !flow) return;
      const response = await guideRequest<{ version: Version }>(
        "/admin/draft",
        {
          method: "PATCH",
          body: { id: selected.id, revision: selected.revision, config: flow },
        },
      );
      await load(response.version.id);
      setMessage("Draft saved. Publish when the checks pass.");
    });
  const validate = () =>
    void run(async () => {
      if (!flow) return;
      const response = await guideRequest<{ validation: Validation }>(
        "/admin/validate",
        {
          method: "POST",
          body: { config: flow },
        },
      );
      setValidation(response.validation);
    });
  const publish = () =>
    void run(async () => {
      if (!selected || !overview || dirty) return;
      if (
        !window.confirm(
          selected.published_at
            ? `Make version ${selected.number} live again? New visitors will use it.`
            : `Publish version ${selected.number}? New visitors will see this guide.`,
        )
      ) return;
      await guideRequest("/admin/publish", {
        method: "POST",
        body: {
          id: selected.id,
          revision: selected.revision,
          releaseRevision: overview.release.revision,
        },
      });
      await load(selected.id);
      setMessage("Published. Existing sessions keep their original version.");
    });
  const previewQuestion = flow ? nextQuestion(flow, previewAnswers) : undefined;
  const previewValidation = flow ? validateFlow(flow, overview?.catalog) : null;
  const metricMatches = (m: Metric) =>
    (!metricVersion || m.version_id === metricVersion) &&
    (!metricAudience || m.audience === metricAudience) &&
    (!metricLocale || m.locale === metricLocale) &&
    (!metricCampaign || m.campaign === metricCampaign);
  const filteredMetrics = metrics.filter(metricMatches);
  const stageCount = (event: string) =>
    funnel.filter(metricMatches).filter((m) => m.event === event).reduce(
      (sum, m) => sum + m.count,
      0,
    );
  const stepIds = [
    ...new Set(
      filteredMetrics.filter((m) => m.question_id).map((m) => m.question_id!),
    ),
  ];
  return (
    <AdminLayout>
      <div className="onboarding-admin">
        <div className="onboarding-title">
          <div>
            <p className="onboarding-kicker">Schood Guide</p>
            <h1>Onboarding control center</h1>
            <p>
              Questions, matching, and presentation. Your catalog still controls
              products and prices.
            </p>
          </div>
          <button disabled={busy} onClick={() => newDraft()}>
            <Plus size={16} />New starter draft
          </button>
        </div>
        {message && (
          <div className="onboarding-message" role="status">{message}</div>
        )}
        {overview && (
          <div className="onboarding-toolbar">
            <label>
              Version<select
                value={selected?.id ?? ""}
                disabled={busy}
                onChange={(e) => {
                  if (
                    dirty && !window.confirm("Discard unsaved changes?")
                  ) return;
                  const version = overview.versions.find((v) =>
                    v.id === e.target.value
                  );
                  if (version) {
                    setSelected(version);
                    setFlow(version.config);
                    setDirty(false);
                    setQuestionIndex(0);
                    setOfferIndex(0);
                    setCheckIndex(0);
                    setPreviewAnswers({});
                    setPreviewChecks({});
                    setPreviewOwned([]);
                    setPreviewResult(null);
                    setValidation(null);
                  }
                }}
              >
                {overview.versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.number} ·{" "}
                    {v.published_at ? "Published snapshot" : "Draft"}
                    {overview.release.version_id === v.id &&
                        overview.release.enabled
                      ? " · LIVE"
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <span className="onboarding-status">
              {dirty
                ? "Unsaved changes"
                : selected?.published_at
                ? "Read-only snapshot"
                : "Draft"} · Entry{" "}
              {overview.release.enabled ? "enabled" : "disabled"}
            </span>
            <button
              disabled={!selected || busy}
              onClick={() => newDraft(selected?.id)}
            >
              <CopyIcon size={15} />Clone
            </button>
            <button disabled={!editable || !dirty} onClick={save}>
              <Save size={15} />Save draft
            </button>
            <button disabled={!flow || busy} onClick={validate}>
              Validate
            </button>
            <button
              className="onboarding-publish"
              disabled={!publishAllowed || !selected || busy || dirty}
              onClick={publish}
            >
              {selected?.published_at ? "Restore this version" : "Publish"}
            </button>
            {publishAllowed && overview.release.enabled && (
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if (
                      !window.confirm(
                        "Hide the guide for new visitors? Existing sessions can finish.",
                      )
                    ) {
                      return;
                    }
                    await guideRequest("/admin/disable", {
                      method: "POST",
                      body: { revision: overview.release.revision },
                    });
                    await load(selected?.id);
                  })}
              >
                Disable entry
              </button>
            )}
          </div>
        )}
        {validation && (
          <section
            className={`onboarding-validation ${
              validation.errors.length ? "has-errors" : ""
            }`}
            role="status"
          >
            <strong>
              {validation.errors.length
                ? `${validation.errors.length} items to fix before publishing`
                : `Valid · ${validation.paths} paths · maximum ${validation.maxPath} questions`}
            </strong>
            {validation.errors.length > 0 && (
              <ul>
                {validation.errors.map((error, i) => <li key={i}>{error}</li>)}
              </ul>
            )}
          </section>
        )}
        {!flow
          ? (
            <p className="onboarding-empty">
              Create a starter draft to begin. Nothing becomes public until you
              publish it.
            </p>
          )
          : (
            <>
              <nav
                className="onboarding-tabs"
                aria-label="Onboarding editor sections"
              >
                {([
                  "Questions",
                  "Branches",
                  "Skill checks",
                  "Recommendations",
                  "Appearance",
                  "Preview",
                  "Results",
                ] as Tab[]).map((name) => (
                  <button
                    key={name}
                    aria-current={tab === name ? "page" : undefined}
                    onClick={() => {
                      setTab(name);
                      if (name === "Preview") {
                        setPreviewAnswers({});
                        setPreviewChecks({});
                        setPreviewOwned([]);
                        setPreviewResult(null);
                      }
                      if (name === "Results" && analyticsAllowed) {
                        void run(async () => {
                          const r = await guideRequest<
                            {
                              groups: Metric[];
                              funnel: Metric[];
                              truncated: boolean;
                            }
                          >(
                            "/admin/analytics",
                          );
                          setMetrics(r.groups);
                          setFunnel(r.funnel ?? []);
                          setTruncated(r.truncated);
                        });
                      }
                    }}
                  >
                    {name}
                  </button>
                ))}
              </nav>
              {["Questions", "Branches"].includes(tab) && (
                <div className="onboarding-editor-grid">
                  <aside className="onboarding-step-list">
                    {flow.questions.map((question, index) => (
                      <button
                        className={index === questionIndex ? "selected" : ""}
                        key={question.id}
                        onClick={() => setQuestionIndex(index)}
                      >
                        <small>{question.chapter}</small>
                        {question.title.en || "Untitled question"}
                      </button>
                    ))}
                    <button
                      disabled={!editable}
                      onClick={() => {
                        update({
                          ...flow,
                          questions: [...flow.questions, {
                            id: newId("question"),
                            title: blank(),
                            help: blank(),
                            kind: "single",
                            required: false,
                            chapter: "routine",
                            options: [{
                              id: "yes",
                              label: copy("Yes", "Ha", "Да"),
                            }, {
                              id: "no",
                              label: copy("No", "Yo‘q", "Нет"),
                            }],
                            when: emptyCondition(),
                          }],
                        });
                        setQuestionIndex(flow.questions.length);
                      }}
                    >
                      <Plus size={16} />Add question
                    </button>
                  </aside>
                  {q && (
                    <fieldset className="onboarding-panel" disabled={!editable}>
                      <div className="onboarding-row">
                        <code>{q.id}</code>
                        <div>
                          <button
                            type="button"
                            aria-label="Move question up"
                            disabled={questionIndex <= 1}
                            onClick={() => {
                              const questions = [...flow.questions];
                              [
                                questions[questionIndex - 1],
                                questions[questionIndex],
                              ] = [
                                questions[questionIndex],
                                questions[questionIndex - 1],
                              ];
                              update({ ...flow, questions });
                              setQuestionIndex(questionIndex - 1);
                            }}
                          >
                            <ArrowUp size={16} />
                          </button>
                          <button
                            type="button"
                            aria-label="Move question down"
                            disabled={questionIndex === 0 ||
                              questionIndex === flow.questions.length - 1}
                            onClick={() => {
                              const questions = [...flow.questions];
                              [
                                questions[questionIndex],
                                questions[questionIndex + 1],
                              ] = [
                                questions[questionIndex + 1],
                                questions[questionIndex],
                              ];
                              update({ ...flow, questions });
                              setQuestionIndex(questionIndex + 1);
                            }}
                          >
                            <ArrowDown size={16} />
                          </button>
                          <button
                            type="button"
                            aria-label="Delete question"
                            disabled={q.id === "audience"}
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Delete this question? Referencing conditions must be repaired before publishing.",
                                )
                              ) {
                                update({
                                  ...flow,
                                  questions: flow.questions.filter((_, i) =>
                                    i !== questionIndex
                                  ),
                                });
                                setQuestionIndex(
                                  Math.max(0, questionIndex - 1),
                                );
                              }
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      {tab === "Branches"
                        ? (
                          <>
                            <h2>When should this question appear?</h2>
                            <Conditions
                              value={q.when}
                              questions={flow.questions.slice(0, questionIndex)}
                              onChange={(when) => editQuestion({ when })}
                            />
                            <p className="onboarding-help">
                              Only earlier answers are available. This prevents
                              loops. Reordering may require updating conditions.
                            </p>
                          </>
                        )
                        : (
                          <>
                            <Localized
                              label="Question"
                              value={q.title}
                              onChange={(title) => editQuestion({ title })}
                            />
                            <Localized
                              label="Why we ask"
                              value={q.help}
                              onChange={(help) =>
                                editQuestion({ help })}
                            />
                            <div className="onboarding-fields">
                              <label>
                                Chapter<select
                                  value={q.chapter}
                                  onChange={(e) =>
                                    editQuestion({
                                      chapter: e.target
                                        .value as Question["chapter"],
                                    })}
                                >
                                  <option value="goal">Goal</option>
                                  <option value="starting">
                                    Starting point
                                  </option>
                                  <option value="routine">Routine</option>
                                </select>
                              </label>
                              <label>
                                Answer type<select
                                  value={q.kind}
                                  disabled={q.id === "audience"}
                                  onChange={(e) =>
                                    editQuestion({
                                      kind: e.target.value as Question["kind"],
                                      min: 0,
                                      max: 100,
                                      maxSelections: 2,
                                    })}
                                >
                                  <option value="single">One answer</option>
                                  <option value="multi">
                                    Multiple answers
                                  </option>
                                  <option value="number">Number</option>
                                  <option value="date">Date</option>
                                </select>
                              </label>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={q.required}
                                  disabled={q.id === "audience"}
                                  onChange={(e) =>
                                    editQuestion({
                                      required: e.target.checked,
                                    })}
                                />Required
                              </label>
                            </div>
                            {q.kind === "number" && (
                              <div className="onboarding-fields">
                                <label>
                                  Minimum<input
                                    type="number"
                                    value={q.min ?? 0}
                                    onChange={(e) =>
                                      editQuestion({
                                        min: Number(e.target.value),
                                      })}
                                  />
                                </label>
                                <label>
                                  Maximum<input
                                    type="number"
                                    value={q.max ?? 100}
                                    onChange={(e) =>
                                      editQuestion({
                                        max: Number(e.target.value),
                                      })}
                                  />
                                </label>
                              </div>
                            )}
                            {q.kind === "multi" && (
                              <label>
                                Maximum selections<input
                                  type="number"
                                  min={1}
                                  max={3}
                                  value={q.maxSelections ?? 2}
                                  onChange={(e) =>
                                    editQuestion({
                                      maxSelections: Number(e.target.value),
                                    })}
                                />
                              </label>
                            )}
                            {["single", "multi"].includes(q.kind) && (
                              <OptionsEditor
                                options={q.options}
                                onChange={(options) =>
                                  editQuestion({ options })}
                              />
                            )}
                            <label>
                              Use as a learner goal (optional)<select
                                value={q.goalField ?? ""}
                                onChange={(e) =>
                                  editQuestion({
                                    goalField: e.target.value
                                      ? e.target.value as Question["goalField"]
                                      : undefined,
                                  })}
                              >
                                <option value="">Do not transfer</option>
                                <option value="target_score">
                                  Target score
                                </option>
                                <option value="target_date">Target date</option>
                                <option value="daily_minutes">
                                  Daily study minutes
                                </option>
                              </select>
                            </label>
                          </>
                        )}
                    </fieldset>
                  )}
                </div>
              )}
              {tab === "Recommendations" && (
                <div className="onboarding-editor-grid">
                  <aside className="onboarding-step-list">
                    {flow.offers.map((r, i) => (
                      <button
                        className={i === offerIndex ? "selected" : ""}
                        key={r.id}
                        onClick={() => setOfferIndex(i)}
                      >
                        <small>
                          {r.enabled ? "Eligible" : "Excluded"} · priority{" "}
                          {r.priority}
                        </small>
                        {r.title.en || r.id}
                      </button>
                    ))}
                    <button
                      disabled={!editable}
                      onClick={() => {
                        update({
                          ...flow,
                          offers: [...flow.offers, {
                            id: newId("offer"),
                            enabled: false,
                            priority: 100,
                            when: emptyCondition(),
                            kind: "plan",
                            productId: "",
                            planId: "",
                            destination: "/contact",
                            title: blank(),
                            reasons: [blank(), blank(), blank()],
                            limitations: blank(),
                            action: blank(),
                          }],
                        });
                        setOfferIndex(flow.offers.length);
                      }}
                    >
                      <Plus size={16} />Add offer rule
                    </button>
                  </aside>
                  {offer && (
                    <fieldset className="onboarding-panel" disabled={!editable}>
                      <div className="onboarding-row">
                        <code>{offer.id}</code>
                        <button
                          type="button"
                          onClick={() => {
                            update({
                              ...flow,
                              offers: flow.offers.filter((_, i) =>
                                i !== offerIndex
                              ),
                            });
                            setOfferIndex(0);
                          }}
                        >
                          <Trash2 size={15} />Remove
                        </button>
                      </div>
                      <label>
                        <input
                          type="checkbox"
                          checked={offer.enabled}
                          onChange={(e) =>
                            editOffer({ enabled: e.target.checked })}
                        />Approved for onboarding
                      </label>
                      <div className="onboarding-fields">
                        <label>
                          Priority<input
                            type="number"
                            value={offer.priority}
                            onChange={(e) =>
                              editOffer({ priority: Number(e.target.value) })}
                          />
                        </label>
                        <label>
                          Action type<select
                            value={offer.kind}
                            onChange={(e) =>
                              editOffer({
                                kind: e.target.value as OfferRule["kind"],
                              })}
                          >
                            <option value="plan">
                              Existing paid/free plan
                            </option>
                            <option value="product">
                              Already-owned or explicitly free product
                            </option>
                            <option value="route">Existing workflow</option>
                          </select>
                        </label>
                      </div>
                      {offer.kind === "route"
                        ? (
                          <label>
                            Destination<select
                              value={offer.destination}
                              onChange={(e) =>
                                editOffer({
                                  destination: e.target
                                    .value as OfferRule["destination"],
                                })}
                            >
                              {destinations.map((d) => (
                                <option key={d}>{d}</option>
                              ))}
                            </select>
                          </label>
                        )
                        : (
                          <>
                            <label>
                              Catalog product<select
                                value={offer.productId}
                                onChange={(e) =>
                                  editOffer({
                                    productId: e.target.value,
                                    planId: "",
                                  })}
                              >
                                <option value="">
                                  Choose existing product
                                </option>
                                {overview?.catalog.products.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} · {p.status}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {offer.kind === "plan" && (
                              <label>
                                Catalog plan<select
                                  value={offer.planId}
                                  onChange={(e) =>
                                    editOffer({ planId: e.target.value })}
                                >
                                  <option value="">Choose existing plan</option>
                                  {overview?.catalog.plans.filter((p) =>
                                    p.product_id === offer.productId
                                  )
                                    .map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.name} · {p.amount} {p.currency} ·
                                        {" "}
                                        {p.is_active ? "active" : "inactive"}
                                      </option>
                                    ))}
                                </select>
                              </label>
                            )}
                            <p className="onboarding-help">
                              Prices, duration, limits, and bundle contents stay
                              in Products/Billing. Product-only rules require
                              existing access or the product’s explicit
                              free-access setting.
                            </p>
                          </>
                        )}
                      <Conditions
                        value={offer.when}
                        questions={flow.questions}
                        signals
                        onChange={(when) =>
                          editOffer({ when })}
                      />
                      <Localized
                        label="Rule label / workflow title (catalog names stay authoritative)"
                        value={offer.title}
                        onChange={(title) => editOffer({ title })}
                      />
                      {offer.reasons.map((reason, i) => (
                        <Localized
                          key={i}
                          label={`Why it fits · reason ${i + 1}`}
                          value={reason}
                          onChange={(value) =>
                            editOffer({
                              reasons: offer.reasons.map((r, j) =>
                                i === j ? value : r
                              ),
                            })}
                        />
                      ))}
                      <Localized
                        label="Limits and important exclusions"
                        value={offer.limitations}
                        onChange={(limitations) => editOffer({ limitations })}
                      />
                      <Localized
                        label="Action label"
                        value={offer.action}
                        onChange={(action) => editOffer({ action })}
                      />
                    </fieldset>
                  )}
                </div>
              )}
              {tab === "Skill checks" && (
                <div className="onboarding-editor-grid">
                  <aside className="onboarding-step-list">
                    {flow.checks.map((item, i) => (
                      <button
                        key={item.id}
                        className={checkIndex === i ? "selected" : ""}
                        onClick={() => setCheckIndex(i)}
                      >
                        <small>
                          {item.bank} · {item.skill} ·{" "}
                          {item.reviewed ? "Reviewed" : "Draft"}
                        </small>
                        {item.prompt.en || item.id}
                      </button>
                    ))}
                    <button
                      disabled={!editable}
                      onClick={() => {
                        update({
                          ...flow,
                          checks: [...flow.checks, {
                            id: newId("check"),
                            bank: "english",
                            skill: "reading",
                            prompt: blank(),
                            passage: "",
                            options: [{ id: "a", label: blank() }, {
                              id: "b",
                              label: blank(),
                            }],
                            correctOption: "a",
                            explanation: blank(),
                            reviewed: false,
                          }],
                        });
                        setCheckIndex(flow.checks.length);
                      }}
                    >
                      <Plus size={16} />Add check question
                    </button>
                  </aside>
                  {check
                    ? (
                      <fieldset
                        className="onboarding-panel"
                        disabled={!editable}
                      >
                        <div className="onboarding-row">
                          <code>{check.id}</code>
                          <button
                            onClick={() => {
                              update({
                                ...flow,
                                checks: flow.checks.filter((_, i) =>
                                  i !== checkIndex
                                ),
                              });
                              setCheckIndex(0);
                            }}
                          >
                            <Trash2 size={15} />Remove
                          </button>
                        </div>
                        <div className="onboarding-fields">
                          <label>
                            Bank<select
                              value={check.bank}
                              onChange={(e) =>
                                editCheck({
                                  bank: e.target.value as CheckQuestion["bank"],
                                })}
                            >
                              <option value="english">English</option>
                              <option value="sat">SAT</option>
                            </select>
                          </label>
                          <label>
                            Skill<select
                              value={check.skill}
                              onChange={(e) =>
                                editCheck({
                                  skill: e.target
                                    .value as CheckQuestion["skill"],
                                })}
                            >
                              {["reading", "grammar", "listening", "math"].map((
                                s,
                              ) => <option key={s}>{s}</option>)}
                            </select>
                          </label>
                        </div>
                        <Localized
                          label="Question instructions"
                          value={check.prompt}
                          onChange={(prompt) => editCheck({ prompt })}
                        />
                        <label>
                          English passage / question material<textarea
                            rows={6}
                            value={check.passage}
                            onChange={(e) =>
                              editCheck({ passage: e.target.value })}
                          />
                        </label>
                        {check.skill === "listening" && (
                          <label>
                            Approved audio URL (HTTPS on a Schood domain)<input
                              type="url"
                              value={check.audioUrl ?? ""}
                              onChange={(e) =>
                                editCheck({ audioUrl: e.target.value })}
                            />
                          </label>
                        )}
                        <OptionsEditor
                          options={check.options}
                          onChange={(options) => editCheck({ options })}
                        />
                        <label>
                          Correct answer (private)<select
                            value={check.correctOption ?? ""}
                            onChange={(e) =>
                              editCheck({ correctOption: e.target.value })}
                          >
                            <option value="">Choose answer</option>
                            {check.options.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.label.en || o.id}
                              </option>
                            ))}
                          </select>
                        </label>
                        <Localized
                          label="Explanation (private during the check)"
                          value={check.explanation ?? blank()}
                          onChange={(explanation) => editCheck({ explanation })}
                        />
                        <label>
                          <input
                            type="checkbox"
                            checked={check.reviewed}
                            onChange={(e) =>
                              editCheck({ reviewed: e.target.checked })}
                          />I have reviewed the question, correct answer,
                          explanation, and audio.
                        </label>
                      </fieldset>
                    )
                    : (
                      <div className="onboarding-panel">
                        <h2>No skill-check questions yet</h2>
                        <p>
                          Add reviewed questions before offering a check.
                          Unreviewed questions are never sent to learners.
                        </p>
                      </div>
                    )}
                </div>
              )}
              {tab === "Appearance" && (
                <fieldset className="onboarding-panel" disabled={!editable}>
                  <label>
                    Internal name<input
                      value={flow.name}
                      maxLength={120}
                      onChange={(e) =>
                        update({ ...flow, name: e.target.value })}
                    />
                  </label>
                  <Localized
                    label="Guide introduction"
                    value={flow.intro}
                    onChange={(intro) =>
                      update({ ...flow, intro })}
                  />
                  <div className="onboarding-fields">
                    <label>
                      Accent<select
                        value={flow.appearance.accent}
                        onChange={(e) =>
                          update({
                            ...flow,
                            appearance: {
                              ...flow.appearance,
                              accent: e.target.value as "teal" | "ink",
                            },
                          })}
                      >
                        <option value="teal">Teal / mint</option>
                        <option value="ink">Ink / apricot</option>
                      </select>
                    </label>
                    <label>
                      Illustration<select
                        value={flow.appearance.illustration}
                        onChange={(e) =>
                          update({
                            ...flow,
                            appearance: {
                              ...flow.appearance,
                              illustration: e.target
                                .value as GuideFlow["appearance"][
                                  "illustration"
                                ],
                            },
                          })}
                      >
                        <option value="route">Study route</option>
                        <option value="books">Books</option>
                        <option value="classroom">Classroom</option>
                      </select>
                    </label>
                    <label>
                      Motion<select
                        value={flow.appearance.motion}
                        onChange={(e) =>
                          update({
                            ...flow,
                            appearance: {
                              ...flow.appearance,
                              motion: e.target.value as "gentle" | "none",
                            },
                          })}
                      >
                        <option value="gentle">Gentle transitions</option>
                        <option value="none">No motion</option>
                      </select>
                    </label>
                  </div>
                  <h2>When no offer fits</h2>
                  <Localized
                    label="Fallback title"
                    value={flow.fallback.title}
                    onChange={(title) =>
                      update({
                        ...flow,
                        fallback: { ...flow.fallback, title },
                      })}
                  />
                  <Localized
                    label="Fallback explanation"
                    value={flow.fallback.body}
                    onChange={(body) =>
                      update({ ...flow, fallback: { ...flow.fallback, body } })}
                  />
                  <Localized
                    label="Fallback action"
                    value={flow.fallback.action}
                    onChange={(action) =>
                      update({
                        ...flow,
                        fallback: { ...flow.fallback, action },
                      })}
                  />
                  <label>
                    Fallback destination<select
                      value={flow.fallback.destination}
                      onChange={(e) =>
                        update({
                          ...flow,
                          fallback: {
                            ...flow.fallback,
                            destination: e.target
                              .value as GuideFlow["fallback"]["destination"],
                          },
                        })}
                    >
                      {destinations.map((d) => <option key={d}>{d}</option>)}
                    </select>
                  </label>
                </fieldset>
              )}
              {tab === "Preview" && (
                <section>
                  <div className="onboarding-toolbar">
                    <Eye size={18} />
                    <label>
                      Language<select
                        value={previewLocale}
                        onChange={(e) =>
                          setPreviewLocale(e.target.value as Locale)}
                      >
                        {locales.map((l) => <option key={l}>{l}</option>)}
                      </select>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={previewMobile}
                        onChange={(e) => setPreviewMobile(e.target.checked)}
                      />Mobile width
                    </label>
                    <button
                      onClick={() => {
                        setPreviewAnswers({});
                        setPreviewChecks({});
                        setPreviewOwned([]);
                        setPreviewResult(null);
                      }}
                    >
                      Restart preview
                    </button>
                    <span>Draft preview · no purchases or account changes</span>
                  </div>
                  {previewValidation?.errors.length
                    ? (
                      <div className="onboarding-validation has-errors">
                        <h2>Fix configuration before previewing</h2>
                        <ul>
                          {previewValidation.errors.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      </div>
                    )
                    : (
                      <div
                        className={`guide-preview ${
                          previewMobile ? "onboarding-mobile-preview" : ""
                        }`}
                        data-accent={flow.appearance.accent}
                        data-motion={flow.appearance.motion}
                      >
                        <div className="guide-layout">
                          <StudyRoute
                            flow={flow}
                            answers={previewAnswers}
                            locale={previewLocale}
                            chapter={previewQuestion?.chapter ?? "result"}
                            onEdit={(id) => {
                              const index = flow.questions.findIndex((q) =>
                                q.id === id
                              );
                              setPreviewAnswers(
                                Object.fromEntries(
                                  Object.entries(previewAnswers).filter((
                                    [key],
                                  ) =>
                                    flow.questions.findIndex((q) =>
                                      q.id === key
                                    ) < index
                                  ),
                                ),
                              );
                              setPreviewResult(null);
                            }}
                          />
                          {previewQuestion
                            ? (
                              <GuideQuestion
                                key={previewQuestion.id}
                                question={previewQuestion}
                                locale={previewLocale}
                                busy={false}
                                onAnswer={(value) =>
                                  setPreviewAnswers(
                                    changeAnswer(
                                      flow,
                                      previewAnswers,
                                      previewQuestion.id,
                                      value,
                                    ),
                                  )}
                              />
                            )
                            : (
                              <div className="guide-result">
                                <h1>Interview complete</h1>
                                <details className="onboarding-scenarios">
                                  <summary>
                                    Simulate check answers and existing access
                                  </summary>
                                  <fieldset>
                                    <legend>
                                      Products this learner already owns
                                    </legend>
                                    {overview?.catalog.products.map(
                                      (product) => (
                                        <label key={product.id}>
                                          <input
                                            type="checkbox"
                                            checked={previewOwned.includes(
                                              product.id,
                                            )}
                                            onChange={(event) => {
                                              setPreviewOwned(
                                                event.target.checked
                                                  ? [
                                                    ...previewOwned,
                                                    product.id,
                                                  ]
                                                  : previewOwned.filter((id) =>
                                                    id !== product.id
                                                  ),
                                              );
                                              setPreviewResult(null);
                                            }}
                                          />
                                          {product.name}
                                        </label>
                                      ),
                                    )}
                                  </fieldset>
                                  {flow.checks.filter((q) =>
                                    q.reviewed &&
                                    q.bank === checkBank(previewAnswers)
                                  ).map((q) => (
                                    <label key={q.id}>
                                      {q.prompt[previewLocale]}
                                      <select
                                        value={previewChecks[q.id] ?? ""}
                                        onChange={(event) => {
                                          setPreviewChecks({
                                            ...previewChecks,
                                            [q.id]: event.target.value || null,
                                          });
                                          setPreviewResult(null);
                                        }}
                                      >
                                        <option value="">
                                          Not answered / skipped
                                        </option>
                                        {q.options.map((option) => (
                                          <option
                                            key={option.id}
                                            value={option.id}
                                          >
                                            {option.label[previewLocale]}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  ))}
                                </details>
                                <button
                                  className="guide-primary"
                                  disabled={busy}
                                  onClick={() =>
                                    void run(async () => {
                                      const response = await guideRequest<
                                        {
                                          result: MatchResult;
                                          signals: Signal[];
                                        }
                                      >("/admin/preview", {
                                        method: "POST",
                                        body: {
                                          config: flow,
                                          answers: previewAnswers,
                                          checkAnswers: previewChecks,
                                          effectiveIds: previewOwned,
                                        },
                                      });
                                      setPreviewResult(response);
                                    })}
                                >
                                  Evaluate recommendation
                                </button>
                                {previewResult && (
                                  <>
                                    <GuideSignals
                                      signals={previewResult.signals}
                                      locale={previewLocale}
                                    />
                                    {previewResult.result.primary
                                      ? (
                                        <GuideMatchCard
                                          match={previewResult.result.primary}
                                          locale={previewLocale}
                                        />
                                      )
                                      : (
                                        <article className="guide-match">
                                          <h2>
                                            {flow.fallback.title[previewLocale]}
                                          </h2>
                                          <p>
                                            {flow.fallback.body[previewLocale]}
                                          </p>
                                          <p>{flow.fallback.destination}</p>
                                        </article>
                                      )}
                                    {previewResult.result.alternative && (
                                      <details className="guide-alternative">
                                        <summary>Alternative</summary>
                                        <GuideMatchCard
                                          match={previewResult.result
                                            .alternative}
                                          locale={previewLocale}
                                        />
                                      </details>
                                    )}
                                    <h2>Why each rule did or did not match</h2>
                                    <ul>
                                      {previewResult.result.trace.map((row) => (
                                        <li key={row.ruleId}>
                                          <strong>{row.ruleId}</strong>:{" "}
                                          {row.reason}
                                        </li>
                                      ))}
                                    </ul>
                                  </>
                                )}
                              </div>
                            )}
                        </div>
                      </div>
                    )}
                </section>
              )}
              {tab === "Results" && (
                <section className="onboarding-panel">
                  <h2>Last 30 days</h2>
                  <p>
                    Unique journeys in the last 30 days, grouped by their last
                    known audience and language within this window. Payment
                    counts require server-confirmed paid status. Destination
                    loaded means the application rendered, not that access or
                    learning succeeded.
                  </p>
                  {!analyticsAllowed
                    ? <p>Analytics permission is required.</p>
                    : (
                      <>
                        <div className="onboarding-fields">
                          <label>
                            Version<select
                              value={metricVersion}
                              onChange={(e) => setMetricVersion(e.target.value)}
                            >
                              <option value="">All</option>
                              {overview?.versions.map((v) => (
                                <option value={v.id} key={v.id}>
                                  v{v.number}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Audience<select
                              value={metricAudience}
                              onChange={(e) =>
                                setMetricAudience(e.target.value)}
                            >
                              <option value="">All</option>
                              {["learner", "parent", "teacher", "center"].map((
                                r,
                              ) => <option key={r}>{r}</option>)}
                            </select>
                          </label>
                          <label>
                            Language<select
                              value={metricLocale}
                              onChange={(e) => setMetricLocale(e.target.value)}
                            >
                              <option value="">All</option>
                              {locales.map((l) => <option key={l}>{l}</option>)}
                            </select>
                          </label>
                          <label>
                            Campaign<select
                              value={metricCampaign}
                              onChange={(e) =>
                                setMetricCampaign(e.target.value)}
                            >
                              <option value="">All</option>
                              {[...new Set(metrics.map((m) => m.campaign))].map(
                                (c) => <option key={c}>{c}</option>,
                              )}
                            </select>
                          </label>
                        </div>
                        {truncated && (
                          <p className="onboarding-validation">
                            High volume: showing the latest 10,000 events. These
                            are partial counts.
                          </p>
                        )}
                        <div className="onboarding-funnel">
                          {([
                            ["started", "Started"],
                            ["result", "Reached a recommendation"],
                            ["no_match", "Reached no-match fallback"],
                            ["claimed", "Saved to an account"],
                            ["checkout_started", "Chose checkout"],
                            ["destination_opened", "Destination loaded"],
                            ["paid", "Confirmed paid"],
                          ] as const).map(([event, label]) => (
                            <article key={event}>
                              <span>{label}</span>
                              <strong>{stageCount(event)}</strong>
                            </article>
                          ))}
                        </div>
                        <p>
                          These are parallel outcomes, not mandatory consecutive
                          steps. {stageCount("started") > 0 && !truncated
                            ? `${
                              Math.round(
                                stageCount("completed_from_starts") / stageCount("started") *
                                  100,
                              )
                            }% reached a recommendation in this window.`
                            : "Completion rates are hidden for partial or empty samples."}
                          {" "}
                          Blocked telemetry and journeys crossing the window
                          boundary can undercount stages.
                        </p>
                        <h3>Question completion</h3>
                        <div className="onboarding-table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>Question</th>
                                <th>Displayed</th>
                                <th>Answered / skipped</th>
                                <th>No answer recorded</th>
                              </tr>
                            </thead>
                            <tbody>
                              {stepIds.map((id) => {
                                const count = (event: string) =>
                                  filteredMetrics.filter((m) =>
                                    m.question_id === id && m.event === event
                                  ).reduce((sum, m) => sum + m.count, 0);
                                const seen = count("question_viewed");
                                const answered = count("answered");
                                return (
                                  <tr key={id}>
                                    <td>
                                      {flow.questions.find((q) => q.id === id)
                                        ?.title.en ?? id}
                                    </td>
                                    <td>{seen}</td>
                                    <td>{answered}</td>
                                    <td>{Math.max(0, seen - answered)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <p>
                          “No answer recorded” includes unfinished sessions; it
                          is not a proven permanent abandonment.
                        </p>
                        <h3>Event details</h3>
                        <div className="onboarding-table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>Event</th>
                                <th>Step / offer</th>
                                <th>Audience</th>
                                <th>Language</th>
                                <th>Campaign</th>
                                <th>Count</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredMetrics.map((m, i) => (
                                <tr key={i}>
                                  <td>{m.event}</td>
                                  <td>{m.question_id ?? m.offer_id ?? "—"}</td>
                                  <td>{m.audience ?? "Not selected"}</td>
                                  <td>{m.locale}</td>
                                  <td>{m.campaign}</td>
                                  <td>{m.count}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {!filteredMetrics.length && (
                            <p>No matching events yet.</p>
                          )}
                        </div>
                      </>
                    )}
                </section>
              )}
            </>
          )}
      </div>
    </AdminLayout>
  );
}
