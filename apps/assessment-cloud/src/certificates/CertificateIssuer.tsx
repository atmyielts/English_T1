import { type FormEvent, useState } from "react";
import type {
  CertificateProgram,
  CertificateResult,
} from "../../../../packages/assessment-web/src/certificates";
export function CertificateIssuer({
  programs,
  results,
  disabled,
  send,
}: {
  programs: CertificateProgram[];
  results: CertificateResult[];
  disabled: boolean;
  send: (action: string, data: Record<string, unknown>) => Promise<boolean>;
}) {
  const [program, setProgram] = useState(""),
    [score, setScore] = useState(""),
    [ack, setAck] = useState(false),
    result = results.find((row) => row.score_revision_id === score),
    policy = programs.find((row) =>
      row.id === program && row.approved_by && !row.retirement
    );
  async function issue(event: FormEvent) {
    event.preventDefault();
    if (!result || !policy || !ack) return;
    if (
      await send("certificate.issue", {
        program_id: policy.id,
        attempt_id: result.attempt_id,
        score_revision_id: result.score_revision_id,
      })
    ) {
      setAck(false);
      setScore("");
    }
  }
  return (
    <section>
      <h2>Issue from a released result</h2>
      <p>
        The service uses the institution and candidate’s recorded names, checks
        the current released generation against the approved threshold, and
        rejects pending appeals/regrading. It does not edit grades.
      </p>
      <form onSubmit={(event) => void issue(event)}>
        <label>
          Approved program<select
            required
            value={program}
            onChange={(event) => {
              setProgram(event.target.value);
              setAck(false);
            }}
            disabled={disabled}
          >
            <option value="">Choose a program</option>
            {programs.filter((row) => row.approved_by && !row.retirement).map((
              row,
            ) => (
              <option key={row.id} value={row.id}>
                {row.title} · Minimum {row.minimum_percent}%
              </option>
            ))}
          </select>
        </label>
        <label>
          Released candidate result<select
            required
            value={score}
            onChange={(event) => {
              setScore(event.target.value);
              setAck(false);
            }}
            disabled={disabled}
          >
            <option value="">Choose a released result</option>
            {results.map((row) => (
              <option key={row.score_revision_id} value={row.score_revision_id}>
                {row.candidate} · {row.exam} · Generation {row.generation}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={ack}
            onChange={(event) => setAck(event.target.checked)}
            disabled={disabled}
          />I reviewed the recipient, approved criteria and released result, and
          authorize this institution’s certificate.
        </label>
        <button disabled={disabled || !policy || !result || !ack}>
          Issue signed certificate
        </button>
      </form>
    </section>
  );
}
