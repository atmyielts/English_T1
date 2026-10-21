import { useState } from "react";
import type { StaffMember } from "../../../../packages/assessment-web/src/staff";
import { useAppT } from "../i18n/index.ts";
export function MemberAccess({ member, actor, busy, submit }: {
  member: StaffMember;
  actor: string;
  busy: boolean;
  submit(action: string, data: Record<string, unknown>): Promise<boolean>;
}) {
  const t = useAppT();
  const [reason, setReason] = useState(""),
    [reviewed, setReviewed] = useState(false);
  if (member.inherited || member.id === actor) return null;
  // A matched server migration is required; do not guess a legacy revision.
  if (member.membership_revision === undefined) {
    return (
      <p>
        {t("access.unavailable")}
      </p>
    );
  }
  const suspended = member.assessment_status === "suspended";
  return (
    <div
      className="staff-membership"
      role="group"
      aria-labelledby="assessment-member-access"
    >
      <h3 id="assessment-member-access">{t("access.title")}</h3>
      <p role="status">
        {suspended
          ? t("access.suspended")
          : member.status === "active"
          ? t("access.active")
          : t("access.inactive")}
      </p>
      <p>
        {t("access.lead")}
      </p>
      <label>
        {t("access.reason")}<textarea
          maxLength={5000}
          rows={3}
          disabled={busy}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setReviewed(false);
          }}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          disabled={busy}
          checked={reviewed}
          onChange={(event) => setReviewed(event.target.checked)}
        />{t("access.ack")}
      </label>
      <button
        className="quiet"
        disabled={busy || !reason.trim() || !reviewed}
        onClick={async () => {
          if (
            await submit(suspended ? "member.resume" : "member.suspend", {
              user_id: member.id,
              expected_revision: member.membership_revision,
              reason,
            })
          ) {
            setReason("");
            setReviewed(false);
          }
        }}
      >
        {suspended
          ? t("access.resume")
          : t("access.suspend")}
      </button>
    </div>
  );
}
