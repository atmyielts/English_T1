import { type FormEvent, useEffect, useRef, useState } from "react";
import { request } from "../../../../packages/assessment-web/src/client";
import {
  invitationProblem,
  openInvitationCommands,
  type StaffInvitation,
} from "../../../../packages/assessment-web/src/invitations";
import type { GradeIntent } from "../../../../packages/assessment-web/src/grade-command";
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
const states = {
  queued: "Waiting to send",
  leased: "Preparing to send",
  sending: "Handing off to mail server",
  accepted: "Accepted by mail server",
  failed: "Failed",
  uncertain: "Delivery outcome unknown",
  cancelled: "Cancelled",
};
const codes: Record<string, string> = {
  smtp_accepted:
    "The SMTP server accepted the message. Inbox delivery is not confirmed.",
  smtp_temporary:
    "The mail server temporarily refused this attempt. A bounded retry is scheduled.",
  smtp_rejected:
    "The mail server rejected the message. Review the recipient and transport before retrying.",
  smtp_auth:
    "The mail service could not authenticate. An operator must fix the sender configuration.",
  smtp_connect:
    "A confirmed pre-send connection failure occurred. A bounded retry is scheduled.",
  smtp_unknown: "The message may have been sent, but its outcome is not known.",
  smtp_timeout: "The handoff timed out; the message may have been sent.",
  handoff_receipt_missing:
    "The sender stopped before recording a receipt. The message may have been sent.",
  lease_expired_before_handoff:
    "The worker did not start sending before its lease expired.",
  invitation_no_longer_sendable:
    "The invitation expired, was finalized or the sender no longer has the required authority.",
  render_unavailable:
    "The invitation key or message configuration must be restored before retrying.",
  manager_cancelled: "An authorized manager cancelled this queued delivery.",
  begin_unavailable:
    "The worker could not confirm the start. No SMTP message was sent by that attempt.",
  handoff_spacing: "Waiting to avoid overlapping or closely spaced messages.",
};
function explanation(row: Delivery) {
  if (row.state === "failed" && row.attempt_count >= 5) {
    return "Automatic attempts are exhausted. No further automatic retry is scheduled; an authorized sender must review a new delivery.";
  }
  return row.last_code
    ? (codes[row.last_code] ??
      "Review this delivery with the service operator.")
    : "";
}
function problem(cause: unknown) {
  const code = (cause as { code?: string })?.code;
  return ({
    mail_uncertainty_review_required:
      "Review the unknown delivery and acknowledge the possible duplicate before explicitly replacing it.",
    mail_schedule_too_close:
      "Schedule this message at least one minute away from another delivery for this invitation.",
    mail_handoff_already_started:
      "Sending already started. You cannot cancel that handoff; revoke the invitation to prevent acceptance.",
    mail_revision_conflict:
      "This delivery changed. Refresh its status before changing it.",
    mail_retry_source_required:
      "Refresh and select a failed or unknown delivery to replace.",
    invitation_mail_limit:
      "This invitation reached its active or daily mail limit. Review queued messages before adding more.",
  } as Record<string, string>)[code ?? ""] ?? invitationProblem(cause);
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
    setError(problem(cause));
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
        "Delivery request recorded. Refresh the history to check what happened; queueing is not proof of inbox delivery.",
      );
      setCancel(null);
      setAck(false);
      setDuplicate(false);
      await load();
    } catch (cause) {
      fail(cause);
      if (live.current && committed) {
        setNotice("The request was recorded. Refresh delivery history.");
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
        Email & reminders for {invitation.recipient_email}
      </h3>
      <p>
        Messages go only to this invitation’s recipient and contain its pinned
        role. Mail-server acceptance is not confirmation of inbox delivery.
        Delivery status notifications and inbox placement require separate
        provider verification.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p role="status" className="notice">{notice}</p>}
      {pending && (
        <section>
          <h4>Saved email request needs a receipt</h4>
          <p>
            This may already be recorded. Retry the encrypted request before
            creating another delivery.
          </p>
          <button disabled={busy} onClick={() => void mutate()}>
            Retry saved email request
          </button>
        </section>
      )}
      {canSend && !denied
        ? (
          <form onSubmit={queue}>
            <h4>Send or schedule an invitation</h4>
            <label>
              Message type<select
                value={kind}
                disabled={locked}
                onChange={(e) => {
                  setKind(e.target.value);
                  setAck(false);
                }}
              >
                <option value="invitation">Invitation</option>
                <option value="reminder">Reminder</option>
              </select>
            </label>
            <label>
              Email language<select
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
              Delivery timing<select
                value={schedule}
                disabled={locked}
                onChange={(e) => {
                  setSchedule(e.target.value);
                  setAck(false);
                }}
              >
                <option value="now">Queue now</option>
                <option value="scheduled">Schedule for later</option>
              </select>
            </label>
            {schedule === "scheduled" && (
              <label>
                Scheduled email time<input
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
              Scheduled times use your device’s timezone and must precede the
              invitation deadline. Reminders are cancelled at handoff if the
              invitation is no longer pending or the sender lost authority.
            </p>
            <label>
              Replace a failed or unknown delivery (optional)<select
                value={source}
                disabled={locked}
                onChange={(e) => {
                  setSource(e.target.value);
                  setAck(false);
                  setDuplicate(false);
                }}
              >
                <option value="">New message, not a replacement</option>
                {rows.filter((row) =>
                  ["failed", "uncertain"].includes(row.state) &&
                  !rows.some((child) => child.retry_of === row.id)
                ).map((row) => (
                  <option key={row.id} value={row.id}>
                    {states[row.state]} ·{" "}
                    {new Date(row.send_after).toLocaleString()} ·{" "}
                    {row.id.slice(0, 8)}
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
                />The earlier message may already have been sent. I accept the
                risk of sending a duplicate.
              </label>
            )}
            <label>
              Email delivery reason<textarea
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
              />I reviewed the recipient, pinned invitation, language and
              delivery time.
            </label>
            <button
              disabled={locked || !ack ||
                (selected?.state === "uncertain" && !duplicate)}
            >
              {schedule === "now"
                ? "Queue invitation email"
                : "Schedule invitation email"}
            </button>
          </form>
        )
        : (
          <p>
            Only the original sender may queue mail for a pending, unexpired
            invitation. History remains available to current managers.
          </p>
        )}
      <h4>Delivery history</h4>
      <button
        className="quiet"
        disabled={busy || !ready}
        onClick={() => void refresh()}
      >
        Refresh email delivery
      </button>
      {!rows.length && !denied && <p>No email deliveries on this page.</p>}
      <ul className="records">
        {rows.map((row) => (
          <li key={row.id}>
            <strong>{states[row.state]}</strong>
            <span>
              {row.kind} · {row.locale} ·{" "}
              {new Date(row.send_after).toLocaleString()} · attempts{" "}
              {row.attempt_count}/5
            </span>
            {row.last_code && (
              <p>
                {explanation(row)}
              </p>
            )}
            {row.state === "queued" && row.attempt_count > 0 && (
              <p>
                Next eligible attempt:{" "}
                {new Date(row.next_attempt_at).toLocaleString()}
              </p>
            )}
            {row.retry_of && (
              <p>
                This is an explicitly requested replacement. The earlier
                delivery remains in history.
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
                Review email cancellation
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
          Load more email deliveries
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
          <h4>Cancel a queued email</h4>
          <p>
            This stops only a handoff that has not started. It does not revoke
            the invitation or recall an accepted email.
          </p>
          <label>
            Email cancellation reason<textarea
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
            />I reviewed the queued delivery to cancel.
          </label>
          <button disabled={locked || !cancelAck}>Cancel queued email</button>
        </form>
      )}
      <button type="button" className="quiet" disabled={busy} onClick={close}>
        Close email delivery
      </button>
    </section>
  );
}
