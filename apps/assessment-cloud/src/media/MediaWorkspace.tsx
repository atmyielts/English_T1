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
import { useI18n } from "../../../../packages/service-i18n/src/i18n.tsx";
import { useAppT, useErrorText } from "../i18n/index.ts";
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
  const t = useAppT(), { number } = useI18n(), problem = useErrorText();
  const mib = (bytes: number) => number(bytes / 1048576, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
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
        setError(problem(cause, "library.media.loadFailed"));
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
          if (active) setError(problem(cause));
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
            ? t("library.media.cancelled")
            : receipt.state === "quarantined"
              ? t("library.media.quarantined")
              : t("library.media.confirmed", { state: receipt.state }),
        );
        setFile(null);
        setProgress(null);
        setConfirmCancel(false);
        if (fileInput.current) fileInput.current.value = "";
        await load();
      }
    } catch (cause) {
      if (alive.current)
        setError(problem(cause, "library.media.noReceipt"));
    } finally {
      if (alive.current) {
        try {
          setPending(await session!.uploads.pending());
        } catch {
          setError(
            t("library.media.metadataFailed"),
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
        <h2>{t("library.media.title")}</h2>
        <p>
          {t("library.media.lead")}
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
          {t("library.media.refresh")}
        </button>
        {loading && <p role="status">{t("library.media.loading")}</p>}
        {!loading && !error && !rows.length && (
          <p>
            {t("library.media.empty")}
          </p>
        )}
        <ul className="records media-records">
          {rows.map((row) => (
            <li key={row.id}>
              <strong>{row.filename}</strong>
              <span>
                {t("library.media.size", { mime: row.mime, size: mib(row.byte_length) })}
              </span>
              <span className="media-state">
                {row.state === "quarantined"
                  ? t("library.media.stateQuarantined")
                  : row.state === "ready"
                    ? t("library.media.stateReady")
                    : row.state === "rejected"
                      ? t("library.media.stateRejected")
                      : row.state === "cancelled"
                        ? t("library.media.stateCancelled")
                        : t("library.media.stateIncomplete")}
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
            {t("library.media.more")}
          </button>
        )}
      </section>
      {canUpload && (
        <section className="editor">
          <h2>{pending ? t("library.media.resumeTitle") : t("library.media.uploadTitle")}</h2>
          {!mediaConfigured && (
            <p role="status">
              {t("library.media.unconfigured")}
            </p>
          )}
          {pending && (
            <div className="review-detail">
              <p>
                <strong>{pending.manifest.filename}</strong>
              </p>
              <p>
                {t("library.media.size", { mime: pending.manifest.mime, size: mib(pending.manifest.byte_length) })}
              </p>
              <p>
                {pending.cancelling
                  ? t("library.media.cancelWaiting")
                  : t("library.media.reselect")}
              </p>
            </div>
          )}
          <form onSubmit={submit}>
            <fieldset
              disabled={busy || !session || pending?.cancelling === true}
            >
              <legend>{t("library.media.source")}</legend>
              <label>
                {t("library.media.file")}
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
                {t("library.media.format")}
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
                {t("library.media.scanHint")}
              </p>
              <button disabled={!file}>
                {pending ? t("library.media.resume") : t("library.media.upload")}
              </button>
            </fieldset>
          </form>
          {progress && (
            <div role="status" className="media-progress">
              <p>
                {progress.stage === "checking"
                  ? t("library.media.checking")
                  : progress.stage === "uploading"
                    ? t("library.media.uploading")
                    : t("library.media.waiting")}{" "}
                {t("library.media.percent", { percent: String(Math.floor((progress.done / progress.total) * 100)) })}
              </p>
              <progress
                max={progress.total}
                value={progress.done}
                aria-label={
                  progress.stage === "checking"
                    ? t("library.media.checking")
                    : t("library.media.progress")
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
                  {t("library.media.cancelSaved")}
                </button>
              ) : (
                <>
                  <p>
                    {t("library.media.cancelLead")}
                  </p>
                  <button
                    type="button"
                    disabled={busy || !session}
                    onClick={() => void run(() => session!.uploads.cancel())}
                  >
                    {pending.cancelling
                      ? t("library.media.retryCancel")
                      : t("library.media.confirmCancel")}
                  </button>
                  {!pending.cancelling && (
                    <button
                      className="quiet"
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmCancel(false)}
                    >
                      {t("library.media.keep")}
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
