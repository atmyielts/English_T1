import { type FormEvent, useState } from "react";
import type {
  CertificateProgram,
  CertificateResult,
} from "../../../../packages/assessment-web/src/certificates";
import { useAppT } from "../i18n/index.ts";
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
  const t = useAppT();
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
      <h2>{t("issuer.title")}</h2>
      <p>
        {t("issuer.lead")}
      </p>
      <form onSubmit={(event) => void issue(event)}>
        <label>
          {t("issuer.program")}<select
            required
            value={program}
            onChange={(event) => {
              setProgram(event.target.value);
              setAck(false);
            }}
            disabled={disabled}
          >
            <option value="">{t("issuer.chooseProgram")}</option>
            {programs.filter((row) => row.approved_by && !row.retirement).map((
              row,
            ) => (
              <option key={row.id} value={row.id}>
                {t("issuer.programOption", { title: row.title, minimum: String(row.minimum_percent) })}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("issuer.result")}<select
            required
            value={score}
            onChange={(event) => {
              setScore(event.target.value);
              setAck(false);
            }}
            disabled={disabled}
          >
            <option value="">{t("issuer.chooseResult")}</option>
            {results.map((row) => (
              <option key={row.score_revision_id} value={row.score_revision_id}>
                {t("issuer.resultOption", { candidate: row.candidate, exam: row.exam, generation: String(row.generation) })}
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
          />{t("issuer.ack")}
        </label>
        <button disabled={disabled || !policy || !result || !ack}>
          {t("issuer.issue")}
        </button>
      </form>
    </section>
  );
}
