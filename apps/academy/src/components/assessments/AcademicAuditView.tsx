import { useMemo, useState } from "react";
import { translate as t, useI18n } from "../../i18n";
import type { AssessmentWorkspace } from "../../lib/assessmentServices";

export function AcademicAuditView({ data }: { data: AssessmentWorkspace }) {
  useI18n();
  const [since, setSince] = useState(() =>
    new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10)
  );
  const [until, setUntil] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [dimension, setDimension] = useState<"group" | "branch" | "teacher">(
    "group",
  );
  const ops = data.operations;
  const evidence = useMemo(() => {
    const runMap = new Map(data.runs.map((r) => [r.id, r]));
    const released = data.candidates.filter((c) =>
      c.status === "released" && c.summary?.percent !== null &&
      c.summary?.percent !== undefined && c.started_at &&
      c.started_at.slice(0, 10) >= since && c.started_at.slice(0, 10) <= until
    );
    const histories = new Map<string, typeof released>();
    for (const c of released) {
      const r = runMap.get(c.run_id);
      if (!r) continue;
      // Attribution must remain the same at both ends of a matched comparison.
      const key = [
        c.contact_id,
        r.paper_id,
        r.classroom_id,
        r.branch_id,
        r.teaching_user_id,
      ].join(":");
      histories.set(key, [...(histories.get(key) || []), c]);
    }
    const groups = new Map<
      string,
      {
        paper: string;
        label: string;
        matched: number;
        participants: Set<string>;
        changes: number[];
        weak: Record<string, number[]>;
        from: string;
        to: string;
      }
    >();
    const latestHistories = new Map<string, typeof released>();
    for (const history of histories.values()) {
      history.sort((a, b) => a.started_at!.localeCompare(b.started_at!));
      const last = history[history.length - 1], run = runMap.get(last.run_id)!;
      const dimensionId = dimension === "group"
        ? run.classroom_id
        : dimension === "branch"
        ? run.branch_id
        : run.teaching_user_id;
      const key = [last.contact_id, run.paper_id, dimensionId].join(":");
      const previous = latestHistories.get(key);
      if (
        !previous ||
        previous[previous.length - 1].started_at! < last.started_at!
      ) latestHistories.set(key, history);
    }
    for (const history of latestHistories.values()) {
      history.sort((a, b) => a.started_at!.localeCompare(b.started_at!));
      const first = history[0],
        last = history[history.length - 1],
        run = runMap.get(last.run_id)!;
      const id = dimension === "group"
        ? run.classroom_id
        : dimension === "branch"
        ? run.branch_id
        : run.teaching_user_id;
      if (!id) continue;
      const label = dimension === "group"
        ? data.classrooms.find((c) => c.id === id)?.name
        : dimension === "branch"
        ? ops?.branches.find((b) => b.id === id)?.name
        : ops?.staff.find((s) => s.user_id === id)?.display_name;
      const key = [id, run.paper_id].join(":");
      const group = groups.get(key) || {
        paper: data.papers.find((p) => p.id === run.paper_id)?.title || "",
        label: label || "",
        matched: 0,
        participants: new Set<string>(),
        changes: [],
        weak: {},
        from: first.started_at!,
        to: last.started_at!,
      };
      group.participants.add(last.contact_id);
      if (history.length > 1 && first.started_at !== last.started_at) {
        group.matched++;
        group.changes.push(last.summary!.percent! - first.summary!.percent!);
        if (first.started_at! < group.from) group.from = first.started_at!;
        if (last.started_at! > group.to) group.to = last.started_at!;
      }
      for (const skill of last.summary!.skills) {
        if (skill.percent !== null) {
          group.weak[skill.skill] = [
            ...(group.weak[skill.skill] || []),
            skill.percent,
          ];
        }
      }
      groups.set(key, group);
    }
    const levels = ["Pre-A1", "A1", "A2", "B1", "B2", "C1", "C2"];
    // Only the latest released result for a learner/group contributes to mismatch flags.
    const latest = new Map<string, typeof released[number]>();
    for (const c of released) {
      const r = runMap.get(c.run_id)!;
      const key = [c.contact_id, r.classroom_id].join(":");
      if (!latest.has(key) || latest.get(key)!.started_at! < c.started_at!) {
        latest.set(key, c);
      }
    }
    const mismatches = [...latest.values()].filter((c) => {
      const run = runMap.get(c.run_id)!;
      return run.expected_level && c.report?.level &&
        levels.indexOf(c.report.level) >= 0 &&
        levels.indexOf(c.report.level) < levels.indexOf(run.expected_level);
    });
    return { groups: [...groups.values()], mismatches, runMap };
  }, [data, ops, since, until, dimension]);
  if (!ops) return null;
  const overdue = ops.support.filter((p) =>
    p.status === "open" && p.due_on < new Date().toISOString().slice(0, 10)
  );
  return (
    <section className="assessment-form assessment-operations">
      <header>
        <span className="assessment-eyebrow">{t("Academic audit")}</span>
        <h3>{t("Where is support needed?")}</h3>
      </header>
      <p>
        {t(
          "Compare matched learners on the same paper. Results describe observed progress; they do not isolate teacher effectiveness or predict an official exam score.",
        )}
      </p>
      <div className="assessment-form-grid">
        <label>
          {t("Start date")}
          <input
            className="input"
            type="date"
            value={since}
            max={until}
            onChange={(e) => setSince(e.target.value)}
          />
        </label>
        <label>
          {t("End date")}
          <input
            className="input"
            type="date"
            value={until}
            min={since}
            onChange={(e) => setUntil(e.target.value)}
          />
        </label>
        <label>
          {t("Compare by")}
          <select
            className="input"
            value={dimension}
            onChange={(e) => setDimension(e.target.value as typeof dimension)}
          >
            <option value="group">{t("Group")}</option>
            <option value="branch">{t("Branch")}</option>
            <option value="teacher">{t("Recorded teaching context")}</option>
          </select>
        </label>
      </div>
      <p className="assessment-caution">
        {t(
          "Small samples, attendance, starting level, changed teaching arrangements and familiarity with repeated questions can all affect the comparison. Never use this view alone for staff appraisal.",
        )}
      </p>
      {!evidence.groups.length
        ? (
          <p>
            {t(
              "No comparable evidence in this period. Record the group and teaching context before running baseline and follow-up sessions.",
            )}
          </p>
        )
        : (
          <div className="assessment-progress">
            {evidence.groups.map((g, i) => (
              <article key={i}>
                <span>{g.paper}</span>
                <h4>{g.label === "You" ? t("You") : g.label || t("Not recorded")}</h4>
                <strong>
                  {g.matched
                    ? `${
                      (g.changes.reduce((a, b) => a + b, 0) / g.matched)
                        .toFixed(1)
                    } ${t("percentage points")}`
                    : t("Baseline only")}
                </strong>
                <p>
                  {g.matched}/{g.participants.size}{" "}
                  {t("learners with matched results")}
                </p>
                {g.matched > 0 && g.matched < 5 && (
                  <small>{t("Small sample — interpret cautiously")}</small>
                )}
                <small>{g.from.slice(0, 10)} → {g.to.slice(0, 10)}</small>
                <dl>
                  {Object.entries(g.weak).map(([skill, scores]) => (
                    <div key={skill}>
                      <dt>{t(skill)}</dt>
                      <dd>
                        {(scores.reduce((a, b) =>
                          a + b, 0) / scores.length)
                          .toFixed(1)}
                        {"% · n="}
                        {scores.length}
                      </dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        )}
      <details className="assessment-ops-section">
        <summary>
          {t("Check expected group levels")} · {evidence.mismatches.length}
        </summary>
        <div className="assessment-ops-content">
          <p>
            {t(
              "These flags compare teacher-estimated levels with the group’s recorded expectation. They are prompts to review placement, not proof of level inflation.",
            )}
          </p>
          {evidence.mismatches.map((c) => {
            const run = evidence.runMap.get(c.run_id)!;
            const contact = data.contacts.find((p) => p.id === c.contact_id);
            return (
              <p key={c.id}>
                <strong>{contact?.first_name} {contact?.last_name}</strong> ·
                {" "}
                {run.title} · {t("Estimated level")}: {c.report?.level} ·{" "}
                {t("Expected level")}: {run.expected_level}
              </p>
            );
          })}
        </div>
      </details>
      <details className="assessment-ops-section">
        <summary>
          {t("Follow-ups needing attention")} · {overdue.length}
        </summary>
        <div className="assessment-ops-content">
          <p>
            {t(
              "An overdue follow-up is a support signal, not a prediction that a student will leave. Select the learner’s assessment to record the outcome.",
            )}
          </p>
          {overdue.map((p) => (
            <article key={p.id}>
              <strong>{p.goal}</strong>
              <p>
                {p.due_on} · {ops.staff.find((s) => s.user_id === p.assigned_to)
                  ?.display_name || t("Academy teacher")}
              </p>
            </article>
          ))}
        </div>
      </details>
    </section>
  );
}
