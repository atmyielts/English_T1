import { type FormEvent, useEffect, useRef, useState } from "react";
import { request } from "../../../../packages/assessment-web/src/client";
import {
  invitationProblem,
  openInvitationCommands,
  type StaffInvitation,
} from "../../../../packages/assessment-web/src/invitations";
import type { GradeIntent } from "../../../../packages/assessment-web/src/grade-command";
import { useI18n } from "../../../../packages/service-i18n/src/i18n.tsx";
import { useAppT, type AppKey } from "../i18n/index.ts";
interface Delivery {
  id: string;
  invitation_id: string;
  state:
    | "queued"
    | "leased"
    | "sending"
    | "accepted"
    | "failed"
    | "uncertain"
    | "cancelled";
  revision: number;
  kind: string;
  locale: string;
  send_after: string;
  next_attempt_at: string;
  attempt_count: number;
  last_code: string | null;
  retry_of: string | null;
}
type Translate = ReturnType<typeof useAppT>;
const mailCodes = new Set([
  "smtp_accepted", "smtp_temporary", "smtp_rejected", "smtp_auth", "smtp_connect",
  "smtp_unknown", "smtp_timeout", "handoff_receipt_missing",
  "lease_expired_before_handoff", "invitation_no_longer_sendable",
  "render_unavailable", "manager_cancelled", "begin_unavailable", "handoff_spacing",
]);
const mailProblems = new Set([
  "mail_uncertainty_review_required", "mail_schedule_too_close",
  "mail_handoff_already_started", "mail_revision_conflict",
  "mail_retry_source_required", "invitation_mail_limit",
]);
const stateText = (state: Delivery["state"], t: Translate) =>
  t(`mail.state.${state}` as AppKey);
