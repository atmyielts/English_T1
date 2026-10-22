import { type FormEvent, useState } from "react";
import type { ReviewChange } from "../../../../packages/assessment-core/src/item-diff.ts";
import { useI18n } from "../../../../packages/service-i18n/src/i18n.tsx";
import { type AppKey, useAppT } from "../i18n/index.ts";
export interface ReviewComparison {
  base_version: number;
  base_status: string;
  changes: ReviewChange[];
  areas: string[];
  truncated: boolean;
}
export interface ReviewComment {
  id: string;
  version: number | null;
  kind: "comment" | "changes_requested";
  area: string;
  body: string;
  created_at: string;
  author: "you" | "author" | "reviewer";
}
const AREAS = ["general", "prompt", "options", "key", "rubric", "media", "scoring", "metadata"];
const shown = (value: unknown) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 240 ? text.slice(0, 239) + "…" : text;
};
/** What changed since the previous version of this question. */
export function ReviewChanges({ comparison }: { comparison: ReviewComparison | null }) {
  const t = useAppT();
  const area = (code: string) => t(`questionReview.area.${code}` as AppKey);
  if (!comparison) return <p>{t("questionReview.firstVersion")}</p>;
  const version = String(comparison.base_version);
  return (
    <section className="review-changes" aria-labelledby="review-changes-heading">
      <h4 id="review-changes-heading">{t("questionReview.changesTitle", { version })}</h4>
      {comparison.changes.length === 0
        ? <p>{t("questionReview.noChanges", { version })}</p>
        : (
          <ul className="records">
            {comparison.changes.map((row) => (
              <li key={row.path}>
                <strong>
                  {area(row.area)} · {t(`questionReview.change.${row.kind}` as AppKey)}
                </strong>
                <span className="review-path">{row.path}</span>
                {row.kind !== "added" && (
                  <p>
                    <span className="hint">{t("questionReview.before")}</span>{" "}
                    <del>{shown(row.before)}</del>
                  </p>
                )}
                {row.kind !== "removed" && (
                  <p>
                    <span className="hint">{t("questionReview.after")}</span>{" "}
                    <ins>{shown(row.after)}</ins>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      {comparison.truncated && (
        <p role="status">{t("questionReview.truncated", { count: comparison.changes.length })}</p>
      )}
    </section>
  );
}
/** The review conversation for every version, and new comments or change requests. */
export function ReviewConversation({
  comments,
  canComment,
  canRequestChanges,
  busy,
  comment,
  requestChanges,
}: {
  comments: ReviewComment[];
  canComment: boolean;
  canRequestChanges: boolean;
  busy: boolean;
  comment: (data: { area: string; body: string }) => Promise<boolean>;
  requestChanges: (data: { area: string; body: string }) => Promise<boolean>;
}) {
  const t = useAppT(), { date } = useI18n();
  const [area, setArea] = useState("general"), [body, setBody] = useState("");
  const label = (code: string) => t(`questionReview.area.${code}` as AppKey);
  async function send(event: FormEvent, change: boolean) {
    event.preventDefault();
    if (await (change ? requestChanges : comment)({ area, body })) {
      setBody("");
      setArea("general");
    }
  }
  return (
    <section className="review-conversation" aria-labelledby="review-conversation-heading">
      <h4 id="review-conversation-heading">{t("questionReview.conversation")}</h4>
      {comments.length === 0
        ? <p>{t("questionReview.noComments")}</p>
        : (
          <ol className="records">
            {comments.map((row) => (
              <li key={row.id}>
                <strong>
                  {t(row.author === "you" ? "questionReview.byYou" : row.author === "author" ? "questionReview.byAuthor" : "questionReview.byReviewer")}
                  {row.kind === "changes_requested" && <> · {t("questionReview.changesRequested")}</>}
                </strong>
                <span>
                  {t("questionReview.commentMeta", {
                    version: String(row.version ?? "?"),
                    area: label(row.area),
                    date: date(row.created_at),
                  })}
                </span>
                <p className="review-comment">{row.body}</p>
              </li>
            ))}
          </ol>
        )}
      {canComment && (
        <form onSubmit={(event) => void send(event, false)}>
          <label>
            {t("questionReview.commentArea")}
            <select value={area} disabled={busy} onChange={(event) => setArea(event.target.value)}>
              {AREAS.map((code) => <option key={code} value={code}>{label(code)}</option>)}
            </select>
          </label>
          <label>
            {t("questionReview.commentBody")}
            <textarea
              required
              maxLength={5000}
              rows={3}
              value={body}
              disabled={busy}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>
          <div className="author-actions">
            <button disabled={busy || !body.trim()}>{t("questionReview.addComment")}</button>
            {canRequestChanges && (
              <button
                type="button"
                className="quiet"
                disabled={busy || !body.trim()}
                onClick={(event) => void send(event, true)}
              >
                {t("questionReview.requestChanges")}
              </button>
            )}
          </div>
          {canRequestChanges && <p className="hint">{t("questionReview.requestHint")}</p>}
        </form>
      )}
    </section>
  );
}
