import { useEffect,useRef,useState, type FormEvent } from "react";
import {
  type StaffCapability,
} from "../../../../packages/assessment-core/src/staff";
import { useI18n } from "../../../../packages/service-i18n/src/i18n.tsx";
import { useAppT } from "../i18n/index.ts";
import { useStaffText } from "./staff-text";
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
  const t = useAppT(), { date } = useI18n(), staff = useStaffText();
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
      <h2 tabIndex={-1} ref={heading}>{t("perm.title", { name: member.name })}</h2>
      <p>
        {t("perm.status", { status: member.status, role: member.org_role === 'assessment_member' ? t("perm.assessmentOnly") : t("perm.orgRole", { role: String(member.org_role) }) })}
      </p>
      {readonly && (
        <p>
          {member.inherited
            ? t("perm.inherited")
            : t("perm.self")}
        </p>
      )}
      <MemberAccess key={`${member.id}:${member.membership_revision}`} member={member} actor={actor} busy={busy} submit={submit} />
      <h3>{t("perm.grants")}</h3>
      {!detail.grants.length&&<p>{t("perm.noGrants")}</p>}
      <ul className="records">
        {detail.grants.map((row) => (
          <li key={row.capability}>
            <strong>{staff.capability(row.capability)}</strong>
            <span>
              {t("perm.grantMeta", { revision: String(row.revision), expiry: row.revoked_at
                ? t("perm.withdrawn")
                : row.expires_at
                  ? t("perm.expires", { date: date(row.expires_at) })
                  : t("perm.noExpiry"), effect: row.effective
                ? t("perm.effective")
                : t("perm.notEffective") })}
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
                {t("perm.withdrawGrant")}
              </button>
            )}
          </li>
        ))}
      </ul>
      <h3>{t("perm.roles")}</h3>
      {!detail.roles.length&&<p>{t("perm.noRoles")}</p>}
      <ul className="records">
        {detail.roles.map((row) => (
          <li key={row.id}>
            <strong>
              {t("perm.roleTitle", { title: row.title, version: String(row.version) })}
            </strong>
            <span>
              {t("perm.roleMeta", { expiry: row.revoked_at
                ? t("perm.withdrawn")
                : row.expires_at
                  ? t("perm.expires", { date: date(row.expires_at) })
                  : t("perm.noExpiry"), revision: String(row.revision) })}
            </span>
            <p>
              {row.capabilities.map((value) => staff.capability(value)).join(" · ")}
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
                {t("perm.withdrawRole")}
              </button>
            )}
          </li>
        ))}
      </ul>
      {!readonly && (
        <>
          <label>
            {t("perm.reason")}
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
            {t("perm.ack")}
          </label>
          {active && (
            <>
              <label>
                {t("perm.expiry")}
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
                  {t("perm.permission")}
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
                        {staff.capability(value)}
                      </option>
                    ))}
                  </select>
                </label>
                {access.authority_ends_at[cap] && (
                  <p>
                    {t("perm.authorityEnds", { date: date(access.authority_ends_at[cap]!) })}
                  </p>
                )}
                <button
                  disabled={busy || !confirmed || !reason.trim() || cap === " "}
                >
                  {t("perm.grant")}
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
                  {t("perm.roleVersion")}
                  <select
                    required
                    disabled={busy}
                    value={roleId}
                    onChange={(event) => {
                      setRoleId(event.target.value);
                      setConfirmed(false);
                    }}
                  >
                    <option value="">{t("invites.chooseRole")}</option>
                    {roles.map((row) => (
                      <option
                        key={row.id}
                        value={row.id}
                        disabled={!canChange(row.capabilities)}
                      >
                        {t("perm.roleTitle", { title: row.title, version: String(row.version) })}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedRole && (
                  <p>
                    {selectedRole.capabilities
                      .map((value) => staff.capability(value))
                      .join(" · ")}
                    {existing
                      ? t("perm.replaces")
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
                  {t("perm.assign")}
                </button>
              </form>
            </>
          )}
        </>
      )}
      <p>
        {t("perm.footer")}
      </p>
    </section>
  );
}
