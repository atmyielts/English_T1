import { type FormEvent, useState } from "react";
import type { CertificateProgram } from "../../../../packages/assessment-web/src/certificates";
import { ProgramRetirement } from "./ProgramRetirement";
export function ProgramEditor(
  { programs, actor, disabled, send }: {
    programs: CertificateProgram[];
    actor: string;
    disabled: boolean;
    send: (action: string, data: Record<string, unknown>) => Promise<boolean>;
  },
) {
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
      <h2>Certificate programs</h2>
      <p>
        Each program pins an achievement, award criteria, score threshold and
        expiry. Another authorized certificate manager must approve it before
        issuance.
      </p>
      <ul className="records">
        {programs.map((program) => (
          <li key={program.id}>
            <h3>{program.title}</h3>
            <p>{program.description}</p>
            <span>
              Minimum {program.minimum_percent}% · {program.valid_days
                ? `${program.valid_days} days validity`
                : "No scheduled expiry"} · {program.retirement
                ? "Retired"
                : program.approved_by
                ? "Approved"
                : "Awaiting independent approval"}
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
                  />I reviewed the achievement, criteria, threshold and expiry
                  independently.
                </label>
                <button
                  disabled={disabled || reviewed !== program.id}
                  onClick={() =>
                    void send("program.approve", {
                      id: program.id,
                      review_hash: program.review_hash,
                    })}
                >
                  Approve certificate program
                </button>
              </>
            )}
            {!program.retirement && !program.approved_by &&
              program.created_by === actor && (
              <p>Another certificate manager must approve your program.</p>
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
        <h3>Create a program</h3>
        <label>
          Achievement title<input
            required
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={disabled}
          />
        </label>
        <label>
          Award criteria<textarea
            required
            maxLength={2000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={disabled}
          />
        </label>
        <label>
          Minimum score percentage<input
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
          Validity in days (empty means no scheduled expiry)<input
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
          Create certificate program
        </button>
      </form>
    </section>
  );
}
