import { type FormEvent, useEffect, useState } from "react";
import { request } from "../../../../packages/assessment-web/src/client";
import { appealProblem } from "../../../../packages/assessment-web/src/appeals";
import type { useAppeals } from "../../../../packages/assessment-web/src/use-appeals";
import { useAppT } from "../i18n/index.ts";
interface Policy {
  filing_days: number | null;
  escalation_days: number | null;
  revision: number;
  can_edit: boolean;
}
const field = (value: number | null) => value === null ? "" : String(value);
const limit = (value: string) => value.trim() ? Number(value) : null;
/** Institution-wide appeal deadlines: how long candidates may file and escalate. */
export function AppealPolicyPanel(
  { tenant, actor, state }: {
    tenant: string;
    actor: string;
    state: ReturnType<typeof useAppeals>;
  },
) {
  const t = useAppT();
  const [policy, setPolicy] = useState<Policy | null>(null),
    [filing, setFiling] = useState(""),
    [escalation, setEscalation] = useState(""),
    [problem, setProblem] = useState("");
  async function load() {
    try {
      const next = await request<Policy>(
        "appeals/policy",
        tenant,
        undefined,
        undefined,
        undefined,
        actor,
      );
      setPolicy(next);
      setFiling(field(next.filing_days));
      setEscalation(field(next.escalation_days));
      setProblem("");
    } catch (cause) {
      setProblem(appealProblem(cause));
    }
  }
  useEffect(() => {
    void load();
  }, [tenant, actor]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!policy) return;
    if (
      await state.send("appeal.policy.set", {
        expected_revision: policy.revision,
        filing_days: limit(filing),
        escalation_days: limit(escalation),
      })
    ) await load();
  }
  if (!policy) {
    return problem ? <p role="alert">{problem}</p> : null;
  }
  const describe = (value: number | null) =>
    value === null ? t("appeals.policy.none") : t("appeals.policy.days", {
      count: value,
    });
  const disabled = state.busy || !!state.pending || !state.commandReady;
  return (
    <section className="appeal-policy" aria-labelledby="appeal-policy-title">
      <h3 id="appeal-policy-title">{t("appeals.policy.title")}</h3>
      {problem && <p role="alert">{problem}</p>}
      {policy.can_edit
        ? (
          <form onSubmit={(event) => void save(event)}>
            <label>
              {t("appeals.policy.filing")}
              <span className="hint">{t("appeals.policy.hint")}</span>
              <input
                type="number"
                min={1}
                max={365}
                step={1}
                value={filing}
                onChange={(event) => setFiling(event.target.value)}
                disabled={disabled}
              />
            </label>
            <label>
              {t("appeals.policy.escalation")}
              <span className="hint">{t("appeals.policy.hint")}</span>
              <input
                type="number"
                min={1}
                max={365}
                step={1}
                value={escalation}
                onChange={(event) => setEscalation(event.target.value)}
                disabled={disabled}
              />
            </label>
            <button
              disabled={disabled ||
                (filing === field(policy.filing_days) &&
                  escalation === field(policy.escalation_days))}
            >
              {t("appeals.policy.save")}
            </button>
          </form>
        )
        : (
          <dl>
            <div>
              <dt>{t("appeals.policy.filing")}</dt>
              <dd>{describe(policy.filing_days)}</dd>
            </div>
            <div>
              <dt>{t("appeals.policy.escalation")}</dt>
              <dd>{describe(policy.escalation_days)}</dd>
            </div>
          </dl>
        )}
    </section>
  );
}
