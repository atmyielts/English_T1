import React, { useEffect, useRef, useState } from "react";
import { openAnswerFiles } from "../../../packages/assessment-web/src/answer-upload";
import type { LocalAnswerFile } from "../../../packages/assessment-web/src/answer-types";
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
          if (valid) setError((cause as Error).message);
        }
      },
    ).catch((cause) => {
      if (valid) setError(cause.message);
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
        if (live.current) setError(cause.message);
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
            `Recovering previously admitted bytes: ${
              Math.floor(done / total * 100)
            }%. The selected answer and exam clock are unchanged.`,
          );
        }
      });
      if (live.current && opened.current === workspace) {
        setNotice(
          "Previously admitted bytes were received. Safety checks and human marking remain separate.",
        );
        await load();
      }
    } catch (cause) {
      if (live.current && opened.current === workspace) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Upload recovery failed; saved bytes remain on this device.",
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
      <h2 id="academic-upload-recovery-heading">Academic upload recovery</h2>
      <p>
        Only bytes admitted before the question deadline can be recovered here.
        This cannot select an answer, change a submitted answer or extend exam
        time.
      </p>
      {error && <p role="alert" className="error">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {files.length
        ? (
          <ul className="records">
            {files.map((file) => (
              <li key={file.id}>
                <strong>{file.filename}</strong>
                <span>
                  {file.byte_length.toLocaleString()} bytes · {file.binding
                    ? "Prior admission saved on this device"
                    : "A prior admission receipt must be recovered"}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void recover(file)}
                >
                  Recover previously admitted upload
                </button>
              </li>
            ))}
          </ul>
        )
        : <p>No sealed pending device copies are loaded for this attempt.</p>}
      <button
        type="button"
        className="quiet"
        disabled={busy}
        onClick={() => void load().catch((cause) => setError(cause.message))}
      >
        Refresh pending academic uploads
      </button>
    </section>
  );
}
