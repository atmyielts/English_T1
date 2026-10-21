import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ARTIFACT_MIMES,
  type ArtifactMime,
} from "../../../../packages/assessment-core/src/artifacts.ts";
import {
  artifactPage,
  mediaConfigured,
  openArtifactUploads,
  type ArtifactRow,
} from "../../../../packages/assessment-web/src/artifacts";
import type {
  UploadIntent,
  UploadProgress,
} from "../../../../packages/assessment-web/src/artifact-upload";
import "./media.css";
type Session = Awaited<ReturnType<typeof openArtifactUploads>>;
export function MediaWorkspace({
  tenant,
  actor,
  canUpload,
}: {
  tenant: string;
  actor: string;
  canUpload: boolean;
}) {
  const [rows, setRows] = useState<ArtifactRow[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null),
    [pending, setPending] = useState<UploadIntent | null>(null);
  const [file, setFile] = useState<File | null>(null),
    [mime, setMime] = useState<ArtifactMime>("image/png"),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [progress, setProgress] = useState<UploadProgress | null>(null),
    [confirmCancel, setConfirmCancel] = useState(false);
  const alive = useRef(false),
    generation = useRef(0),
    fileInput = useRef<HTMLInputElement>(null);
  async function load(after?: string) {
    const version = ++generation.current;
    setLoading(true);
    try {
      const page = await artifactPage(tenant, actor, after);
      if (alive.current && version === generation.current) {
        setRows((old) =>
          after
            ? [
                ...old,
                ...page.items.filter(
                  (row) => !old.some((previous) => previous.id === row.id),
                ),
              ]
            : page.items,
        );
        setCursor(page.next_cursor);
      }
    } catch (cause) {
      if (alive.current && version === generation.current) {
        setRows([]);
        setCursor(null);
        setError(
          cause instanceof Error
            ? cause.message
            : "The media library could not be loaded.",
        );
      }
    } finally {
      if (alive.current && version === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    let active = true,
      current: Session | undefined;
    setSession(null);
    setPending(null);
    void load();
    if (canUpload && mediaConfigured)
      void openArtifactUploads(tenant, actor)
        .then(async (value) => {
          current = value;
          if (!active) {
            value.close();
            return;
          }
          const saved = await value.uploads.pending();
          if (active) {
            setSession(value);
            setPending(saved);
          }
        })
        .catch((cause) => {
          if (active) setError(cause.message);
        });
    return () => {
      active = false;
      alive.current = false;
      generation.current++;
      current?.close();
    };
  }, [tenant, actor, canUpload]);
  async function run(work: () => Promise<{ state: string }>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const receipt = await work();
      if (alive.current) {
        setNotice(
          receipt.state === "cancelled"
            ? "Upload cancelled. Stored parts await the retention cleanup workflow."
            : receipt.state === "quarantined"
              ? "Upload received. It remains quarantined until scanning finishes."
              : `The service confirmed this artifact is ${receipt.state}.`,
        );
        setFile(null);
        setProgress(null);
        setConfirmCancel(false);
        if (fileInput.current) fileInput.current.value = "";
        await load();
      }
    } catch (cause) {
      if (alive.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "The upload did not return a confirmed receipt. Reselect the same file to resume.",
        );
    } finally {
      if (alive.current) {
        try {
          setPending(await session!.uploads.pending());
        } catch {
          setError(
            "Saved upload metadata could not be read. Reopen this workspace before retrying.",
          );
        }
        setBusy(false);
      }
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (session && file)
      void run(() =>
        session.uploads.upload(file, mime, (value) => {
          if (alive.current) setProgress(value);
        }),
      );
  }
  return (
    <div className="media-layout">
      <section>
        <h2>Protected institution media</h2>
        <p>
          Upload images, audio, video or PDFs. Only scanned, ready images and
          recordings can be attached to question prompts. A clean scan does not
          approve a question.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        <button
          type="button"
          className="quiet"
          disabled={loading || busy}
          onClick={() => {
            setError("");
            void load();
          }}
        >
          Refresh scan status
        </button>
        {loading && <p role="status">Loading media library…</p>}
        {!loading && !error && !rows.length && (
          <p>
            No media on this page. Upload a file to start building your
            institution’s library.
          </p>
        )}
        <ul className="records media-records">
          {rows.map((row) => (
            <li key={row.id}>
              <strong>{row.filename}</strong>
              <span>
                {row.mime} · {(row.byte_length / 1048576).toFixed(2)} MiB
              </span>
              <span className="media-state">
                {row.state === "quarantined"
                  ? "Quarantined — scan pending"
                  : row.state === "ready"
                    ? "Ready — scan passed"
                    : row.state === "rejected"
                      ? "Rejected — not available for use"
                      : row.state === "cancelled"
                        ? "Cancelled — not available for use"
                        : "Upload not complete"}
              </span>
            </li>
          ))}
        </ul>
        {cursor && (
          <button
            className="quiet"
            type="button"
            disabled={loading || busy}
            onClick={() => void load(cursor)}
          >
            Load more media
          </button>
        )}
      </section>
      {canUpload && (
        <section className="editor">
          <h2>{pending ? "Resume your saved upload" : "Upload media"}</h2>
          {!mediaConfigured && (
            <p role="status">
              The protected media endpoint must be configured before uploading.
            </p>
          )}
          {pending && (
            <div className="review-detail">
              <p>
                <strong>{pending.manifest.filename}</strong>
              </p>
              <p>
                {pending.manifest.mime} ·{" "}
                {(pending.manifest.byte_length / 1048576).toFixed(2)} MiB
              </p>
              <p>
                {pending.cancelling
                  ? "A cancellation is waiting for its receipt. Retry cancellation below."
                  : "Reselect the original file and format. Its complete content is checked before resuming. File bytes and credentials are not saved on this device."}
              </p>
            </div>
          )}
          <form onSubmit={submit}>
            <fieldset
              disabled={busy || !session || pending?.cancelling === true}
            >
              <legend>Source file</legend>
              <label>
                File (required, up to 2 GiB)
                <input
                  ref={fileInput}
                  type="file"
                  required
                  accept={Object.keys(ARTIFACT_MIMES).join(",")}
                  onChange={(event) => {
                    const value = event.target.files?.[0] ?? null;
                    setFile(value);
                    if (value && Object.hasOwn(ARTIFACT_MIMES, value.type))
                      setMime(value.type as ArtifactMime);
                  }}
                />
              </label>
              <label>
                File format
                <select
                  value={mime}
                  onChange={(event) =>
                    setMime(event.target.value as ArtifactMime)
                  }
                >
                  {Object.keys(ARTIFACT_MIMES).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <p className="hint">
                The scanner checks actual contents, not just the filename or
                selected format. Animated images and active/encrypted PDFs are
                not accepted.
              </p>
              <button disabled={!file}>
                {pending ? "Resume verified upload" : "Upload and scan"}
              </button>
            </fieldset>
          </form>
          {progress && (
            <div role="status" className="media-progress">
              <p>
                {progress.stage === "checking"
                  ? "Checking file identity"
                  : progress.stage === "uploading"
                    ? "Uploading verified parts"
                    : "Waiting for scan"}{" "}
                · {Math.floor((progress.done / progress.total) * 100)}%
              </p>
              <progress
                max={progress.total}
                value={progress.done}
                aria-label={
                  progress.stage === "checking"
                    ? "Checking file identity"
                    : "Upload progress"
                }
              />
            </div>
          )}
          {pending && (
            <div className="media-cancel">
              {!confirmCancel && !pending.cancelling ? (
                <button
                  className="quiet"
                  type="button"
                  disabled={busy || !session}
                  onClick={() => setConfirmCancel(true)}
                >
                  Cancel saved upload…
                </button>
              ) : (
                <>
                  <p>
                    Cancelling stops this upload; it does not immediately erase
                    stored encrypted parts. Completed media cannot be cancelled.
                  </p>
                  <button
                    type="button"
                    disabled={busy || !session}
                    onClick={() => void run(() => session!.uploads.cancel())}
                  >
                    {pending.cancelling
                      ? "Retry cancellation"
                      : "Confirm cancellation"}
                  </button>
                  {!pending.cancelling && (
                    <button
                      className="quiet"
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmCancel(false)}
                    >
                      Keep upload
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
