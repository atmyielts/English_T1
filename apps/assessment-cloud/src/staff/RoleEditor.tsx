import { useEffect,useRef,useState, type FormEvent } from "react";
import {
  STAFF_CAPABILITIES,
  staffLabels,
  staffPresets,
  type StaffCapability,
} from "../../../../packages/assessment-core/src/staff";
import type {
  StaffAccess,
  StaffRole,
} from "../../../../packages/assessment-web/src/staff";
export function RoleEditor({
  access,
  role,
  busy,
  submit,
  cancel,
}: {
  access: StaffAccess;
  role?: StaffRole;
  busy: boolean;
  submit: (action: string, data: Record<string, unknown>) => Promise<boolean>;
  cancel: () => void;
}) {
  const heading=useRef<HTMLHeadingElement>(null);useEffect(()=>{heading.current?.focus();},[]);
  const [title, setTitle] = useState(role?.title ?? ""),
    [caps, setCaps] = useState<StaffCapability[]>(role?.capabilities ?? []),
    [reason, setReason] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    if (
      await submit(role ? "role.revise" : "role.create", {
        title,
        capabilities: caps,
        reason,
        ...(role
          ? { role_id: role.role_id, expected_version: role.version }
          : {}),
      })
    )
      cancel();
  }
  return (
    <section>
      <h2 tabIndex={-1} ref={heading}>
        {role
          ? `Revise role version ${role.version}`
          : "Create an assessment role"}
      </h2>
      <p>
        Role versions are immutable. Revising a role does not change existing
        staff assignments; reassign a reviewed version explicitly.
      </p>
      <form onSubmit={(event) => void save(event)}>
        <fieldset disabled={busy}>
          <legend>Role definition</legend>
          <label>
            Role title
            <input
              required
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          {!role && (
            <label>
              Start from a role preset
              <select
                defaultValue=""
                onChange={(event) => {
                  const preset = event.target.value;
                  setTitle(preset);
                  setCaps(staffPresets[preset] ?? []);
                }}
              >
                <option value="">
                  Choose a preset or create a custom role
                </option>
                {Object.entries(staffPresets).map(([name, permissions]) => (
                  <option
                    key={name}
                    value={name}
                    disabled={
                      !permissions.every((cap) =>
                        access.delegable.includes(cap),
                      )
                    }
                  >
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <fieldset>
            <legend>Assessment permissions</legend>
            {STAFF_CAPABILITIES.map((cap) => (
              <label className="check" key={cap}>
                <input
                  type="checkbox"
                  disabled={!access.delegable.includes(cap)}
                  checked={caps.includes(cap)}
                  onChange={(event) =>
                    setCaps((current) =>
                      event.target.checked
                        ? [...current, cap]
                        : current.filter((value) => value !== cap),
                    )
                  }
                />
                {staffLabels[cap]}
              </label>
            ))}
          </fieldset>
          <label>
            Role change reason
            <textarea
              required
              maxLength={5000}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        </fieldset>
        <div className="staff-actions">
          <button disabled={busy || !caps.length}>
            Save immutable role version
          </button>
          <button
            type="button"
            className="quiet"
            disabled={busy}
            onClick={cancel}
          >
            Close role editor
          </button>
        </div>
      </form>
    </section>
  );
}
