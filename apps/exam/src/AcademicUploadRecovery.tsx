import React, { useEffect, useRef, useState } from "react";
import { openAnswerFiles } from "../../../packages/assessment-web/src/answer-upload";
import type { LocalAnswerFile } from "../../../packages/assessment-web/src/answer-types";
import { useI18n } from "../../../packages/service-i18n/src/i18n.tsx";
import { useAppT } from "./i18n/index.ts";
import { errorText } from "../../../packages/assessment-web/src/i18n/errors.ts";
/** No selection or new-admission action is exposed here, even during an active
 * attempt. Late transport may recover only an existing opaque admission key. */
export function AcademicUploadRecovery(
  { tenant, actor, attempt, revision = "" }: {
    tenant: string;
    actor: string;
    attempt: string;
    revision?: string;
  },
) {
  const t = useAppT(), { number } = useI18n(), translate = useRef(t);
  translate.current = t;
  const [files, setFiles] = useState<LocalAnswerFile[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const opened = useRef<Awaited<ReturnType<typeof openAnswerFiles>> | null>(
      null,
    ),
    live = useRef(false);
  async function load() {
    const workspace = opened.current;
    if (!workspace) return;
    const rows = await workspace.store.files();
    if (live.current && opened.current === workspace) {
      setFiles(
        rows.filter((file) =>
          file.phase === "sealed" && !file.upload?.completed
        ),
      );
    }
  }
  useEffect(() => {
    let valid = true;
    live.current = true;
    setFiles([]);
    setError("");
    setNotice("");
    void openAnswerFiles(tenant, actor, attempt, () => null).then(
      async (workspace) => {
        if (!valid) {
          workspace.close();
          return;
        }
        opened.current = workspace;
        try {
          await load();
        } catch (cause) {
          if (valid) setError(errorText(cause, translate.current));
        }
      },
    ).catch((cause) => {
      if (valid) setError(errorText(cause, translate.current));
    });
    return () => {
      valid = false;
      live.current = false;
      opened.current?.close();
      opened.current = null;
    };
  }, [tenant, actor, attempt]);
  useEffect(() => {
    if (opened.current) {
      void load().catch((cause) => {
        if (live.current) setError(errorText(cause, translate.current));
      });
    }
  }, [revision]);
  async function recover(file: LocalAnswerFile) {
    if (busy || !opened.current) return;
    const workspace = opened.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await workspace.transfers.recoverUpload(file.id, (done, total) => {
        if (live.current && opened.current === workspace) {
          setNotice(
            translate.current("exam.uploadRecovery.progress", {
              percent: Math.floor(done / total * 100),
            }),
          );
        }
      });
      if (live.current && opened.current === workspace) {
        setNotice(translate.current("exam.uploadRecovery.done"));
        await load();
      }
    } catch (cause) {
      if (live.current && opened.current === workspace) {
        setError(
          errorText(cause, translate.current, "exam.uploadRecovery.failed"),
        );
      }
    } finally {
      if (live.current && opened.current === workspace) setBusy(false);
    }
  }
  if (!files.length && !error && !notice) return null;
  return (
    <section
      className="runtime-status"
      aria-labelledby="academic-upload-recovery-heading"
    >
      <h2 id="academic-upload-recovery-heading">
        {t("exam.uploadRecovery.title")}
      </h2>
      <p>{t("exam.uploadRecovery.intro")}</p>
      {error && <p role="alert" className="error">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {files.length
        ? (
          <ul className="records">
            {files.map((file) => (
              <li key={file.id}>
                <strong>{file.filename}</strong>
                <span>
                  {t("exam.uploadRecovery.file", {
                    bytes: number(file.byte_length),
                    state: t(
                      file.binding
                        ? "exam.uploadRecovery.bound"
                        : "exam.uploadRecovery.unbound",
                    ),
                  })}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void recover(file)}
                >
                  {t("exam.uploadRecovery.recover")}
                </button>
              </li>
            ))}
          </ul>
        )
        : <p>{t("exam.uploadRecovery.empty")}</p>}
      <button
        type="button"
        className="quiet"
        disabled={busy}
        onClick={() => void load().catch((cause) => setError(errorText(cause, t)))}
      >
        {t("exam.uploadRecovery.refresh")}
      </button>
    </section>
  );
}