function explanation(row: Delivery, t: Translate) {
  if (row.state === "failed" && row.attempt_count >= 5) {
    return t("mail.exhausted");
  }
  return row.last_code
    ? (mailCodes.has(row.last_code)
      ? t(`mail.code.${row.last_code}` as AppKey)
      : t("mail.reviewOperator"))
    : "";
}
function problem(cause: unknown, t: Translate) {
  const code = (cause as { code?: string })?.code ?? "";
  return mailProblems.has(code)
    ? t(`mail.problem.${code}` as AppKey)
    : invitationProblem(cause, t);
}
export function InvitationMailPanel(
  { actor, tenant, invitation, blocked, close }: {
    actor: string;
    tenant: string;
    invitation: StaffInvitation;
    blocked: boolean;
    close: () => void;
  },
) {
  const t = useAppT(), { date } = useI18n();
  const [rows, setRows] = useState<Delivery[]>([]),
    [more, setMore] = useState(false),
    [kind, setKind] = useState("invitation"),
    [locale, setLocale] = useState("en"),
    [schedule, setSchedule] = useState("now"),
    [when, setWhen] = useState(""),
    [source, setSource] = useState(""),
    [reason, setReason] = useState(""),
    [ack, setAck] = useState(false),
    [duplicate, setDuplicate] = useState(false),
    [cancel, setCancel] = useState<Delivery | null>(null),
    [cancelReason, setCancelReason] = useState(""),
    [cancelAck, setCancelAck] = useState(false),
    [pending, setPending] = useState<GradeIntent | null>(null),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [denied, setDenied] = useState(false);
  const live = useRef(true),
    engine = useRef<Awaited<ReturnType<typeof openInvitationCommands>> | null>(
      null,
    ),
    generation = useRef(0);
  const selected = rows.find((row) => row.id === source),
    canSend = invitation.created_by === actor && invitation.state === "pending",
    locked = blocked || busy || !ready || !!pending || denied;
  function fail(cause: unknown) {
    if (!live.current) return;
    setError(problem(cause, t));
    if ([401, 403].includes((cause as { status?: number })?.status ?? 0)) {
      generation.current++;
      setRows([]);
      setCancel(null);
      setDenied(true);
    }
  }
  async function load(after?: string) {
    const seq = ++generation.current,
      result = await request<Delivery[]>(
        `invitations/mail/list?invitation_id=${invitation.id}&limit=50${
          after ? "&after=" + after : ""
        }`,
        tenant,
        undefined,
        undefined,
        undefined,
        actor,
      );
    if (live.current && generation.current === seq) {
      setRows((current) => after ? [...current, ...result] : result);
      setMore(result.length === 50);
      setDenied(false);
    }
  }
  useEffect(() => {
    live.current = true;
    let opened: Awaited<ReturnType<typeof openInvitationCommands>> | undefined;
    void (async () => {
      try {
        opened = await openInvitationCommands(tenant, actor, false, true);
        if (!live.current) {
          opened.close();
          return;
        }
        engine.current = opened;
        const saved = await opened.commands.pending();
        if (!live.current) return;
        setPending(saved);
        setReady(true);
        await load();
      } catch (cause) {
        fail(cause);
      }
    })();
    return () => {
      live.current = false;
      generation.current++;
      opened?.close();
      engine.current = null;
    };
  }, [actor, tenant, invitation.id]);
  async function refresh(after?: string) {
    setBusy(true);
    setError("");
    try {
      await load(after);
    } catch (cause) {
      fail(cause);
    } finally {
      if (live.current) setBusy(false);
    }
  }
  async function mutate(action?: string, data?: Record<string, unknown>) {
    if (!engine.current) return;
    setBusy(true);
    setError("");
    let committed = false;
    try {
      if (action) await engine.current.commands.execute(action, data!);
      else await engine.current.commands.retry();
      committed = true;
      if (!live.current) return;
      setNotice(
        t("mail.recorded"),
      );
      setCancel(null);
      setAck(false);
      setDuplicate(false);
      await load();
    } catch (cause) {
      fail(cause);
      if (live.current && committed) {
        setNotice(t("mail.recordedRefresh"));
      }
    } finally {
      if (live.current) {
        try {
          setPending(await engine.current?.commands.pending() ?? null);
        } catch (cause) {
          fail(cause);
        }
        setBusy(false);
      }
    }
  }
  function queue(event: FormEvent) {
    event.preventDefault();
    void mutate("mail.queue", {
      id: crypto.randomUUID(),
      invitation_id: invitation.id,
      expected_invitation_revision: invitation.revision,
      kind,
      locale,
      send_after: schedule === "now"
        ? new Date().toISOString()
        : new Date(when).toISOString(),
      retry_of: selected?.id ?? null,
      expected_source_revision: selected?.revision ?? null,
      possible_duplicate_ack: duplicate,
      reason,
      acknowledged: ack,
    });
  }
  return (
    <section
      className="invitation-mail"
      aria-labelledby="invitation-mail-heading"
    >
      <h3 id="invitation-mail-heading">
        {t("mail.title", { email: invitation.recipient_email })}
      </h3>
      <p>
        {t("mail.lead")}
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p role="status" className="notice">{notice}</p>}
      {pending && (
        <section>
          <h4>{t("mail.pendingTitle")}</h4>
          <p>
            {t("mail.pendingBody")}
          </p>
          <button disabled={busy} onClick={() => void mutate()}>
            {t("mail.retry")}
          </button>
        </section>
      )}
      {canSend && !denied
        ? (
          <form onSubmit={queue}>
            <h4>{t("mail.sendTitle")}</h4>
            <label>
              {t("mail.kind")}<select
                value={kind}
                disabled={locked}
                onChange={(e) => {
                  setKind(e.target.value);
                  setAck(false);
                }}
              >
                <option value="invitation">{t("mail.kindInvitation")}</option>
                <option value="reminder">{t("mail.kindReminder")}</option>
              </select>
            </label>
            <label>
              {t("mail.language")}<select
                value={locale}
                disabled={locked}
                onChange={(e) => {
                  setLocale(e.target.value);
                  setAck(false);
                }}
              >
                <option value="uz">O‘zbekcha</option>
                <option value="ru">Русский</option>
                <option value="en">English</option>
              </select>
            </label>
            <label>
              {t("mail.timing")}<select
                value={schedule}
                disabled={locked}
                onChange={(e) => {
                  setSchedule(e.target.value);
                  setAck(false);
                }}
              >
                <option value="now">{t("mail.now")}</option>
                <option value="scheduled">{t("mail.later")}</option>
              </select>
            </label>
            {schedule === "scheduled" && (
              <label>
                {t("mail.when")}<input
                  type="datetime-local"
                  required
                  value={when}
                  disabled={locked}
                  onChange={(e) => {
                    setWhen(e.target.value);
                    setAck(false);
                  }}
                />
              </label>
            )}
            <p>
              {t("mail.timingHint")}
            </p>
            <label>
              {t("mail.replace")}<select
                value={source}
                disabled={locked}
                onChange={(e) => {
                  setSource(e.target.value);
                  setAck(false);
                  setDuplicate(false);
                }}
              >
                <option value="">{t("mail.newMessage")}</option>
                {rows.filter((row) =>
                  ["failed", "uncertain"].includes(row.state) &&
                  !rows.some((child) => child.retry_of === row.id)
                ).map((row) => (
                  <option key={row.id} value={row.id}>
                    {t("mail.sourceOption", { state: stateText(row.state, t), date: date(row.send_after), id: row.id.slice(0, 8) })}
                  </option>
                ))}
              </select>
            </label>
            {selected?.state === "uncertain" && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={duplicate}
                  disabled={locked}
                  onChange={(e) => setDuplicate(e.target.checked)}
                />{t("mail.duplicateAck")}
              </label>
            )}
            <label>
              {t("mail.reason")}<textarea
                required
                maxLength={5000}
                disabled={locked}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setAck(false);
                }}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={ack}
                disabled={locked}
                onChange={(e) => setAck(e.target.checked)}
              />{t("mail.ack")}
            </label>
            <button
              disabled={locked || !ack ||
                (selected?.state === "uncertain" && !duplicate)}
            >
              {schedule === "now"
                ? t("mail.queue")
                : t("mail.schedule")}
            </button>
          </form>
        )
        : (
          <p>
            {t("mail.senderOnly")}
          </p>
        )}
      <h4>{t("mail.history")}</h4>
      <button
        className="quiet"
        disabled={busy || !ready}
        onClick={() => void refresh()}
      >
        {t("mail.refresh")}
      </button>
      {!rows.length && !denied && <p>{t("mail.empty")}</p>}
      <ul className="records">
        {rows.map((row) => (
          <li key={row.id}>
            <strong>{stateText(row.state, t)}</strong>
            <span>
              {t("mail.rowMeta", { kind: row.kind, locale: row.locale, date: date(row.send_after), attempts: String(row.attempt_count) })}
            </span>
            {row.last_code && (
              <p>
                {explanation(row, t)}
              </p>
            )}
            {row.state === "queued" && row.attempt_count > 0 && (
              <p>
                {t("mail.nextAttempt", { date: date(row.next_attempt_at) })}
              </p>
            )}
            {row.retry_of && (
              <p>
                {t("mail.replacement")}
              </p>
            )}
            {["queued", "leased"].includes(row.state) && (
              <button
                className="quiet"
                disabled={locked}
                onClick={() => {
                  setCancel(row);
                  setCancelReason("");
                  setCancelAck(false);
                }}
              >
                {t("mail.reviewCancel")}
              </button>
            )}
          </li>
        ))}
      </ul>
      {more && (
        <button
          disabled={locked}
          onClick={() => void refresh(rows.at(-1)?.id)}
        >
          {t("mail.more")}
        </button>
      )}
      {cancel && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void mutate("mail.cancel", {
              id: cancel.id,
              expected_revision: cancel.revision,
              reason: cancelReason,
              acknowledged: cancelAck,
            });
          }}
        >
          <h4>{t("mail.cancelTitle")}</h4>
          <p>
            {t("mail.cancelLead")}
          </p>
          <label>
            {t("mail.cancelReason")}<textarea
              required
              maxLength={5000}
              value={cancelReason}
              disabled={locked}
              onChange={(e) => {
                setCancelReason(e.target.value);
                setCancelAck(false);
              }}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={cancelAck}
              disabled={locked}
              onChange={(e) => setCancelAck(e.target.checked)}
            />{t("mail.cancelAck")}
          </label>
          <button disabled={locked || !cancelAck}>{t("mail.cancel")}</button>
        </form>
      )}
      <button type="button" className="quiet" disabled={busy} onClick={close}>
        {t("mail.close")}
      </button>
    </section>
  );
}
