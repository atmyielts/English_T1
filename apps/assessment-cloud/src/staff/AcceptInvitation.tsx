import { useEffect, useRef, useState } from "react";
import {
  request,
  supabase,
} from "../../../../packages/assessment-web/src/client";
import {
  type InvitationLink,
  invitationProblem,
  openInvitationCommands,
  type StaffInvitation,
} from "../../../../packages/assessment-web/src/invitations";
import type { GradeIntent } from "../../../../packages/assessment-web/src/grade-command";
import { staffLabels } from "../../../../packages/assessment-core/src/staff";
import "./invitations.css";
export function AcceptInvitation(
  { actor, link, done }: {
    actor: string;
    link: InvitationLink;
    done: () => void;
  },
) {
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
        Schood <span>Assessment Cloud</span>
      </div>
      <h1>Review your staff invitation</h1>
      <p>
        This invitation adds Assessment Cloud access only, not Academy or
        Proctor membership.
      </p>
      {error && <p role="alert" className="error">{error}</p>}
      {pending && (
        <section>
          <h2>Saved invitation acceptance needs a receipt</h2>
          <p>
            Acceptance may already be recorded. Retry the encrypted request to
            recover its original receipt.
          </p>
          {pending.data.id !== link.id && (
            <p>
              This saved acceptance belongs to another invitation at this
              institution. Recover it before accepting a different invitation.
            </p>
          )}
          <button disabled={busy} onClick={() => void accept(true)}>
            Retry saved invitation acceptance
          </button>
        </section>
      )}
      {accepted && !pending
        ? (
          <section>
            <h2>Invitation accepted</h2>
            <p>
              The invitation’s acceptance is recorded. Your current permissions
              are checked when you open the workspace; this receipt does not
              restore revoked or suspended access.
            </p>
            <button disabled={busy} onClick={done}>
              Open assessment workspace
            </button>
          </section>
        )
        : review && (
          <section>
            <h2>{review.institution_name ?? "Institution"}</h2>
            <p>Recipient: {review.recipient_email}</p>
            <h3>{review.role_title} · version {review.role_version}</h3>
            <ul>
              {review.capabilities.map((cap) => (
                <li key={cap}>{staffLabels[cap]}</li>
              ))}
            </ul>
            <p>Accept by {new Date(review.expires_at).toLocaleString()}.</p>
            <p>
              {review.permission_expires_at
                ? `Role access ends ${
                  new Date(review.permission_expires_at).toLocaleString()
                }.`
                : "Role access has no scheduled expiry. An authorized manager may suspend or withdraw it."}
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={ack}
                disabled={busy || !!pending}
                onChange={(e) => setAck(e.target.checked)}
              />I reviewed this institution, role version, permissions and
              expiry.
            </label>
            <button
              disabled={!ready || busy || !!pending || !ack}
              onClick={() => void accept()}
            >
              Accept Assessment staff invitation
            </button>
          </section>
        )}
      {!accepted && (
        <button
          className="quiet"
          disabled={busy}
          onClick={() => void refresh()}
        >
          Refresh invitation review
        </button>
      )}
      <button
        className="quiet"
        disabled={busy}
        onClick={() => void supabase?.auth.signOut()}
      >
        Sign out
      </button>
    </main>
  );
}
