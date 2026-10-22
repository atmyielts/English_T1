import { useEffect, useState } from "react";
import { proctorRequest, type Row } from "../../../packages/assessment-web/src/client";
import { useAppT, useDateTime } from "./i18n/index.ts";

/** Webcam stills of one session, in order, through short-lived signed links. */
export function SnapshotGallery({ tenant, actor, session, interval }: { tenant: string; actor: string; session: string; interval: number }) {
  const t = useAppT(), dateTime = useDateTime();
  const [rows, setRows] = useState<Row[] | null>(null), [problem, setProblem] = useState(""), [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    // Sessions without snapshots in their policy never ask for them.
    if (interval <= 0) return;
    setProblem("");
    proctorRequest<Row[]>(`snapshots/sessions/${session}`, tenant, undefined, undefined, actor)
      .then((value) => { if (active) setRows(value); })
      .catch(() => { if (active) { setRows([]); setProblem(t("snapshots.unavailable")); } });
    return () => { active = false; };
  }, [tenant, actor, session, version, interval]);
  if (interval <= 0) return null;
  return (
    <section className="snapshot-gallery" aria-labelledby={`snapshots-${session}`}>
      <div className="record-heading">
        <h3 id={`snapshots-${session}`}>{t("snapshots.title")}</h3>
        <button type="button" className="quiet" onClick={() => setVersion((value) => value + 1)}>{t("snapshots.refresh")}</button>
      </div>
      <p className="hint">{t("snapshots.hint", { seconds: interval })}</p>
      {rows === null ? <p role="status">{t("snapshots.loading")}</p> : rows.length === 0 && !problem ? <p>{t("snapshots.none")}</p> : (
        <ul className="snapshot-grid">
          {rows.map((row) => (
            <li key={String(row.id)}>
              {row.url ? <a href={String(row.url)} target="_blank" rel="noreferrer"><img src={String(row.url)} alt={t(row.kind === "identity" ? "snapshots.identityAlt" : "snapshots.periodicAlt", { time: dateTime(String(row.captured_at)) })} loading="lazy" /></a> : <span>{t("snapshots.missing")}</span>}
              <span>{row.kind === "identity" ? t("snapshots.identity") : dateTime(String(row.captured_at))}</span>
            </li>
          ))}
        </ul>
      )}
      {problem && <p role="alert" className="error">{problem}</p>}
    </section>
  );
}
