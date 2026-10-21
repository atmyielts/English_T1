import { useState } from "react";
import type { StaffMember } from "../../../../packages/assessment-web/src/staff";
export function MemberAccess({ member, actor, busy, submit }: {
  member: StaffMember;
  actor: string;
  busy: boolean;
  submit(action: string, data: Record<string, unknown>): Promise<boolean>;
}) {
  const [reason, setReason] = useState(""),
    [reviewed, setReviewed] = useState(false);
  if (member.inherited || member.id === actor) return null;
  // A matched server migration is required; do not guess a legacy revision.
  if (member.membership_revision === undefined) {
    return (
      <p>
        Assessment access controls are unavailable until this service's
        membership update is installed.
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
      <h3 id="assessment-member-access">Assessment staff access</h3>
      <p role="status">
        {suspended
          ? "Assessment staff access is suspended."
          : member.status === "active"
          ? "Assessment staff access follows this member's current grants and roles."
          : "Organization membership is inactive. This service cannot reactivate it."}
      </p>
      <p>
        Suspension retains roles and history. It does not change Academy or
        Proctor access, or cancel candidate exams. Resuming restores any
        unexpired Assessment grants and roles.
      </p>
      <label>
        Reason for Assessment access change<textarea
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
        />I reviewed this member's retained Assessment permissions and the scope
        of this change.
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
          ? "Resume Assessment staff access"
          : "Suspend Assessment staff access"}
      </button>
    </div>
  );
}
