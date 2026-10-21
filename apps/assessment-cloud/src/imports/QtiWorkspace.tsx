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
import { useI18n } from "../../../../packages/service-i18n/src/i18n.tsx";
import { useAppT } from "../i18n/index.ts";
export function QtiWorkspace(
  props: {
    tenant: string;
    actor: string;
    banks: Row[];
    openImport(id: string): void;
  },
) {
  const t = useAppT();
  if (!qtiConfigured) {
    return (
      <section>
        <h2>{t("qtiWorkspace.title")}</h2>
        <p>
          {t("qtiWorkspace.disabled")}
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
  const t = useAppT(), { number } = useI18n();
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
          throw new Error(t("qtiWorkspace.selectionChanged"));
        }
      });
      if (selection.current === version) setSource(value);
    } catch (cause) {
      if (selection.current === version) {
        setFileError(
          cause instanceof Error
            ? cause.message
            : t("qtiWorkspace.prepareFailed"),
        );
      }
    } finally {
      if (selection.current === version) setPreparing(false);
    }
  }
  if (!model.allowed) {
    return (
      <section>
        <h2>{t("qtiWorkspace.accessChanged")}</h2>
        <p role="alert">{model.error}</p>
        <p>
          {t("qtiWorkspace.accessRestore")}
        </p>
      </section>
    );
  }
  return (
    <div className="bank-imports qti-workspace">
      <section aria-labelledby="qti-heading">
        <h2 id="qti-heading">{t("qtiWorkspace.title")}</h2>
        <p>
          {t("qtiWorkspace.lead")}
        </p>
        <p>
          {t("qtiWorkspace.limits")}
        </p>
        {(model.error || fileError) && (
          <p className="error" role="alert">{model.error || fileError}</p>
        )}
        {!model.ready && (
          <p role="status">{t("qtiWorkspace.opening")}</p>
        )}
        {model.pending && (
          <div role="status">
            <p>
              {t("qtiWorkspace.pending")}
            </p>
            <button
              disabled={model.busy}
              onClick={() => void model.run(() => model.command())}
            >
              {t("qtiWorkspace.retry")}
            </button>
          </div>
        )}
        <fieldset disabled={disabled}>
          <label>
            {t("qtiWorkspace.bank")}<select
              value={bank}
              onChange={(event) => {
                selection.current++;
                setBank(event.target.value);
                setSource(null);
                setFileError("");
              }}
            >
              <option value="">{t("editor.chooseBank")}</option>
              {banks.map((row) => (
                <option key={row.id} value={row.id}>{String(row.title)}</option>
              ))}
            </select>
          </label>
          <label>
            {t("qtiWorkspace.file")}<input
              type="file"
              accept=".zip,application/zip"
              disabled={!bank}
              onChange={(event) => void choose(event.target.files?.[0])}
            />
          </label>
          {source && (
            <>
              <p>
                {t("qtiWorkspace.manifest", { name: source.manifest.filename, bytes: number(source.manifest.byte_length), parts: String(source.manifest.parts.length) })}
              </p>
              <button
                onClick={() => void model.run(() => model.upload(source))}
              >
                {t("qtiWorkspace.upload")}
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
              {t("qtiWorkspace.resume")}
            </button>
          )}
        </fieldset>
        {preparing && <p role="status">{t("qtiWorkspace.checking")}</p>}
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
