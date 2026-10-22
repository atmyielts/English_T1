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
import { useI18n } from "../../../../packages/service-i18n/src/i18n.tsx";
import { useAppT } from "../i18n/index.ts";
import { useStaffText } from "./staff-text";
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
  const t = useAppT(), { date } = useI18n(), staff = useStaffText();
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
    setError(invitationProblem(cause, t));
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
        t("invites.recorded"),
      );
      setRevoke(null);
      setAck(false);
      await load();
    } catch (cause) {
      fail(cause);
      if (live.current && committed) {
        setNotice(
          t("invites.recordedRefresh"),
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
      <h2 id="invitations-heading">{t("invites.title")}</h2>
      <p>
        {t("invites.lead")}
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p role="status" className="notice">{notice}</p>}
      {pending && (
        <section>
          <h3>{t("invites.pendingTitle")}</h3>
          <p>
            {t("invites.pendingBody")}
          </p>
          <button disabled={busy} onClick={() => void mutate()}>
            {t("invites.retry")}
          </button>
        </section>
      )}
      {!denied && (
        <form onSubmit={create}>
          <h3>{t("invites.createTitle")}</h3>
          <label>
            {t("invites.email")}<input
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
            {t("invites.role")}<select
              required
              disabled={locked}
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setAck(false);
              }}
            >
              <option value="">{t("invites.chooseRole")}</option>
              {eligible.map((value) => (
                <option key={value.id} value={value.id}>
                  {t("invites.roleOption", { title: value.title, version: String(value.version) })}
                </option>
              ))}
            </select>
          </label>
          {!eligible.length && (
            <p>
              {t("invites.noRoles")}
            </p>
          )}
          {selected && (
            <div>
              <p>
                {t("invites.pins", { version: String(selected.version) })}
              </p>
              <ul>
                {selected.capabilities.map((cap) => (
                  <li key={cap}>
                    {staff.capability(cap)}
                    {access.authority_ends_at[cap] &&
                      t("invites.authorityEnds", { date: date(access.authority_ends_at[cap]!) })}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <label>
            {t("invites.expires")}<input
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
            {t("invites.expiresHint")}
          </p>
          <label>
            {t("invites.roleExpires")}<input
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
            {t("invites.roleExpiresHint")}
          </p>
          <label>
            {t("invites.reason")}<textarea
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
            />{t("invites.ack")}
          </label>
          <button disabled={locked || !ack || !selected}>
            {t("invites.create")}
          </button>
        </form>
      )}
      <h3>{t("invites.history")}</h3>
      <button
        className="quiet"
        disabled={busy || !ready}
        onClick={() => void refresh()}
      >
        {t("invites.refresh")}
      </button>
      {!rows.length && !denied && (
        <p>
          {t("invites.empty")}
        </p>
      )}
      <ul className="records">
        {rows.map((row) => (
          <li key={row.id}>
            <strong>{row.recipient_email}</strong>
            <span>
              {t("invites.rowMeta", { title: row.role_title, version: String(row.role_version), state: row.state })}
            </span>
            <span>{t("invites.acceptBy", { date: date(row.expires_at) })}</span>
            {import.meta.env.VITE_ASSESSMENT_INVITATION_MAIL_ENABLED==='true'&&<button className="quiet" disabled={locked} onClick={()=>{setMail(row);setRevoke(null);setShare(null);}}>{t("invites.mail")}</button>}
            {row.state === "pending" && (
              <>
                {row.created_by === actor && (
                  <button
                    className="quiet"
                    disabled={locked}
                    onClick={() => void link(row)}
                  >
                    {t("invites.link")}
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
                  {t("invites.reviewRevoke")}
                </button>
              </>
            )}
            {share?.id === row.id && (
              <div>
                <label>
                  {t("invites.protectedLink")}<textarea
                    readOnly
                    value={share.url}
                  />
                </label>
                <p>
                  {t("invites.shareOnly", { email: row.recipient_email })}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void navigator.clipboard.writeText(share.url).then(() => {
                      if (live.current) setNotice(t("invites.copied"));
                    }).catch(() => {
                      if (live.current) {
                        setError(
                          t("invites.clipboard"),
                        );
                      }
                    });
                  }}
                >
                  {t("invites.copy")}
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
          {t("invites.more")}
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
          <h3>{t("invites.revokeTitle", { email: revoke.recipient_email })}</h3>
          <p>
            {t("invites.revokeLead")}
          </p>
          <label>
            {t("invites.revokeReason")}<textarea
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
            />{t("invites.revokeAck")}
          </label>
          <button disabled={locked || !revokeAck}>
            {t("invites.revoke")}
          </button>
          <button
            type="button"
            className="quiet"
            disabled={locked}
            onClick={() => setRevoke(null)}
          >
            {t("invites.cancelRevoke")}
          </button>
        </form>
      )}
    </section>
  );
}
