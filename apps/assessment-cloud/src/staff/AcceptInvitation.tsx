import { useEffect, useRef, useState } from "react";
import {
  request,
  supabase,
} from "../../../../packages/assessment-web/src/client";
import {
  type InvitationLink,
  invitationProblem as invitationProblemText,
  openInvitationCommands,
  type StaffInvitation,
} from "../../../../packages/assessment-web/src/invitations";
import type { GradeIntent } from "../../../../packages/assessment-web/src/grade-command";
import { useI18n } from "../../../../packages/service-i18n/src/i18n.tsx";
import { useAppT } from "../i18n/index.ts";
import { useStaffText } from "./staff-text";
import "./invitations.css";
export function AcceptInvitation(
  { actor, link, done }: {
    actor: string;
    link: InvitationLink;
    done: () => void;
  },
) {
  const t = useAppT(), { date } = useI18n(), staff = useStaffText(),
    invitationProblem = (cause: unknown) => invitationProblemText(cause, t);
  const [review, setReview] = useState<StaffInvitation | null>(null),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [pending, setPending] = useState<GradeIntent | null>(null),
    [accepted, setAccepted] = useState(false),
    [error, setError] = useState("");
  const live = useRef(true),
    engine = useRef<Awaited<ReturnType<typeof openInvitationCommands>> | null>(
      null,
    );
  async function preview() {
    setReview(null);
    setAck(false);
    const result = await request<StaffInvitation>(
      "invitations/preview",
      link.tenant,
      { action: "invite.preview", data: { id: link.id, token: link.token } },
      undefined,
      undefined,
      actor,
    );
    if (live.current) {
      setReview(result);
      setAccepted(result.state === "accepted");
    }
  }
  useEffect(() => {
    live.current = true;
    let opened: Awaited<ReturnType<typeof openInvitationCommands>> | undefined;
    void (async () => {
      try {
        opened = await openInvitationCommands(link.tenant, actor, true);
        if (!live.current) {
          opened.close();
          return;
        }
        engine.current = opened;
        const intent = await opened.commands.pending();
        if (live.current) setPending(intent);
        await preview();
        if (live.current) setReady(true);
      } catch (cause) {
        if (live.current) setError(invitationProblem(cause));
      }
    })();
    return () => {
      live.current = false;
      opened?.close();
      engine.current = null;
    };
  }, [actor, link.tenant, link.id, link.token]);
  async function accept(retry = false) {
    if (!engine.current) return;
    setBusy(true);
    setError("");
    try {
      if (retry) await engine.current.commands.retry();
      else if (review) {
        await engine.current.commands.execute("invite.accept", {
          id: link.id,
          token: link.token,
          review_hash: review.review_hash,
          acknowledged: ack,
        });
      } else return;
      if (live.current) {
        if (retry && pending?.data.id !== link.id) await preview();
        else {
          setAccepted(true);
          setReview(null);
          setAck(false);
        }
      }
    } catch (cause) {
      if (live.current) {
        setError(invitationProblem(cause));
        if ([401, 403].includes((cause as { status?: number }).status ?? 0)) {
          setReview(null);
        }
      }
    } finally {
      if (live.current) {
        try {
          setPending(await engine.current?.commands.pending() ?? null);
        } catch (cause) {
          setError(invitationProblem(cause));
        }
        setBusy(false);
      }
    }
  }
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      await preview();
      if (live.current) setReady(true);
    } catch (cause) {
      if (live.current) setError(invitationProblem(cause));
    } finally {
      if (live.current) setBusy(false);
    }
  }
  return (
    <main className="signin invitation-accept">
      <div className="brand">
        Schood <span>{t("app.name")}</span>
      </div>
      <h1>{t("accept.title")}</h1>
      <p>
        {t("accept.lead")}
      </p>
      {error && <p role="alert" className="error">{error}</p>}
      {pending && (
        <section>
          <h2>{t("accept.pendingTitle")}</h2>
          <p>
            {t("accept.pendingBody")}
          </p>
          {pending.data.id !== link.id && (
            <p>
              {t("accept.otherInvitation")}
            </p>
          )}
          <button disabled={busy} onClick={() => void accept(true)}>
            {t("accept.retry")}
          </button>
        </section>
      )}
      {accepted && !pending
        ? (
          <section>
            <h2>{t("accept.accepted")}</h2>
            <p>
              {t("accept.acceptedBody")}
            </p>
            <button disabled={busy} onClick={done}>
              {t("accept.open")}
            </button>
          </section>
        )
        : review && (
          <section>
            <h2>{review.institution_name ?? t("accept.institution")}</h2>
            <p>{t("accept.recipient", { email: review.recipient_email })}</p>
            <h3>{t("accept.role", { title: review.role_title, version: String(review.role_version) })}</h3>
            <ul>
              {review.capabilities.map((cap) => (
                <li key={cap}>{staff.capability(cap)}</li>
              ))}
            </ul>
            <p>{t("accept.deadline", { date: date(review.expires_at) })}</p>
            <p>
              {review.permission_expires_at
                ? t("accept.roleEnds", { date: date(review.permission_expires_at) })
                : t("accept.noExpiry")}
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={ack}
                disabled={busy || !!pending}
                onChange={(e) => setAck(e.target.checked)}
              />{t("accept.ack")}
            </label>
            <button
              disabled={!ready || busy || !!pending || !ack}
              onClick={() => void accept()}
            >
              {t("accept.submit")}
            </button>
          </section>
        )}
      {!accepted && (
        <button
          className="quiet"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {t("accept.refresh")}
        </button>
      )}
      <button
        className="quiet"
        disabled={busy}
        onClick={() => void supabase?.auth.signOut()}
      >
        {t("header.signOut")}
      </button>
    </main>
  );
}
