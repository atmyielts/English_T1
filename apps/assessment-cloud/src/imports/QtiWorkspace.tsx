import { useEffect, useRef, useState } from "react";
import { qtiConfigured } from "../../../../packages/assessment-web/src/qti";
import {
  type PreparedQtiSource,
  prepareQtiSource,
} from "../../../../packages/assessment-web/src/qti-source";
import type { Row } from "../../../../packages/assessment-web/src/client";
import { useQti } from "./use-qti";
import { QtiReview } from "./QtiReview";
import { QtiHistory } from "./QtiHistory";
export function QtiWorkspace(
  props: {
    tenant: string;
    actor: string;
    banks: Row[];
    openImport(id: string): void;
  },
) {
  if (!qtiConfigured) {
    return (
      <section>
        <h2>QTI test packages</h2>
        <p>
          QTI package processing is not enabled in this environment. CSV and
          Schood JSON imports remain available above.
        </p>
      </section>
    );
  }
  return <ConnectedQtiWorkspace {...props} />;
}
function ConnectedQtiWorkspace(
  { tenant, actor, banks, openImport }: {
    tenant: string;
    actor: string;
    banks: Row[];
    openImport(id: string): void;
  },
) {
  const model = useQti(tenant, actor),
    [bank, setBank] = useState(""),
    [source, setSource] = useState<PreparedQtiSource | null>(null),
    [preparing, setPreparing] = useState(false),
    [fileError, setFileError] = useState("");
  const selection = useRef(0);
  useEffect(() => () => {
    selection.current++;
  }, []);
  useEffect(() => {
    if (!model.allowed) {
      selection.current++;
      setSource(null);
    }
  }, [model.allowed]);
  const disabled = model.busy || model.pending || !model.ready ||
    !model.allowed || preparing;
  async function choose(file?: File) {
    const version = ++selection.current;
    setSource(null);
    setFileError("");
    if (!file) return;
    setPreparing(true);
    try {
      const value = await prepareQtiSource(file, bank, () => {
        model.active();
        if (selection.current !== version) {
          throw new Error("File selection changed.");
        }
      });
      if (selection.current === version) setSource(value);
    } catch (cause) {
      if (selection.current === version) {
        setFileError(
          cause instanceof Error
            ? cause.message
            : "Could not prepare the package.",
        );
      }
    } finally {
      if (selection.current === version) setPreparing(false);
    }
  }
  if (!model.allowed) {
    return (
      <section>
        <h2>QTI access changed</h2>
        <p role="alert">{model.error}</p>
        <p>
          Reopen this institution after question-bank permissions are restored.
        </p>
      </section>
    );
  }
  return (
    <div className="bank-imports qti-workspace">
      <section aria-labelledby="qti-heading">
        <h2 id="qti-heading">QTI test packages</h2>
        <p>
          Upload a QTI ZIP package, review its proposed questions and answer
          keys, then adopt it into your own question bank. Unsupported content
          is shown explicitly; nothing in the package is executed.
        </p>
        <p>
          Maximum 64 MiB. Package bytes are kept in memory only on this device.
          After closing or reloading, select the identical file to resume an
          unfinished upload.
        </p>
        {(model.error || fileError) && (
          <p className="error" role="alert">{model.error || fileError}</p>
        )}
        {!model.ready && (
          <p role="status">Opening secure package request recovery…</p>
        )}
        {model.pending && (
          <div role="status">
            <p>
              A saved package request needs its canonical receipt. Retry it
              before making another change.
            </p>
            <button
              disabled={model.busy}
              onClick={() => void model.run(() => model.command())}
            >
              Retry saved QTI request
            </button>
          </div>
        )}
        <fieldset disabled={disabled}>
          <label>
            QTI destination question bank<select
              value={bank}
              onChange={(event) => {
                selection.current++;
                setBank(event.target.value);
                setSource(null);
                setFileError("");
              }}
            >
              <option value="">Choose a bank</option>
              {banks.map((row) => (
                <option key={row.id} value={row.id}>{String(row.title)}</option>
              ))}
            </select>
          </label>
          <label>
            QTI package file<input
              type="file"
              accept=".zip,application/zip"
              disabled={!bank}
              onChange={(event) => void choose(event.target.files?.[0])}
            />
          </label>
          {source && (
            <>
              <p>
                {source.manifest.filename} ·{" "}
                {source.manifest.byte_length.toLocaleString()} bytes ·{" "}
                {source.manifest.parts.length} upload parts
              </p>
              <button
                onClick={() => void model.run(() => model.upload(source))}
              >
                Upload QTI package for review
              </button>
            </>
          )}
          {source && model.job?.state === "uploading" &&
            model.job.created_by === actor && (
            <button
              className="quiet"
              onClick={() =>
                void model.run(() => model.upload(source, model.job!))}
            >
              Resume selected package upload
            </button>
          )}
        </fieldset>
        {preparing && <p role="status">Checking package identity…</p>}
        {model.progress && <p role="status">{model.progress}</p>}
      </section>
      <QtiHistory
        jobs={model.jobs}
        ready={model.ready}
        disabled={disabled}
        more={model.more}
        refresh={() => void model.run(model.refresh)}
        open={(id) => void model.run(() => model.open(id))}
        loadMore={() => void model.run(model.loadMore)}
      />
      {model.job && (
        <QtiReview
          key={`${model.job.id}:${model.job.revision}:${model.job.review_hash}`}
          job={model.job}
          disabled={disabled}
          send={(action, data) =>
            void model.run(() => model.command(action, data))}
          more={() =>
            void model.run(() =>
              model.open(model.job!.id, model.job!.rows.at(-1)?.line ?? 0)
            )}
          openImport={openImport}
        />
      )}
    </div>
  );
}
