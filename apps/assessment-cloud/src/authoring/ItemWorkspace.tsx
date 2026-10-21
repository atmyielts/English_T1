import { useEffect, useRef, useState } from "react";
import {
  request,
  type Row,
} from "../../../../packages/assessment-web/src/client";
import { openAuthorCommands } from "../../../../packages/assessment-web/src/commands";
import type { GradeIntent } from "../../../../packages/assessment-web/src/grade-command";
import type { GradeAccess } from "../../../../packages/assessment-web/src/grading";
import {
  blankItemDraft,
  editItemDraft,
  type ItemDraft,
} from "../../../../packages/assessment-core/src/authoring.ts";
import {
  validateItem,
  validateKey,
  type ItemType,
} from "../../../../packages/assessment-core/src/mod.ts";
import { ItemEditor } from "./ItemEditor";
import { QuestionReview } from "./QuestionReview";
import { RubricEditor } from "./RubricEditor";
import "./authoring.css";
import { useAppT, useErrorText, useItemLabel } from "../i18n/index.ts";
export function ItemWorkspace({
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
  const t = useAppT(), problem = useErrorText(), itemLabel = useItemLabel();
  const [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pending, setPending] = useState<GradeIntent | null>(null),
    [review, setReview] = useState<Row | null>(null),
    [filter, setFilter] = useState(""),
    [status, setStatus] = useState("all"),
    [rubricOpen, setRubricOpen] = useState(false);
  const [editor, setEditor] = useState<{
    draft: ItemDraft;
    revision?: { itemId: string; bankId: string; version: number; versionId:string; reviewHash:string };
    key: number;
  }>({ draft: blankItemDraft(), key: 0 });
  const engine = useRef<Awaited<ReturnType<typeof openAuthorCommands>> | null>(
      null,
    ),
    alive = useRef(true),
    readVersion = useRef(0);
  useEffect(() => {
    if (!access.can_write_items && !access.can_approve_items) {
      readVersion.current++;
      setReview(null);
      setBusy(false);
    }
    if (!access.can_write_items) {
      setRubricOpen(false);
      setEditor((current) => ({
        draft: blankItemDraft(),
        key: current.key + 1,
      }));
    }
  }, [access.can_write_items, access.can_approve_items]);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    void openAuthorCommands(tenant, actor)
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
        if (!cancelled) setError(problem(cause));
      });
    return () => {
      cancelled = true;
      alive.current = false;
      readVersion.current++;
      engine.current?.close();
      engine.current = null;
    };
  }, [tenant, actor]);
  async function mutate(action?: string, data?: Record<string, unknown>) {
    if (busy) return false;
    setBusy(true);
    setError("");
    setNotice("");
    let committed=false;
    try {
      if (!engine.current)
        throw new Error(
          t("items.queueNotReady"),
        );
      const recovery=!action?await engine.current.commands.pending():null;
      const result=action?await engine.current.commands.execute(action,data!):await engine.current.commands.retry();
      committed=true;
      if (!alive.current) return false;
      if(recovery&&['item.create','item.revise'].includes(recovery.action))setEditor(current=>({draft:blankItemDraft(),key:current.key+1}));
      if(recovery?.action==='rubric.create')setRubricOpen(false);
      setReview(null);
      await reload();
      if (alive.current)
        setNotice(
          (result as {device_draft_preserved?:boolean})?.device_draft_preserved?t('items.draftPreserved'):
          action === "rubric.create"
            ? t("items.rubricSaved")
            : action === "item.approve"
              ? t("items.approved")
              : action === "item.submit"
                ? t("items.submitted")
                : t("items.recorded"),
        );
      return true;
    } catch (cause) {
      if (alive.current)
        setError(
          cause instanceof Error
            ? cause.message
            : t("items.recordFailed"),
        );
      if(committed&&alive.current)setNotice(t('items.recordedRefresh'));
      return committed;
    } finally {
      if (alive.current) {
        try {
          setPending((await engine.current?.commands.pending()) ?? null);
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : t("items.recoverFailed"),
          );
        }
        setBusy(false);
      }
    }
  }
  async function inspect(row: Row, revise = false) {
    const version = ++readVersion.current;
    setBusy(true);
    setError("");
    try {
      const value = await request<Row>(
        `item-versions/${row.id}/review`,
        tenant,
        undefined,
        undefined,
        undefined,
        actor,
      );
      if (!alive.current || version !== readVersion.current) return;
      if (revise) {
        const item = validateItem(value.payload),
          key = validateKey(item, value.key);
        if (!value.bank_id || !value.item_id)
          throw new Error(
            t("items.bankUnverified"),
          );
        setEditor((current) => ({
          draft: editItemDraft(item, key),
          revision: {
            itemId: String(value.item_id),
            bankId: String(value.bank_id),
            version: Number(value.version),
            versionId:String(value.id),
            reviewHash:String(value.review_hash),
          },
          key: current.key + 1,
        }));
        setReview(null);
      } else setReview(value);
    } catch (cause) {
      if (alive.current && version === readVersion.current)
        setError(
          cause instanceof Error
            ? cause.message
            : t("items.loadFailed"),
        );
    } finally {
      if (alive.current && version === readVersion.current) setBusy(false);
    }
  }
  const locked = busy || !!pending || !ready,
    versions = (rows["item-versions"] ?? []).filter(
      (row) =>
        (status === "all" || row.status === status) &&
        String((row.payload as { prompt?: string })?.prompt ?? "")
          .toLocaleLowerCase()
          .includes(filter.toLocaleLowerCase()),
    );
  return (
    <div className="author-workspace">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {pending && (
        <section className="pending-author">
          <h2>{t("items.pendingTitle")}</h2>
          <p>
            {t("items.pendingBody")}
          </p>
          <button disabled={busy} onClick={() => void mutate()}>
            {t("items.retry")}
          </button>
        </section>
      )}
      <div className="author-layout">
        <section>
          <h2>{t("items.title")}</h2>
          {access.can_write_items&&<a className="author-jump" href="#question-editor-heading">{t("items.jump")}</a>}
          <p>
            {t("items.lead")}
          </p>
          <label>
            {t("items.find")}
            <input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </label>
          <label>
            {t("items.status")}
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">{t("items.statusAll")}</option>
              <option value="draft">{t("items.statusDraft")}</option>
              <option value="review">{t("items.statusReview")}</option>
              <option value="approved">{t("items.statusApproved")}</option>
            </select>
          </label>
          <ul className="records">
            {versions.map((row) => (
              <li key={row.id}>
                <strong>
                  {String((row.payload as { prompt: string }).prompt)}
                </strong>
                <span>
                  {t("items.meta", { version: String(row.version), status: String(row.status), type: itemLabel((row.payload as { type: ItemType }).type) ?? "" })}
                </span>
                <div className="author-actions">
                  {row.status === "draft" && access.can_write_items && (
                    <button
                      disabled={locked}
                      onClick={() => void mutate("item.submit", { id: row.id })}
                    >
                      {t("items.submit")}
                    </button>
                  )}
                  {(access.can_write_items || access.can_approve_items) && (
                    <button
                      className="quiet"
                      disabled={locked}
                      onClick={() => void inspect(row)}
                    >
                      {t("items.review")}
                    </button>
                  )}
                  {access.can_write_items && (
                    <button
                      className="quiet"
                      disabled={locked}
                      onClick={() => void inspect(row, true)}
                    >
                      {t("items.revise")}
                    </button>
                  )}
                </div>
                {review && review.id === row.id && (
                  <QuestionReview
                    key={`${review.id}:${review.review_hash}`}
                    material={review}
                    tenant={tenant}
                    actor={actor}
                    busy={locked}
                    canApprove={
                      access.can_approve_items &&
                      row.status === "review" &&
                      row.created_by !== actor
                    }
                    approve={() =>
                      void mutate("item.approve", {
                        id: row.id,
                        review_hash: review.review_hash,
                      })
                    }
                  />
                )}
              </li>
            ))}
          </ul>
          {!versions.length && <p>{t("items.empty")}</p>}
          {access.can_write_items && (
            <>
              <button
                className="quiet"
                disabled={locked}
                onClick={() => setRubricOpen((current) => !current)}
              >
                {rubricOpen ? t("items.closeRubric") : t("items.openRubric")}
              </button>
              <h3>{t("items.rubrics")}</h3>
              <ul className="records">
                {(rows.rubrics ?? []).map((row) => (
                  <li key={row.id}>
                    <strong>{String(row.title)}</strong>
                    <span>
                      {t("items.criteriaCount", { count: Array.isArray(row.criteria) ? row.criteria.length : 0 })}
                    </span>
                  </li>
                ))}
              </ul>
              {rubricOpen && (
                <RubricEditor
                  tenant={tenant}
                  actor={actor}
                  busy={locked}
                  save={(data) => mutate("rubric.create", data)}
                />
              )}
            </>
          )}
        </section>
        {access.can_write_items && (
          <ItemEditor
            tenant={tenant}
            actor={actor}
            key={editor.key}
            initial={editor.draft}
            revision={editor.revision}
            banks={rows["item-banks"] ?? []}
            rubrics={rows.rubrics ?? []}
            busy={locked}
            save={(data, revision) =>
              mutate(revision ? "item.revise" : "item.create", data)
            }
            cancel={() =>
              setEditor((current) => ({
                draft: blankItemDraft(),
                key: current.key + 1,
              }))
            }
          />
        )}
      </div>
    </div>
  );
}
