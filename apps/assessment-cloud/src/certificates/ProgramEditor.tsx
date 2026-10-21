import { type FormEvent, useState } from "react";
import type { CertificateProgram } from "../../../../packages/assessment-web/src/certificates";
import { ProgramRetirement } from "./ProgramRetirement";
import { useAppT } from "../i18n/index.ts";
export function ProgramEditor(
  { programs, actor, disabled, send }: {
    programs: CertificateProgram[];
    actor: string;
    disabled: boolean;
    send: (action: string, data: Record<string, unknown>) => Promise<boolean>;
  },
) {
  const t = useAppT();
  const [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [threshold, setThreshold] = useState("70"),
    [days, setDays] = useState(""),
    [reviewed, setReviewed] = useState("");
  async function create(event: FormEvent) {
    event.preventDefault();
    if (
      await send("program.create", {
        title,
        description,
        minimum_percent: Number(threshold),
        valid_days: days ? Number(days) : null,
      })
    ) {
      setTitle("");
      setDescription("");
      setDays("");
    }
  }
  return (
    <section>
      <h2>{t("programs.title")}</h2>
      <p>
        {t("programs.lead")}
      </p>
      <ul className="records">
        {programs.map((program) => (
          <li key={program.id}>
            <h3>{program.title}</h3>
            <p>{program.description}</p>
            <span>
              {t("programs.summary", { minimum: String(program.minimum_percent), validity: program.valid_days
                ? t("programs.validity", { count: program.valid_days, days: String(program.valid_days) })
                : t("replacement.noExpiry"), state: program.retirement
                ? t("programs.retired")
                : program.approved_by
                ? t("programs.approved")
                : t("programs.awaiting") })}
            </span>
            {!program.retirement && !program.approved_by &&
              program.created_by !== actor && (
              <>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={reviewed === program.id}
                    onChange={(event) =>
                      setReviewed(event.target.checked ? program.id : "")}
                    disabled={disabled}
                  />{t("programs.ack")}
                </label>
                <button
                  disabled={disabled || reviewed !== program.id}
                  onClick={() =>
                    void send("program.approve", {
                      id: program.id,
                      review_hash: program.review_hash,
                    })}
                >
                  {t("programs.approve")}
                </button>
              </>
            )}
            {!program.retirement && !program.approved_by &&
              program.created_by === actor && (
              <p>{t("programs.ownProgram")}</p>
            )}
            <ProgramRetirement
              program={program}
              disabled={disabled}
              send={send}
            />
          </li>
        ))}
      </ul>
      <form onSubmit={(event) => void create(event)}>
        <h3>{t("programs.create")}</h3>
        <label>
          {t("programs.achievement")}<input
            required
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={disabled}
          />
        </label>
        <label>
          {t("programs.criteria")}<textarea
            required
            maxLength={2000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={disabled}
          />
        </label>
        <label>
          {t("programs.minimum")}<input
            required
            type="number"
            min={0}
            max={100}
            step="0.000001"
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            disabled={disabled}
          />
        </label>
        <label>
          {t("programs.days")}<input
            type="number"
            min={1}
            max={36500}
            step={1}
            value={days}
            onChange={(event) => setDays(event.target.value)}
            disabled={disabled}
          />
        </label>
        <button disabled={disabled || !title.trim() || !description.trim()}>
          {t("programs.submit")}
        </button>
      </form>
    </section>
  );
}
