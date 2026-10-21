import React, { useEffect, useRef, useState } from "react";
import { AnswerFileStore } from "../../../packages/assessment-web/src/answer-file-store";
import { AcademicUploadRecovery } from "./AcademicUploadRecovery";
import { useAppT } from "./i18n/index.ts";
import { errorText } from "../../../packages/assessment-web/src/i18n/errors.ts";
/** Recovery is independently reachable after reload/flag shutdown without
 * calling attempt.start. No academic selection or new admission exists here. */
export function AcademicDeviceRecovery(
  { tenant, actor }: { tenant: string; actor: string },
) {
  const t = useAppT();
  const [attempts, setAttempts] = useState<{ id: string; pending: number }[]>(
      [],
    ),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    generation = useRef(0);
  async function refresh() {
    const version = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const ids = await AnswerFileStore.savedAttempts(tenant, actor),
        results = [];
      for (const id of ids) {
        const store = await AnswerFileStore.create(tenant, actor, id);
        try {
          const files = await store.files(),
            pending = files.filter((file) =>
              file.phase === "sealed" && !file.upload?.completed
            ).length;
          if (pending) {
            results.push({ id, pending });
          }
        } finally {
          store.close();
        }
      }
      if (generation.current === version) setAttempts(results);
    } catch (cause) {
      if (generation.current === version) {
        setError(errorText(cause, t, "exam.deviceRecovery.failed"));
      }
    } finally {
      if (generation.current === version) setBusy(false);
    }
  }
  useEffect(() => {
    setAttempts([]);
    setSelected("");
    void refresh();
    return () => {
      generation.current++;
    };
  }, [tenant, actor]);
  if (!attempts.length && !error) return null;
  return (
    <section
      className="runtime-status"
      aria-labelledby="academic-device-recovery-heading"
    >
      <h2 id="academic-device-recovery-heading">
        {t("exam.deviceRecovery.title")}
      </h2>
      <p>{t("exam.deviceRecovery.intro")}</p>
      {error && <p role="alert" className="error">{error}</p>}
      <ul className="records">
        {attempts.map((attempt, index) => (
          <li key={attempt.id}>
            <strong>{t("exam.deviceRecovery.item", { position: index + 1 })}</strong>
            <span>
              {t("exam.deviceRecovery.pending", { count: attempt.pending })}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => setSelected(attempt.id)}
            >
              {t("exam.deviceRecovery.open")}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="quiet"
        disabled={busy}
        onClick={() => void refresh()}
      >
        {t("exam.deviceRecovery.refresh")}
      </button>
      {selected && (
        <AcademicUploadRecovery
          key={`${tenant}:${actor}:${selected}`}
          tenant={tenant}
          actor={actor}
          attempt={selected}
        />
      )}
    </section>
  );
}
