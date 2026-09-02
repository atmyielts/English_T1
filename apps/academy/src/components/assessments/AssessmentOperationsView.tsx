import { type FormEvent, type ReactNode, useState } from "react";
import { translate as t, useI18n } from "../../i18n";
import type {
  AssessmentCandidate,
  AssessmentRun,
  AssessmentWorkspace,
} from "../../lib/assessmentServices";
import type { AssessmentOperations } from "../../lib/assessmentOperations";
import { certificateUrl } from "../../lib/assessmentOperations";

type Command = (
  command: string,
  body: Record<string, unknown>,
  message: string,
) => Promise<boolean>;
type Common = { data: AssessmentWorkspace; busy: boolean; command: Command };
const values = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  return Object.fromEntries(
    new FormData(event.currentTarget).entries(),
  ) as Record<string, string>;
};
function Field({
  label,
  name,
  children,
  ...props
}: {
  label: string;
  name?: string;
  children?: ReactNode;
  type?: string;
  defaultValue?: string | number;
  min?: number;
  max?: number;
  required?: boolean;
  step?: number;
  maxLength?: number;
}) {
  return (
    <label>
      {t(label)}
      {children || <input className="input" name={name} {...props} />}
    </label>
  );
}
function Notes(
  { label = "Decision notes", name = "note", min = 10 }: {
    label?: string;
    name?: string;
    min?: number;
  },
) {
  return (
    <label>
      {t(label)}
      <textarea
        className="input"
        name={name}
        required
        minLength={min}
        maxLength={3000}
      />
    </label>
  );
}
function StaffSelect(
  { ops, name, label, initial }: {
    ops: AssessmentOperations;
    name: string;
    label: string;
    initial?: string;
  },
) {
  return (
    <Field label={label}>
      <select
        className="input"
        name={name}
        required
        defaultValue={initial || ops.current_user_id}
      >
        {ops.staff.map((s) => (
          <option key={s.user_id} value={s.user_id}>
            {s.display_name === "You" ? t("You") : s.display_name}
          </option>
        ))}
      </select>
    </Field>
  );
}
function Save(
  { busy, label = "Save changes" }: { busy: boolean; label?: string },
) {
  return <button className="primary-btn" disabled={busy}>{t(label)}</button>;
}
const Section = (
  { title, children }: { title: string; children: ReactNode },
) => (
  <details className="assessment-ops-section">
    <summary>{t(title)}</summary>
    <div className="assessment-ops-content">{children}</div>
  </details>
);

