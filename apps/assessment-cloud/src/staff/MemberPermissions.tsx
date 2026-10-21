import { useEffect,useRef,useState, type FormEvent } from "react";
import {
  staffLabels,
  type StaffCapability,
} from "../../../../packages/assessment-core/src/staff";
import type {
  StaffAccess,
  StaffDetail,
  StaffMember,
  StaffRole,
} from "../../../../packages/assessment-web/src/staff";
import { MemberAccess } from "./MemberAccess";
export function MemberPermissions({
  member,
  detail,
  roles,
  access,
  actor,
  busy,
  submit,
}: {
  member: StaffMember;
  detail: StaffDetail;
  roles: StaffRole[];
  access: StaffAccess;
  actor: string;
  busy: boolean;
  submit: (action: string, data: Record<string, unknown>) => Promise<boolean>;
}) {
  const heading=useRef<HTMLHeadingElement>(null);useEffect(()=>{heading.current?.focus();},[member.id,member.membership_revision]);
  const [cap, setCap] = useState<StaffCapability | " ">(
      access.delegable[0] ?? " ",
    ),
    [roleId, setRoleId] = useState(""),
    [expires, setExpires] = useState(""),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const readonly = member.inherited || member.id === actor,
    expiry = () => (expires ? new Date(expires).toISOString() : null);
  const form = (work: () => Promise<unknown>) => (event: FormEvent) => {
    event.preventDefault();
    void work();
  };
  const canChange = (caps: StaffCapability[]) =>
    !readonly && caps.every((value) => access.delegable.includes(value));
  const active = member.status === "active",
    selectedRole = roles.find((row) => row.id === roleId),
    existing = selectedRole
      ? detail.roles.find(
          (row) => row.role_id === selectedRole.role_id && !row.revoked_at,
        )
      : undefined;
  return (
    <section className="staff-detail">
      <h2 tabIndex={-1} ref={heading}>Permissions for {member.name}</h2>
      <p>
        Assessment staff status: {member.status} · {member.org_role === 'assessment_member' ? 'Assessment-only staff member' : `Organization role: ${member.org_role}`}
      </p>
      {readonly && (
        <p>
          {member.inherited
            ? "Permissions are inherited from the organization owner/admin role. This service does not change that membership."
            : "Another authorized manager must change your permissions."}
        </p>
      )}
      <MemberAccess key={`${member.id}:${member.membership_revision}`} member={member} actor={actor} busy={busy} submit={submit} />
      <h3>Direct assessment grants</h3>
      {!detail.grants.length&&<p>No direct assessment grants are recorded.</p>}
      <ul className="records">
        {detail.grants.map((row) => (
          <li key={row.capability}>
            <strong>{staffLabels[row.capability]}</strong>
            <span>
              Revision {row.revision} ·{" "}
              {row.revoked_at
                ? "withdrawn"
                : row.expires_at
                  ? `Expires ${new Date(row.expires_at).toLocaleString()}`
                  : "no expiry"}{" "}
              ·{" "}
              {row.effective
                ? "effective through a grant or role"
                : "not effective"}
            </span>
            {!row.revoked_at && (
              <button
                className="quiet"
                disabled={
                  busy ||
                  !confirmed ||
                  !reason.trim() ||
                  !canChange([row.capability])
                }
                onClick={() =>
                  void submit("capability.revoke", {
                    user_id: member.id,
                    capability: row.capability,
                    expected_revision: row.revision,
                    reason,
                  })
                }
              >
                Withdraw direct grant
              </button>
            )}
          </li>
        ))}
      </ul>
      <h3>Role assignment history</h3>
      {!detail.roles.length&&<p>No assessment role assignments are recorded.</p>}
      <ul className="records">
        {detail.roles.map((row) => (
          <li key={row.id}>
            <strong>
              {row.title} · version {row.version}
            </strong>
            <span>
              {row.revoked_at
                ? "withdrawn"
                : row.expires_at
                  ? `Expires ${new Date(row.expires_at).toLocaleString()}`
                  : "no expiry"}{" "}
              · revision {row.revision}
            </span>
            <p>
              {row.capabilities.map((value) => staffLabels[value]).join(" · ")}
            </p>
            {!row.revoked_at && (
              <button
                className="quiet"
                disabled={
                  busy ||
                  !confirmed ||
                  !reason.trim() ||
                  !canChange(row.capabilities)
                }
                onClick={() =>
                  void submit("role.revoke", {
                    assignment_id: row.id,
                    expected_revision: row.revision,
                    reason,
                  })
                }
              >
                Withdraw role assignment
              </button>
            )}
          </li>
        ))}
      </ul>
      {!readonly && (
        <>
          <label>
            Permission change reason
            <textarea
              disabled={busy}
              required
              maxLength={5000}
              rows={3}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setConfirmed(false);
              }}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              disabled={busy}
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            I reviewed this member and the permissions being changed.
          </label>
          {active && (
            <>
              <label>
                Permission expiry (optional)
                <input
                  type="datetime-local"
                  disabled={busy}
                  value={expires}
                  onChange={(event) => {
                    setExpires(event.target.value);
                    setConfirmed(false);
                  }}
                />
              </label>
              <form
                onSubmit={form(() =>
                  submit("capability.grant", {
                    user_id: member.id,
                    capability: cap,
                    expected_revision:
                      detail.grants.find((row) => row.capability === cap)
                        ?.revision ?? 0,
                    expires_at: expiry(),
                    reason,
                  }),
                )}
              >
                <label>
                  Assessment permission
                  <select
                    value={cap}
                    disabled={busy}
                    onChange={(event) => {
                      setCap(event.target.value as StaffCapability);
                      setConfirmed(false);
                    }}
                  >
                    {access.delegable.map((value) => (
                      <option key={value} value={value}>
                        {staffLabels[value]}
                      </option>
                    ))}
                  </select>
                </label>
                {access.authority_ends_at[cap] && (
                  <p>
                    Your authority for this permission ends{" "}
                    {new Date(access.authority_ends_at[cap]!).toLocaleString()}.
                    The grant cannot outlive it.
                  </p>
                )}
                <button
                  disabled={busy || !confirmed || !reason.trim() || cap === " "}
                >
                  Grant or renew permission
                </button>
              </form>
              <form
                onSubmit={form(() =>
                  submit("role.assign", {
                    user_id: member.id,
                    role_version_id: roleId,
                    expected_assignment_id: existing?.id ?? null,
                    expires_at: expiry(),
                    reason,
                  }),
                )}
              >
                <label>
                  Assessment role version
                  <select
                    required
                    disabled={busy}
                    value={roleId}
                    onChange={(event) => {
                      setRoleId(event.target.value);
                      setConfirmed(false);
                    }}
                  >
                    <option value="">Choose a reviewed role version</option>
                    {roles.map((row) => (
                      <option
                        key={row.id}
                        value={row.id}
                        disabled={!canChange(row.capabilities)}
                      >
                        {row.title} · version {row.version}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedRole && (
                  <p>
                    {selectedRole.capabilities
                      .map((value) => staffLabels[value])
                      .join(" · ")}
                    {existing
                      ? " This replaces the member’s current assignment of this role."
                      : ""}
                  </p>
                )}
                <button
                  disabled={
                    busy ||
                    !confirmed ||
                    !reason.trim() ||
                    !selectedRole ||
                    !canChange(selectedRole.capabilities)
                  }
                >
                  Assign reviewed role version
                </button>
              </form>
            </>
          )}
        </>
      )}
      <p>
        Withdrawals do not delete past questions, marks or audit history. A
        permission may remain effective through another role. Proctor access is
        managed separately.
      </p>
    </section>
  );
}
