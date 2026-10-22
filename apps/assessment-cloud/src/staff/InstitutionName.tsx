import { type FormEvent, useEffect, useState } from "react";
import { request, type Row } from "../../../../packages/assessment-web/src/client";
import { useAppT, useErrorText } from "../i18n/index.ts";

/** The institution name candidates and staff see, instead of the account email. */
export function InstitutionName({ tenant, actor, current, renamed }: {
  tenant: string;
  actor: string;
  current: string;
  renamed: () => void;
}) {
  const t = useAppT(), problem = useErrorText();
  const [name, setName] = useState(current),
    [revision, setRevision] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failure, setFailure] = useState("");
  useEffect(() => {
    let active = true;
    request<Row[]>("institution-profile", tenant, undefined, undefined, undefined, actor)
      .then((rows) => {
        if (!active) return;
        setRevision(Number(rows[0]?.revision ?? 0));
        if (rows[0]?.display_name) setName(String(rows[0].display_name));
      })
      .catch((cause) => active && setFailure(problem(cause)));
    return () => { active = false; };
  }, [tenant, actor]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (revision === null) return;
    setBusy(true); setMessage(""); setFailure("");
    try {
      const result = await request<Row>("commands", tenant, { action: "institution.rename", data: { name, revision } }, undefined, undefined, actor);
      setRevision(Number(result.revision));
      setName(String(result.name));
      setMessage(t("institution.saved"));
      renamed();
    } catch (cause) {
      setFailure(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="institution-name">
      <h2>{t("institution.title")}</h2>
      <p className="hint">{t("institution.hint")}</p>
      <form onSubmit={save}>
        <label>
          {t("institution.name")}
          <input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <button disabled={busy || revision === null}>{t("institution.save")}</button>
      </form>
      {message && <p role="status">{message}</p>}
      {failure && <p role="alert" className="error">{failure}</p>}
    </section>
  );
}
