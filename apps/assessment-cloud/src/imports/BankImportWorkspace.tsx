import { useRef, useState } from "react";
import {
  BANK_CSV_TEMPLATE,
  exportBankRows,
  type ImportPlan,
  prepareBankImport,
} from "../../../../packages/assessment-core/src/bank-import.ts";
import { downloadBankFile } from "../../../../packages/assessment-web/src/bank-import";
import type { Row } from "../../../../packages/assessment-web/src/client";
import { useBankImports } from "./use-bank-import";
import { ImportReview } from "./ImportReview";
import { ImportHistory } from "./ImportHistory";
import { ImportFileStatus } from "./ImportFileStatus";
import { QtiWorkspace } from "./QtiWorkspace";
import "./imports.css";
import { useAppT } from "../i18n/index.ts";
export function BankImportWorkspace(
  { tenant, actor, banks, reviewDrafts }: {
    tenant: string;
    actor: string;
    banks: Row[];
    reviewDrafts: () => void;
  },
) {
  const t = useAppT();
  const model = useBankImports(tenant, actor),
    [bank, setBank] = useState(""),
    [file, setFile] = useState<
      | {
        name: string;
        format: "csv" | "json";
        source: string;
        plan: ImportPlan;
      }
      | null
    >(null),
    [localError, setLocalError] = useState("");
  const selection = useRef(0);
  const disabled = model.busy || model.pending || !model.ready ||
    !model.allowed;
  async function choose(chosen?: File) {
    const version = ++selection.current;
    setFile(null);
    setLocalError("");
    if (!chosen) return;
    try {
      if (chosen.size > 4_000_000) throw new Error(t("imports.tooLarge"));
      const format = chosen.name.toLowerCase().endsWith(".csv")
        ? "csv"
        : chosen.name.toLowerCase().endsWith(".json")
        ? "json"
        : null;
      if (!format) throw new Error(t("imports.wrongFormat"));
      const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
          .decode(await chosen.arrayBuffer()),
        plan = await prepareBankImport(format, source);
      if (version === selection.current) {
        setFile({ name: chosen.name, format, source, plan });
      }
    } catch (cause) {
      if (version === selection.current) {
        setLocalError(
          cause instanceof Error ? cause.message : t("imports.readFailed"),
        );
      }
    }
  }
  async function exportBank() {
    if (!bank) throw new Error(t("imports.chooseBank"));
    const rows: { item: unknown; key: unknown }[] = [];
    let after = "", stamp = "";
    do {
      const page = await model.read<
        {
          snapshot_at: string;
          rows: { id: string; item: unknown; key: unknown }[];
        }
      >(`imports/export?bank_id=${bank}${after ? "&after=" + after : ""}${
        stamp ? "&snapshot_at=" + encodeURIComponent(stamp) : ""
      }`);
      stamp = page.snapshot_at;
      rows.push(...page.rows);
      after = page.rows.length === 100 ? page.rows.at(-1)!.id : "";
    } while (after);
    downloadBankFile(
      JSON.stringify(exportBankRows(rows), null, 2),
      "schood-question-bank.json",
    );
  }
  if (!model.allowed) {
    return (
      <section>
        <h2>{t("imports.accessChanged")}</h2>
        <p role="alert" className="error">
          {model.error ||
            t("imports.accessRestore")}
        </p>
      </section>
    );
  }
  return (
    <div className="bank-imports">
      <section>
        <h2>{t("imports.title")}</h2>
        <p>
          {t("imports.lead")}
        </p>
        {(model.error || localError) && (
          <p role="alert" className="error">{model.error || localError}</p>
        )}
        {!model.ready && <p role="status">{t("imports.opening")}</p>}
        {model.pending && (
          <div role="status">
            <p>
              {t("imports.pending")}
            </p>
            <button disabled={model.busy} onClick={() => void model.send()}>
              {t("imports.retry")}
            </button>
          </div>
        )}
        <fieldset disabled={disabled}>
          <label>
            {t("imports.destination")}<select
              value={bank}
              onChange={(event) => {
                setBank(event.target.value);
              }}
            >
              <option value="">{t("editor.chooseBank")}</option>
              {banks.map((row) => (
                <option key={row.id} value={row.id}>{String(row.title)}</option>
              ))}
            </select>
          </label>
          <div className="actions">
            <button
              className="quiet"
              onClick={() =>
                downloadBankFile(
                  BANK_CSV_TEMPLATE,
                  "schood-question-template.csv",
                  "text/csv;charset=utf-8",
                )}
            >
              {t("imports.template")}
            </button>
            <button
              className="quiet"
              disabled={!bank}
              onClick={() => void model.run(exportBank)}
            >
              {t("imports.export")}
            </button>
          </div>
          <p>
            {t("imports.formatsHint")}
          </p>
          <label>
            {t("imports.file")}<input
              type="file"
              accept=".csv,.json"
              onChange={(event) => void choose(event.target.files?.[0])}
            />
          </label>
          <ImportFileStatus
            file={file}
            bank={bank}
            stage={(data) => void model.send("stage", data)}
          />
        </fieldset>
      </section>
      <ImportHistory
        jobs={model.jobs}
        disabled={model.busy}
        more={model.more}
        open={(id) => void model.open(id)}
        loadMore={() => void model.loadMore()}
      />
      {model.job && (
        <ImportReview
          key={`${model.job.id}:${model.job.revision}`}
          job={model.job}
          actor={actor}
          disabled={disabled}
          send={model.send}
          reviewDrafts={reviewDrafts}
          more={() =>
            void model.open(model.job!.id, model.job!.rows.at(-1)?.line ?? 0)}
        />
      )}
      <QtiWorkspace tenant={tenant} actor={actor} banks={banks} openImport={(id) => void model.run(() => model.openReviewedImport(id))} />
    </div>
  );
}
