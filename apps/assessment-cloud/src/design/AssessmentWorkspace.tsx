import React, { useEffect, useRef, useState } from "react";
import {
  blankAssessment,
  editAssessment,
  type AssessmentDraft,
} from "../../../../packages/assessment-core/src/design.ts";
import {
  canonicalJson,
  validateDefinition,
  type Definition,
} from "../../../../packages/assessment-core/src/mod.ts";
import {
  request,
  ServiceRequestError,
  type Row,
} from "../../../../packages/assessment-web/src/client";
import { openAuthorCommands } from "../../../../packages/assessment-web/src/commands";
import type { GradeIntent } from "../../../../packages/assessment-web/src/grade-command";
import type { GradeAccess } from "../../../../packages/assessment-web/src/grading";
import { AssessmentEditor } from "./AssessmentEditor";
import { DefinitionSummary } from "./DefinitionSummary";
import "./design.css";
type Editor = {
  initial: AssessmentDraft;
  source: string;
  key: number;
  revision?: { id: string; revision: number };
};
export function AssessmentWorkspace({
  tenant,
  actor,
  access,
  rows,
  reload,
}: {
  tenant: string;
  actor: string;
  access: GradeAccess;
  rows: Record<string, Row[]>;
  reload: () => Promise<void>;
}) {
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pending, setPending] = useState<GradeIntent | null>(null),
    [editor, setEditor] = useState<Editor | null>(null),
    [review, setReview] = useState<Row | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [history, setHistory] = useState<Row[] | null>(null);
  const engine = useRef<Awaited<ReturnType<typeof openAuthorCommands>> | null>(
      null,
    ),
    alive = useRef(true),
    generation = useRef(0),
    sequence = useRef(0);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    void openAuthorCommands(tenant, actor, "assessment-design")
      .then(async (value) => {
        if (cancelled) {
          value.close();
          return;
        }
        engine.current = value;
        const saved = await value.commands.pending();
        if (!cancelled) {
          setPending(saved);
          setReady(true);
        }
      })
      .catch((cause) => {
        if (!cancelled) setError(cause.message);
      });
    return () => {
      cancelled = true;
      alive.current = false;
      generation.current++;
      engine.current?.close();
      engine.current = null;
    };
  }, [tenant, actor]);
  useEffect(() => {
    if (!access.can_write_items) setEditor(null);
    if (!access.can_publish) {
      setReview(null);
      setConfirmed(false);
    }
  }, [access.can_write_items, access.can_publish]);
  async function mutate(action?: string, data?: Record<string, unknown>) {
    if (busy) return false;
    setBusy(true);
    setError("");
    setNotice("");
    let committed = false;
    try {
      if (!engine.current)
        throw new Error("The encrypted assessment queue is not ready.");
      const result = action
        ? await engine.current.commands.execute(action, data!)
        : await engine.current.commands.retry();
      committed = true;
      if (!alive.current) return false;
      setEditor(null);
      setReview(null);
      setHistory(null);
      setConfirmed(false);
      await reload();
      if (alive.current)
        setNotice(
          (result as { device_draft_preserved?: boolean })
            ?.device_draft_preserved
            ? "Change recorded. A newer device draft was preserved for review."
            : "Assessment change recorded. Published snapshots remain immutable.",
        );
      return true;
    } catch (cause) {
      if (alive.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "The assessment change could not be recorded.",
        );
        if (
          cause instanceof ServiceRequestError &&
          [401, 403].includes(cause.status)
        ) {
          setEditor(null);
          setReview(null);
          setHistory(null);
        }
        if (committed)
          setNotice(
            "The change was recorded. Refresh the institution records before continuing.",
          );
      }
      return committed;
    } finally {
      if (alive.current) {
        try {
          setPending((await engine.current?.commands.pending()) ?? null);
        } catch {
          setError(
            "The encrypted request queue could not be read. Refresh before making changes.",
          );
          setReady(false);
        }
        setBusy(false);
      }
    }
  }
  function edit(row?: Row) {
    setError("");
    setReview(null);
    setConfirmed(false);
    try {
      const definition = row ? validateDefinition(row.definition) : null;
      setEditor({
        initial: definition ? editAssessment(definition) : blankAssessment(),
        source: definition
          ? canonicalJson({ revision: row!.revision, definition })
          : "assessment-editor.v1",
        key: ++sequence.current,
        ...(row
          ? { revision: { id: row.id!, revision: Number(row.revision) } }
          : {}),
      });
    } catch (cause) {
      setError(String(cause));
    }
  }
  async function revisions(id: string) {
    const version = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const result = await request<Row[]>(
        "assessment-revisions",
        tenant,
        undefined,
        undefined,
        undefined,
        actor,
      );
      if (alive.current && version === generation.current)
        setHistory(
          result
            .filter((row) => row.assessment_id === id)
            .sort((a, b) => Number(b.revision) - Number(a.revision)),
        );
    } catch (cause) {
      if (alive.current && version === generation.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Revision history could not be loaded.",
        );
    } finally {
      if (alive.current && version === generation.current) setBusy(false);
    }
  }
  const locked = busy || !ready || !!pending;
  const approved = (rows["item-versions"] ?? []).filter(
    (row) => row.status === "approved",
  );
  const current =
      review && (rows.assessments ?? []).find((row) => row.id === review.id),
    reviewCurrent =
      !!current &&
      Number(current.revision) === Number(review?.revision) &&
      canonicalJson(current.definition) === canonicalJson(review?.definition);
  return (
    <>
      <section className="assessment-library">
        <h2>Assessment library</h2>
        <p>
          Centers own their tests, question pools and published versions. Each
          new publication is an independent snapshot.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {!ready && !error && (
          <p role="status">Opening encrypted assessment request queue…</p>
        )}
        {pending && (
          <div role="alert">
            <p>
              A saved {pending.action} request has no confirmed receipt. Retry
              the same request before making another change.
            </p>
            <button disabled={busy || !ready} onClick={() => void mutate()}>
              Retry saved assessment request
            </button>
          </div>
        )}
        {access.can_write_items && (
          <button disabled={locked} onClick={() => edit()}>
            Create assessment
          </button>
        )}
        {!(rows.assessments ?? []).length && (
          <p>
            No working definitions yet. Create an assessment from approved
            institution questions.
          </p>
        )}
        <ul className="records">
          {(rows.assessments ?? []).map((row) => (
            <li key={row.id}>
              <strong>{String(row.title)}</strong>
              <span>Working revision {String(row.revision)}</span>
              <div className="design-actions">
                {access.can_write_items && (
                  <button
                    className="quiet"
                    disabled={locked}
                    onClick={() => edit(row)}
                  >
                    Edit {String(row.title)}
                  </button>
                )}
                {access.can_publish && (
                  <button
                    className="quiet"
                    disabled={locked || !!editor}
                    onClick={() => {
                      setReview(row);
                      setConfirmed(false);
                    }}
                  >
                    Review publication of {String(row.title)}
                  </button>
                )}
                <button
                  className="quiet"
                  disabled={busy}
                  onClick={() => void revisions(row.id!)}
                >
                  Revision history of {String(row.title)}
                </button>
              </div>
            </li>
          ))}
        </ul>
        <h2>Published versions</h2>
        {!(rows["assessment-versions"] ?? []).length && (
          <p>No published assessment versions.</p>
        )}
        {(rows["assessment-versions"] ?? []).map((row) => (
          <details key={row.id}>
            <summary>
              {String((row.definition as Definition).title)} · Published version{" "}
              {String(row.version)}
            </summary>
            <DefinitionSummary definition={row.definition as Definition} />
            <p>
              Version ID: {row.id}. Editing the working definition will not
              change this version.
            </p>
          </details>
        ))}
        {history && (
          <>
            <h3>Immutable working revision history</h3>
            {!history.length && <p>No revision records returned.</p>}
            {history.map((row) => (
              <details key={row.id}>
                <summary>
                  Revision {String(row.revision)} · {String(row.reason)}
                </summary>
                <DefinitionSummary definition={row.definition as Definition} />
                <p>
                  Recorded by {String(row.actor_id)} at{" "}
                  {new Date(String(row.created_at)).toLocaleString()}.
                </p>
              </details>
            ))}
            <button className="quiet" onClick={() => setHistory(null)}>
              Close revision history
            </button>
          </>
        )}
        {review && (
          <div className="publication-review">
            <h3>Review publication: {String(review.title)}</h3>
            <DefinitionSummary definition={review.definition as Definition} />
            <p>
              Publication pins all listed item versions and section rules.
              Existing exam windows keep their previous version.
            </p>
            {!reviewCurrent && (
              <p role="alert">
                This working definition changed. Close this review and reopen
                the latest revision.
              </p>
            )}
            <label className="check">
              <input
                type="checkbox"
                disabled={locked || !reviewCurrent}
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I reviewed this working revision and its section rules.
            </label>
            <div className="design-actions">
              <button
                disabled={locked || !reviewCurrent || !confirmed}
                onClick={() =>
                  void mutate("assessment.publish", {
                    id: review.id,
                    revision: review.revision,
                  })
                }
              >
                Publish immutable version
              </button>
              <button
                className="quiet"
                disabled={busy}
                onClick={() => {
                  setReview(null);
                  setConfirmed(false);
                }}
              >
                Close publication review
              </button>
            </div>
          </div>
        )}
      </section>
      {editor && access.can_write_items && (
        <AssessmentEditor
          key={editor.key}
          initial={editor.initial}
          source={editor.source}
          revision={editor.revision}
          tenant={tenant}
          actor={actor}
          questions={approved}
          busy={locked}
          save={mutate}
          cancel={() => setEditor(null)}
        />
      )}
    </>
  );
}
