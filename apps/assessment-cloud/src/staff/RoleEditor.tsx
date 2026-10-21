import { useEffect,useRef,useState, type FormEvent } from "react";
import {
  STAFF_CAPABILITIES,
  staffPresets,
  type StaffCapability,
} from "../../../../packages/assessment-core/src/staff";
import type {
  StaffAccess,
  StaffRole,
} from "../../../../packages/assessment-web/src/staff";
import { useAppT } from "../i18n/index.ts";
import { useStaffText } from "./staff-text";
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
  const t = useAppT(), staff = useStaffText();
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
          ? t("role.reviseTitle", { version: String(role.version) })
          : t("role.createTitle")}
      </h2>
      <p>
        {t("role.lead")}
      </p>
      <form onSubmit={(event) => void save(event)}>
        <fieldset disabled={busy}>
          <legend>{t("role.definition")}</legend>
          <label>
            {t("role.title")}
            <input
              required
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          {!role && (
            <label>
              {t("role.preset")}
              <select
                defaultValue=""
                onChange={(event) => {
                  const preset = event.target.value;
                  setTitle(preset ? staff.preset(preset) : preset);
                  setCaps(staffPresets[preset] ?? []);
                }}
              >
                <option value="">
                  {t("role.choosePreset")}
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
                    {staff.preset(name)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <fieldset>
            <legend>{t("role.permissions")}</legend>
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
                {staff.capability(cap)}
              </label>
            ))}
          </fieldset>
          <label>
            {t("role.reason")}
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
            {t("role.save")}
          </button>
          <button
            type="button"
            className="quiet"
            disabled={busy}
            onClick={cancel}
          >
            {t("role.close")}
          </button>
        </div>
      </form>
    </section>
  );
}