export function AssessmentPreparation({ data, busy, command }: Common) {
  useI18n();
  const [paperId, setPaperId] = useState("");
  const ops = data.operations;
  if (!ops) return null;
  const paper = data.papers.find((p) => p.id === paperId) || data.papers[0];
  const reviews = ops.reviews.filter((r) => r.paper_id === paper?.id).sort((
    a,
    b,
  ) => b.created_at.localeCompare(a.created_at));
  return (
    <section className="assessment-form assessment-operations">
      <header>
        <span className="assessment-eyebrow">
          {t("Before students arrive")}
        </span>
        <h3>{t("Papers and course guidance")}</h3>
      </header>
      <p>
        {t(
          "Start with the pilot paper, review every task, then decide how the evidence will guide placement. No automatic IELTS prediction is used.",
        )}
      </p>
      {data.permissions.create && (
        <button
          className="secondary-btn"
          disabled={busy}
          onClick={() =>
            void command(
              "starter_paper",
              {},
              "Pilot paper added. Review it before opening a session.",
            )}
        >
          {t("Add Schood starter paper")}
        </button>
      )}
      <p className="muted">
        {t(
          "The starter includes grammar, vocabulary, reading, teacher-read listening, writing and an interview. It has not been validated against CEFR or IELTS results.",
        )}
      </p>
      {paper && (
        <>
          <Field label="Assessment paper">
            <select
              className="input"
              value={paper.id}
              onChange={(e) => setPaperId(e.target.value)}
            >
              {data.papers.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </Field>
          <p className="assessment-caution">
            {t(
              reviews[0]?.decision === "pilot_ready"
                ? "Reviewed for pilot use"
                : "Teacher review needed before opening a session",
            )}
          </p>
          {data.permissions.review && (
            <Section title="Review paper and listening instructions">
              <div className="assessment-paper-preview">
                {paper.items.map((item, i) => (
                  <article key={item.id}>
                    <strong>{i + 1}. {t(item.skill)} · {item.prompt}</strong>
                    {item.passage && <p>{item.passage}</p>}
                    {item.listening_script &&
                      paper.items[i - 1]?.listening_script !==
                        item.listening_script &&
                      (
                        <blockquote>
                          <strong>{t("Teacher only — read aloud")}</strong>
                          <p>{item.listening_script}</p>
                        </blockquote>
                      )}
                    {item.options.length > 0 && (
                      <ol>
                        {item.options.map((o, j) => (
                          <li key={j}>{o}{j === item.correct ? " ✓" : ""}</li>
                        ))}
                      </ol>
                    )}
                    {item.rubric && <p>{item.rubric}</p>}
                  </article>
                ))}
              </div>
              <form
                className="assessment-form"
                onSubmit={(e) => {
                  const v = values(e);
                  void command(
                    "paper_review",
                    { ...v, paper_id: paper.id },
                    "Paper review saved.",
                  );
                }}
              >
                <Field label="Review decision">
                  <select className="input" name="decision">
                    <option value="pilot_ready">
                      {t("Ready for a supervised pilot")}
                    </option>
                    <option value="changes_needed">
                      {t("Needs changes — prepare a new paper")}
                    </option>
                  </select>
                </Field>
                <Notes
                  label="Coverage, answer checks, fairness and limitations"
                  name="evidence"
                  min={40}
                />
                <p className="muted">
                  {t(
                    "This approval records a content review. It is not scientific validation or permission to promise an IELTS result.",
                  )}
                </p>
                <Save busy={busy} label="Save paper review" />
              </form>
              {reviews.map((r) => (
                <p key={r.id}>
                  {new Date(r.created_at).toLocaleDateString()} · {t(
                    r.decision === "pilot_ready"
                      ? "Reviewed for pilot use"
                      : "Changes requested",
                  )} — {r.evidence}
                </p>
              ))}
            </Section>
          )}
          {data.permissions.review && (
            <Section title="Course suggestion rules">
              <p>
                {t(
                  "These are your center’s provisional course rules, not CEFR cut scores. A teacher must confirm the recommendation with the learner.",
                )}
              </p>
              {ops.rules.filter((r) =>
                r.paper_id === paper.id && r.status === "active"
              ).map((r) => (
                <article key={r.id}>
                  <strong>
                    {r.course_name} · {r.minimum_percent}–{r.maximum_percent}%
                  </strong>
                  <p>{r.evidence}</p>
                  <button
                    className="secondary-btn"
                    disabled={busy}
                    onClick={() =>
                      void command("retire_rule", {
                        paper_id: paper.id,
                        rule_id: r.id,
                      }, "Course rule retired.")}
                  >
                    {t("Retire rule")}
                  </button>
                </article>
              ))}
              <form
                className="assessment-form"
                onSubmit={(e) => {
                  const v = values(e);
                  const required_skills = paper.items.map((i) => i.skill)
                    .filter((s, i, a) => a.indexOf(s) === i).filter((s) =>
                      v[`skill_${s}`] !== ""
                    ).map((skill) => ({
                      skill,
                      minimum: Number(v[`skill_${skill}`]),
                    }));
                  void command("course_rule", {
                    ...v,
                    paper_id: paper.id,
                    required_skills,
                  }, "Course suggestion rule saved.");
                }}
              >
                <Field
                  label="Course name"
                  name="course_name"
                  required
                  maxLength={200}
                />
                <div className="assessment-form-grid">
                  <Field
                    label="Overall score from (%)"
                    name="minimum_percent"
                    type="number"
                    min={0}
                    max={100}
                    required
                  />
                  <Field
                    label="Overall score to (%)"
                    name="maximum_percent"
                    type="number"
                    min={0}
                    max={100}
                    required
                  />
                </div>
                <p>
                  {t(
                    "Optional minimum by skill. Leave blank if no minimum is required.",
                  )}
                </p>
                <div className="assessment-form-grid">
                  {[
                    ...new Set(paper.items.map((i) => i.skill)),
                  ].map((s) => (
                    <Field
                      key={s}
                      label={s}
                      name={`skill_${s}`}
                      type="number"
                      min={0}
                      max={100}
                    />
                  ))}
                </div>
                <Notes
                  label="Why this range suits the course; evidence and limitations"
                  name="evidence"
                  min={40}
                />
                <Save busy={busy} label="Save course rule" />
              </form>
            </Section>
          )}
        </>
      )}
    </section>
  );
}

export function ExamDesk(
  { data, run, candidate, busy, command }: Common & {
    run: AssessmentRun;
    candidate?: AssessmentCandidate;
  },
) {
  useI18n();
  const ops = data.operations;
  if (!ops) return null;
  const roster = data.candidates.filter((c) => c.run_id === run.id);
  const incidents = ops.incidents.filter((i) =>
    roster.some((c) => c.id === i.candidate_id)
  );
  const order = ops.orders.find((o) => o.run_id === run.id);
  return (
    <section className="assessment-form assessment-operations">
      <header>
        <span className="assessment-eyebrow">{t("Exam desk")}</span>
        <h3>{run.title}</h3>
      </header>
      <div className="assessment-desk-strip">
        <div>
          <strong>
            {roster.filter((c) => c.checked_in_at).length}/{roster.length}
          </strong>
          <span>{t("Checked in")}</span>
        </div>
        <div>
          <strong>
            {roster.filter((c) => c.status === "submitted").length}
          </strong>
          <span>{t("Awaiting marking")}</span>
        </div>
        <div>
          <strong>{incidents.filter((i) => i.status === "open").length}</strong>
          <span>{t("Open concerns")}</span>
        </div>
        <div>
          <strong>
            {roster.filter((c) => c.status === "released").length}
          </strong>
          <span>{t("Results shared")}</span>
        </div>
      </div>
      {data.permissions.run && run.status === "draft" && (
        <Section title="Session safeguards and teaching context">
          <form
            className="assessment-form"
            onSubmit={(e) => {
              const v = values(e);
              void command("run_settings", {
                ...v,
                run_id: run.id,
                require_check_in: v.require_check_in === "on",
                require_moderation: v.require_moderation === "on",
              }, "Session safeguards saved.");
            }}
          >
            <label className="assessment-check">
              <input
                type="checkbox"
                name="require_check_in"
                defaultChecked={run.require_check_in}
              />
              {t("Require check-in before students start")}
            </label>
            <label className="assessment-check">
              <input
                type="checkbox"
                name="require_moderation"
                defaultChecked={run.require_moderation}
              />
              {t("Require a second teacher to moderate results")}
            </label>
            <Field label="Teaching context (optional)">
              <select
                className="input"
                name="teaching_user_id"
                defaultValue={run.teaching_user_id || ""}
              >
                <option value="">{t("Not recorded")}</option>
                {ops.staff.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {s.display_name === "You" ? t("You") : s.display_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Expected group level (optional)">
              <select
                className="input"
                name="expected_level"
                defaultValue={run.expected_level || ""}
              >
                <option value="">{t("Not estimated")}</option>
                {["Pre-A1", "A1", "A2", "B1", "B2", "C1", "C2"].map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </Field>
            <p className="muted">
              {t(
                "Teaching context is recorded before the session. Comparisons describe results, not a teacher’s causal impact.",
              )}
            </p>
            <Save busy={busy} />
          </form>
        </Section>
      )}
      {data.permissions.run && (
        <Section title="Service coordination">
          <p>
            {t(
              "Record the agreed provider, coordinator and delivery date. Creating a request does not book Schood staff or charge anyone.",
            )}
          </p>
          {!order
            ? (
              <form
                className="assessment-form"
                onSubmit={(e) => {
                  const v = values(e);
                  void command(
                    "service_order",
                    { ...v, run_id: run.id },
                    "Service request recorded.",
                  );
                }}
              >
                <Notes label="What needs to be delivered?" name="brief" />
                <Field
                  label="Results due"
                  name="due_at"
                  type="datetime-local"
                  required
                />
                <Save busy={busy} label="Record service request" />
              </form>
            )
            : (
              <>
                <strong>
                  {t(
                    ({
                      requested: "Requested",
                      confirmed: "Confirmed",
                      in_progress: "In progress",
                      delivered: "Delivered",
                      cancelled: "Cancelled",
                    } as Record<string, string>)[order.status],
                  )}
                </strong>
                <p>{order.brief}</p>
                <p>
                  {t("Results due")}: {new Date(order.due_at).toLocaleString()}
                </p>
                {order.provider_name && (
                  <p>
                    {order.provider_name} ·{" "}
                    {order.agreed_amount.toLocaleString()} {t("UZS")}
                  </p>
                )}
                {order.delivery_note && <p>{order.delivery_note}</p>}
                {!["delivered", "cancelled"].includes(order.status) && (
                  <form
                    className="assessment-form"
                    onSubmit={(e) => {
                      const v = values(e);
                      void command(
                        "transition_order",
                        { ...v, run_id: run.id },
                        "Service request updated.",
                      );
                    }}
                  >
                    <Field label="Next step">
                      <select className="input" name="status">
                        {order.status === "requested"
                          ? (
                            <option value="confirmed">
                              {t("Confirm agreed service")}
                            </option>
                          )
                          : order.status === "confirmed"
                          ? (
                            <option value="in_progress">
                              {t("Start service")}
                            </option>
                          )
                          : (
                            <option value="delivered">
                              {t("Confirm delivery")}
                            </option>
                          )}
                        <option value="cancelled">{t("Cancel request")}</option>
                      </select>
                    </Field>
                    {order.status === "requested" && (
                      <>
                        <Field
                          label="Provider name"
                          name="provider_name"
                          required
                        />
                        <StaffSelect
                          ops={ops}
                          name="coordinator_id"
                          label="Responsible coordinator"
                        />
                        <Field
                          label="Agreed service price (UZS)"
                          name="agreed_amount"
                          type="number"
                          min={0}
                          max={1000000000}
                          required
                        />
                      </>
                    )}
                    <Notes min={order.status === "requested" ? 20 : 10} />
                    <Save busy={busy} />
                  </form>
                )}
              </>
            )}
        </Section>
      )}
      {!candidate && (
        <p className="muted">
          {t(
            "Select a candidate below to check them in, assign marking or record a concern.",
          )}
        </p>
      )}
      {candidate && (
        <CandidateDesk
          key={candidate.id}
          {...{ data, run, candidate, busy, command, ops }}
        />
      )}
    </section>
  );
}

function CandidateDesk(
  { data, run, candidate: c, busy, command, ops }: Common & {
    run: AssessmentRun;
    candidate: AssessmentCandidate;
    ops: AssessmentOperations;
  },
) {
  const [purchaseKey, setPurchaseKey] = useState(() => crypto.randomUUID());
  const [openedAt] = useState(() => Date.now());
  const cert = ops.certificates.find((cert) =>
    cert.candidate_id === c.id && cert.version === (c.report_version || 1)
  );
  const plans = ops.support.filter((p) => p.candidate_id === c.id);
  const person = data.contacts.find((person) => person.id === c.contact_id);
  return (
    <div className="assessment-candidate-desk">
      <h4>
        {person?.first_name} {person?.last_name} <code>{c.candidate_code}</code>
      </h4>
      {c.seat && (
        <p>
          {t("Seat")}: {c.seat} · {t("Extra minutes")}: {c.extra_minutes || 0}
        </p>
      )}
      {c.grader_id && (
        <p>
          {t("Assigned reviewer")}:{" "}
          {ops.staff.find((s) => s.user_id === c.grader_id)?.display_name ||
            t("Academy teacher")} ·{" "}
          {c.grading_due_at && new Date(c.grading_due_at).toLocaleString()}
        </p>
      )}
      {c.moderated_at && (
        <p>
          {t("Second review completed")} ·{" "}
          {new Date(c.moderated_at).toLocaleString()}
        </p>
      )}
      {data.permissions.run && c.status === "invited" && (
        <Section title="Check-in and accommodations">
          <form
            className="assessment-form"
            onSubmit={(e) => {
              const v = values(e);
              void command(
                "check_in",
                { ...v, candidate_id: c.id },
                "Candidate checked in.",
              );
            }}
          >
            <p>
              {t(
                "Confirm the candidate’s identity in person. Do not upload identity documents or medical information.",
              )}
            </p>
            <div className="assessment-form-grid">
              <Field
                label="Seat"
                name="seat"
                defaultValue={c.seat || ""}
                maxLength={40}
              />
              <Field
                label="Extra minutes"
                name="extra_minutes"
                type="number"
                min={0}
                max={120}
                defaultValue={c.extra_minutes || 0}
                required
              />
            </div>
            <Field
              label="Agreed accommodation (if needed)"
              name="note"
              defaultValue={c.accommodation_note || ""}
              maxLength={3000}
            />
            <p className="muted">
              {t(
                "Extra time must be agreed before starting and cannot extend beyond the session closing time.",
              )}
            </p>
            <Save busy={busy} label="Confirm check-in" />
          </form>
        </Section>
      )}
      {data.permissions.run && c.status !== "released" && (
        <Section title="Assign marking">
          <form
            className="assessment-form"
            onSubmit={(e) => {
              const v = values(e);
              void command(
                "assign_grader",
                { ...v, candidate_id: c.id },
                "Reviewer assigned.",
              );
            }}
          >
            <StaffSelect
              ops={ops}
              name="grader_id"
              label="Reviewer"
              initial={c.grader_id || undefined}
            />
            <Field
              label="Marking due"
              name="grading_due_at"
              type="datetime-local"
              required
            />
            <p className="muted">
              {t(
                "Only the assigned reviewer can save marks. The coordinator can reassign the work if needed.",
              )}
            </p>
            <Save busy={busy} label="Assign reviewer" />
          </form>
        </Section>
      )}
      {data.permissions.review && c.status === "reviewed" &&
        c.reviewed_by !== ops.current_user_id && (
        <Section title="Second teacher review">
          <form
            className="assessment-form"
            onSubmit={(e) => {
              const v = values(e);
              void command(
                "moderate",
                { ...v, candidate_id: c.id },
                "Second review recorded.",
              );
            }}
          >
            <p>
              {t(
                "Check the responses, marks and recommendation below. If anything needs changing, ask the assigned reviewer to correct it before you approve.",
              )}
            </p>
            <Notes label="Evidence checked and moderation decision" min={20} />
            <Save busy={busy} label="Approve second review" />
          </form>
        </Section>
      )}
      <Section title="Concerns and result reviews">
        <p>
          {t(
            "Record observations, not accusations. An integrity concern or result appeal prevents new publication until a teacher resolves it.",
          )}
        </p>
        {ops.incidents.filter((i) => i.candidate_id === c.id).map((i) => (
          <article className="assessment-question" key={i.id}>
            <strong>
              {t(
                ({
                  technical: "Technical issue",
                  wellbeing: "Student wellbeing",
                  integrity: "Integrity concern",
                  appeal: "Result review request",
                } as Record<string, string>)[i.kind],
              )} · {t(i.status === "open" ? "Open" : "Resolved")}
            </strong>
            <p>{i.note}</p>
            {i.status === "resolved"
              ? <p>{i.resolution}</p>
              : data.permissions.review && (
                <form
                  className="assessment-form"
                  onSubmit={(e) => {
                    const v = values(e);
                    void command("resolve_incident", {
                      ...v,
                      candidate_id: c.id,
                      incident_id: i.id,
                    }, "Concern resolved.");
                  }}
                >
                  <Notes label="What was checked and how was it resolved?" />
                  <Save busy={busy} label="Resolve concern" />
                </form>
              )}
          </article>
        ))}
        {(data.permissions.run || data.permissions.review) && (
          <form
            className="assessment-form"
            onSubmit={(e) => {
              const v = values(e);
              void command(
                "incident",
                { ...v, candidate_id: c.id },
                "Concern recorded.",
              );
            }}
          >
            <Field label="Type of concern">
              <select className="input" name="kind">
                <option value="technical">{t("Technical issue")}</option>
                <option value="wellbeing">{t("Student wellbeing")}</option>
                <option value="integrity">{t("Integrity concern")}</option>
                <option value="appeal">{t("Result review request")}</option>
              </select>
            </Field>
            <Notes label="What happened?" />
            <Save busy={busy} label="Record concern" />
          </form>
        )}
        {data.permissions.review && c.status === "released" && (
          <form
            className="assessment-form"
            onSubmit={(e) => {
              const v = values(e);
              if (
                window.confirm(
                  t("Reopen this report? Its certificate will be withdrawn and the previous report retained in history."),
                )
              ) {
                void command(
                  "reopen",
                  { ...v, candidate_id: c.id },
                  "Report reopened for review.",
                );
              }
            }}
          >
            <Notes label="Why does the report need correction?" min={20} />
            <Save busy={busy} label="Reopen report" />
          </form>
        )}
      </Section>
      {c.status === "released" && (
        <Section title="Course and follow-up support">
          {ops.suggestions.find((s) => s.candidate_id === c.id)?.rules.map(
            (rule) => (
              <p key={rule.id}>
                <strong>
                  {t("Provisional course suggestion")}: {rule.course_name}
                </strong>
                <br />
                {rule.evidence}
              </p>
            ),
          )}
          <p className="muted">
            {t(
              "Confirm the course in the report before enrollment. Suggestions are based on your center’s rules, not a guaranteed exam outcome.",
            )}
          </p>
          {plans.map((p) => (
            <article className="assessment-question" key={p.id}>
              <strong>{p.goal}</strong>
              <p>
                {ops.staff.find((s) => s.user_id === p.assigned_to)
                  ?.display_name || t("Academy teacher")} · {p.due_on} ·{" "}
                {t(p.status === "open" ? "Open" : "Completed")}
              </p>
              {p.outcome && <p>{p.outcome}</p>}
              {p.status === "open" && ops.permissions.support && (
                <form
                  className="assessment-form"
                  onSubmit={(e) => {
                    const v = values(e);
                    void command("complete_support", {
                      ...v,
                      candidate_id: c.id,
                      plan_id: p.id,
                    }, "Support outcome recorded.");
                  }}
                >
                  <Notes label="What changed for the learner?" name="outcome" />
                  <Save busy={busy} label="Complete follow-up" />
                </form>
              )}
            </article>
          ))}
          {ops.permissions.support && (
            <form
              className="assessment-form"
              onSubmit={(e) => {
                const v = values(e);
                void command(
                  "support_plan",
                  { ...v, candidate_id: c.id },
                  "Follow-up support scheduled.",
                );
              }}
            >
              <Notes label="Learning goal and agreed next action" name="goal" />
              <StaffSelect
                ops={ops}
                name="assigned_to"
                label="Responsible teacher"
              />
              <Field
                label="Follow-up date"
                name="due_on"
                type="date"
                required
              />
              <Save busy={busy} label="Plan follow-up" />
            </form>
          )}
        </Section>
      )}
      {ops.permissions.certificates && c.status === "released" && (
        <Section title="Mock-result certificate">
          <p>
            {t(
              "This certifies the recorded Schood mock result only. It is not an official IELTS result, a CEFR qualification or a network-certified standard.",
            )}
          </p>
          {!cert
            ? (
              <button
                className="primary-btn"
                disabled={busy}
                onClick={() =>
                  void command(
                    "certificate",
                    { candidate_id: c.id },
                    "Mock-result certificate issued. The learner controls public sharing.",
                  )}
              >
                {t("Issue mock-result certificate")}
              </button>
            )
            : (
              <>
                <p>
                  {t(
                    cert.revoked_at
                      ? "Certificate withdrawn"
                      : "Certificate issued",
                  )} · {t(
                    cert.public_consent
                      ? "Public sharing enabled"
                      : "Private until the learner enables sharing",
                  )}
                </p>
                <a
                  href={certificateUrl(cert.public_token)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("Open verification page")}
                </a>
                {!cert.revoked_at && (
                  <form
                    className="assessment-form"
                    onSubmit={(e) => {
                      const v = values(e);
                      void command("revoke_certificate", {
                        ...v,
                        candidate_id: c.id,
                      }, "Certificate withdrawn.");
                    }}
                  >
                    <Notes label="Reason for withdrawal" />
                    <Save busy={busy} label="Withdraw certificate" />
                  </form>
                )}
              </>
            )}
        </Section>
      )}
      {ops.permissions.finance && (
        <Section title="Assessment packages and fees">
          <p>
            {t(
              "One assessment can be sold alone or as part of a package. Paid packages create one charge in the learner’s existing account; subscription-included packages do not create another charge.",
            )}
          </p>
          {ops.allowances.filter((a) => a.contact_id === c.contact_id).map(
            (a) => (
              <article className="assessment-question" key={a.id}>
                <strong>
                  {ops.packages.find((p) => p.id === a.package_id)?.name}
                </strong>
                <p>
                  {a.assessments - a.used} {t("assessments remaining")} ·{" "}
                  {new Date(a.expires_at).toLocaleDateString()}
                </p>
                {!ops.uses.some((u) => u.candidate_id === c.id) &&
                  a.used < a.assessments &&
                  Date.parse(a.expires_at) > openedAt && (
                  <button
                    className="secondary-btn"
                    disabled={busy}
                    onClick={() =>
                      void command("use_allowance", {
                        candidate_id: c.id,
                        allowance_id: a.id,
                      }, "Assessment linked to package.")}
                  >
                    {t("Use for this assessment")}
                  </button>
                )}
              </article>
            ),
          )}
          {ops.uses.some((u) => u.candidate_id === c.id) && (
            <p>{t("This assessment is already covered by a package.")}</p>
          )}
          {ops.packages.length > 0 && (
            <form
              className="assessment-form"
              onSubmit={(e) => {
                const v = values(e);
                const p = ops.packages.find((p) => p.id === v.package_id)!;
                if (
                  window.confirm(`${
                    t(
                      v.subscription_id
                        ? "Include this package in the selected subscription?"
                        : "Add this package and charge to the learner’s account?",
                    )
                  } ${p.name} · ${v.subscription_id ? 0 : p.price} UZS`)
                ) {
                  void command("grant_package", {
                    ...v,
                    contact_id: c.contact_id,
                    idempotency_key: purchaseKey,
                  }, "Package added to the learner’s account.").then((ok) => {
                    if (ok) setPurchaseKey(crypto.randomUUID());
                  });
                }
              }}
            >
              <Field label="Package">
                <select className="input" name="package_id">
                  {ops.packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.assessments} · {p.price.toLocaleString()}
                      {" "}
                      {t("UZS")}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Payment arrangement">
                <select className="input" name="subscription_id">
                  <option value="">{t("Charge the learner’s account")}</option>
                  {ops.subscriptions.filter((s) =>
                    s.contact_id === c.contact_id
                  ).map((s) => (
                    <option key={s.id} value={s.id}>
                      {t("Included in active subscription")} · {s.starts_on} —
                      {" "}
                      {s.ends_on || "…"}
                    </option>
                  ))}
                </select>
              </Field>
              <Save busy={busy} label="Add package" />
            </form>
          )}
          <details>
            <summary>{t("Create a package")}</summary>
            <form
              className="assessment-form"
              onSubmit={(e) => {
                const v = values(e);
                void command(
                  "create_package",
                  v,
                  "Assessment package created.",
                );
              }}
            >
              <Field
                label="Package name"
                name="name"
                required
                maxLength={200}
              />
              <div className="assessment-form-grid">
                <Field
                  label="Number of assessments"
                  name="assessments"
                  type="number"
                  min={1}
                  max={100}
                  required
                />
                <Field
                  label="Package price (UZS)"
                  name="price"
                  type="number"
                  min={0}
                  max={1000000000}
                  required
                />
                <Field
                  label="Valid for (days)"
                  name="valid_days"
                  type="number"
                  min={1}
                  max={730}
                  required
                />
              </div>
              <Save busy={busy} label="Create package" />
            </form>
          </details>
        </Section>
      )}
      {run.require_moderation && !c.moderated_at && (
        <p className="muted">
          {t("This session requires moderation before results can be shared.")}
        </p>
      )}
    </div>
  );
}
