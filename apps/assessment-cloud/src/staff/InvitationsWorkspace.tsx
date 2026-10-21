import { type FormEvent, useEffect, useRef, useState } from "react";
import { request } from "../../../../packages/assessment-web/src/client";
import {
  invitationProblem,
  openInvitationCommands,
  type StaffInvitation,
} from "../../../../packages/assessment-web/src/invitations";
import type { GradeIntent } from "../../../../packages/assessment-web/src/grade-command";
import type {
  StaffAccess,
  StaffRole,
} from "../../../../packages/assessment-web/src/staff";
import { staffLabels } from "../../../../packages/assessment-core/src/staff";
import "./invitations.css";
import {InvitationMailPanel} from './InvitationMailPanel';
export function InvitationsWorkspace(
  { tenant, actor, roles, access }: {
    tenant: string;
    actor: string;
    roles: StaffRole[];
    access: StaffAccess;
  },
) {
  const [rows, setRows] = useState<StaffInvitation[]>([]),
    [more, setMore] = useState(false),
    [email, setEmail] = useState(""),
    [role, setRole] = useState(""),
    [expires, setExpires] = useState(""),
    [permissionExpiry, setPermissionExpiry] = useState(""),
    [reason, setReason] = useState(""),
    [ack, setAck] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [pending, setPending] = useState<GradeIntent | null>(null),
    [share, setShare] = useState<{ id: string; url: string } | null>(null),
    [revoke, setRevoke] = useState<StaffInvitation | null>(null),
    [mail, setMail] = useState<StaffInvitation | null>(null),
    [revokeReason, setRevokeReason] = useState(""),
    [revokeAck, setRevokeAck] = useState(false),
    [denied, setDenied] = useState(false);
  const live = useRef(true),
    engine = useRef<Awaited<ReturnType<typeof openInvitationCommands>> | null>(
      null,
    ),
    sequence = useRef(0);
  const selected = roles.find((value) => value.id === role),
    eligible = roles.filter((value) =>
      value.capabilities.every((cap) => access.delegable.includes(cap))
    );
  const locked = busy || !ready || !!pending || denied;
  function fail(cause: unknown) {
    if (!live.current) return;
    setError(invitationProblem(cause));
    if ([401, 403].includes((cause as { status?: number }).status ?? 0)) {
      sequence.current++;
      setRows([]);
      setShare(null);
      setRevoke(null);
      setMail(null);
      setDenied(true);
    }
  }
  async function load(after?: string) {
    const seq = ++sequence.current;
    const result = await request<StaffInvitation[]>(
      `invitations/list?limit=50${after ? "&after=" + after : ""}`,
      tenant,
      undefined,
      undefined,
      undefined,
      actor,
    );
    if (live.current && seq === sequence.current) {
      setRows((current) => after ? [...current, ...result] : result);
      setMore(result.length === 50);
      setDenied(false);
    }
    return result;
  }
  useEffect(() => {
    live.current = true;
    let opened: Awaited<ReturnType<typeof openInvitationCommands>> | undefined;
    void (async () => {
      try {
        opened = await openInvitationCommands(tenant, actor);
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
      sequence.current++;
      opened?.close();
      engine.current = null;
    };
  }, [tenant, actor]);
  async function refresh(after?: string) {
    setBusy(true);
    setError("");
    setShare(null);
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
    setShare(null);
    let committed = false;
    try {
      if (action) await engine.current.commands.execute(action, data!);
      else await engine.current.commands.retry();
      committed = true;
      if (!live.current) return;
      setNotice(
        "Invitation change recorded. Creation alone sends no email; check email delivery separately or share a protected link.",
      );
      setRevoke(null);
      setAck(false);
      await load();
    } catch (cause) {
      fail(cause);
      if (live.current && committed) {
        setNotice(
          "The change was recorded. Refresh the invitations to see its current state.",
        );
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
  async function link(row: StaffInvitation) {
    setBusy(true);
    setShare(null);
    setError("");
    try {
      const result = await request<{ url: string }>(
        "invitations/link",
        tenant,
        { action: "invite.link", data: { id: row.id } },
        undefined,
        undefined,
        actor,
      );
      if (live.current) setShare({ id: row.id, url: result.url });
    } catch (cause) {
      fail(cause);
    } finally {
      if (live.current) setBusy(false);
    }
  }
  function create(event: FormEvent) {
    event.preventDefault();
    if (!selected || !expires) return;
    void mutate("invite.create", {
      id: crypto.randomUUID(),
      recipient_email: email,
      role_version_id: selected.id,
      expires_at: new Date(expires).toISOString(),
      permission_expires_at: permissionExpiry
        ? new Date(permissionExpiry).toISOString()
        : null,
      reason,
      acknowledged: ack,
    });
  }
  return (
    <section
      className="invitations-workspace"
      aria-labelledby="invitations-heading"
    >
      <h2 id="invitations-heading">Staff invitations</h2>
      <p>
        Invite staff to Assessment Cloud only. Recipients need a Schood account
        with a verified email. These invitations do not add Academy or Proctor
        access.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p role="status" className="notice">{notice}</p>}
      {pending && (
        <section>
          <h3>Saved invitation request needs a receipt</h3>
          <p>
            It may already be recorded. Retry the encrypted request before
            making another invitation change.
          </p>
          <button disabled={busy} onClick={() => void mutate()}>
            Retry saved invitation request
          </button>
        </section>
      )}
      {!denied && (
        <form onSubmit={create}>
          <h3>Invite an Assessment staff member</h3>
          <label>
            Recipient email<input
              type="email"
              required
              maxLength={254}
              value={email}
              disabled={locked}
              onChange={(e) => {
                setEmail(e.target.value);
                setAck(false);
              }}
            />
          </label>
          <label>
            Invitation role version<select
              required
              disabled={locked}
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setAck(false);
              }}
            >
              <option value="">Choose a reviewed role version</option>
              {eligible.map((value) => (
                <option key={value.id} value={value.id}>
                  {value.title} · version {value.version}
                </option>
              ))}
            </select>
          </label>
          {!eligible.length && (
            <p>
              Create a role you are authorized to delegate, or load more role
              versions above.
            </p>
          )}
          {selected && (
            <div>
              <p>
                The invitation pins version{" "}
                {selected.version}; later role revisions will not change it.
              </p>
              <ul>
                {selected.capabilities.map((cap) => (
                  <li key={cap}>
                    {staffLabels[cap]}
                    {access.authority_ends_at[cap] && (
                      <>
                        · your authority ends{" "}
                        {new Date(access.authority_ends_at[cap]!)
                          .toLocaleString()}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <label>
            Invitation expires<input
              type="datetime-local"
              required
              value={expires}
              disabled={locked}
              onChange={(e) => {
                setExpires(e.target.value);
                setAck(false);
              }}
            />
          </label>
          <p>
            Choose a future time within 30 days. This is the acceptance
            deadline, not the role’s lifetime.
          </p>
          <label>
            Role access expires (optional)<input
              type="datetime-local"
              value={permissionExpiry}
              disabled={locked}
              onChange={(e) => {
                setPermissionExpiry(e.target.value);
                setAck(false);
              }}
            />
          </label>
          <p>
            Leave blank only for ongoing access you are authorized to delegate.
            A role expiry must not precede the invitation deadline.
          </p>
          <label>
            Invitation reason<textarea
              required
              maxLength={5000}
              value={reason}
              disabled={locked}
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
            />I reviewed the recipient, pinned role permissions and both expiry
            times.
          </label>
          <button disabled={locked || !ack || !selected}>
            Create staff invitation
          </button>
        </form>
      )}
      <h3>Invitation history</h3>
      <button
        className="quiet"
        disabled={busy || !ready}
        onClick={() => void refresh()}
      >
        Refresh invitations
      </button>
      {!rows.length && !denied && (
        <p>
          No invitations on this page. Creating one does not send email
          automatically.
        </p>
      )}
      <ul className="records">
        {rows.map((row) => (
          <li key={row.id}>
            <strong>{row.recipient_email}</strong>
            <span>
              {row.role_title} · version {row.role_version} · {row.state}
            </span>
            <span>Accept by {new Date(row.expires_at).toLocaleString()}</span>
            {import.meta.env.VITE_ASSESSMENT_INVITATION_MAIL_ENABLED==='true'&&<button className="quiet" disabled={locked} onClick={()=>{setMail(row);setRevoke(null);setShare(null);}}>Email & reminders</button>}
            {row.state === "pending" && (
              <>
                {row.created_by === actor && (
                  <button
                    className="quiet"
                    disabled={locked}
                    onClick={() => void link(row)}
                  >
                    Get protected share link
                  </button>
                )}
                <button
                  className="quiet"
                  disabled={locked}
                  onClick={() => {
                    setRevoke(row);
                    setRevokeReason("");
                    setRevokeAck(false);
                    setShare(null);
                  }}
                >
                  Review invitation revocation
                </button>
              </>
            )}
            {share?.id === row.id && (
              <div>
                <label>
                  Protected invitation link<textarea
                    readOnly
                    value={share.url}
                  />
                </label>
                <p>
                  Share only with {row.recipient_email}. Copying this link does not send email; check delivery history separately.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void navigator.clipboard.writeText(share.url).then(() => {
                      if (live.current) setNotice("Invitation link copied.");
                    }).catch(() => {
                      if (live.current) {
                        setError(
                          "Clipboard is unavailable. Select and copy the protected link.",
                        );
                      }
                    });
                  }}
                >
                  Copy invitation link
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {more && (
        <button
          disabled={locked}
          onClick={() => void refresh(rows.at(-1)?.id)}
        >
          Load more invitations
        </button>
      )}
      {mail&&<InvitationMailPanel key={`${tenant}:${actor}:${mail.id}`} actor={actor} tenant={tenant} invitation={rows.find(row=>row.id===mail.id)??mail} blocked={locked} close={()=>setMail(null)}/>}
      {revoke && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void mutate("invite.revoke", {
              id: revoke.id,
              expected_revision: revoke.revision,
              reason: revokeReason,
            });
          }}
        >
          <h3>Revoke invitation for {revoke.recipient_email}</h3>
          <p>
            This prevents acceptance of this pending invitation. It does not
            remove an already accepted role.
          </p>
          <label>
            Invitation revocation reason<textarea
              required
              disabled={locked}
              value={revokeReason}
              maxLength={5000}
              onChange={(e) => {
                setRevokeReason(e.target.value);
                setRevokeAck(false);
              }}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={revokeAck}
              disabled={locked}
              onChange={(e) => setRevokeAck(e.target.checked)}
            />I reviewed the pending invitation to revoke.
          </label>
          <button disabled={locked || !revokeAck}>
            Revoke staff invitation
          </button>
          <button
            type="button"
            className="quiet"
            disabled={locked}
            onClick={() => setRevoke(null)}
          >
            Cancel revocation
          </button>
        </form>
      )}
    </section>
  );
}
