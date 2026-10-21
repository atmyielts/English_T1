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
export function BankImportWorkspace(
  { tenant, actor, banks, reviewDrafts }: {
    tenant: string;
    actor: string;
    banks: Row[];
    reviewDrafts: () => void;
  },
) {
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
      if (chosen.size > 4_000_000) throw new Error("Choose a file up to 4 MB.");
      const format = chosen.name.toLowerCase().endsWith(".csv")
        ? "csv"
        : chosen.name.toLowerCase().endsWith(".json")
        ? "json"
        : null;
      if (!format) throw new Error("Choose CSV or Schood bank JSON.");
      const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
          .decode(await chosen.arrayBuffer()),
        plan = await prepareBankImport(format, source);
      if (version === selection.current) {
        setFile({ name: chosen.name, format, source, plan });
      }
    } catch (cause) {
      if (version === selection.current) {
        setLocalError(
          cause instanceof Error ? cause.message : "Could not read the file.",
        );
      }
    }
  }
  async function exportBank() {
    if (!bank) throw new Error("Choose a question bank.");
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
        <h2>Question-bank access changed</h2>
        <p role="alert" className="error">
          {model.error ||
            "Reopen this institution after your question-bank permissions are restored."}
        </p>
      </section>
    );
  }
  return (
    <div className="bank-imports">
      <section>
        <h2>Question-bank files</h2>
        <p>
          Bring an existing bank into Schood, review its questions and create
          drafts without changing published exams. Files are limited to 2,000
          questions / 4 MB each; larger banks can use multiple reviewed files.
        </p>
        {(model.error || localError) && (
          <p role="alert" className="error">{model.error || localError}</p>
        )}
        {!model.ready && <p role="status">Opening secure import recovery…</p>}
        {model.pending && (
          <div role="status">
            <p>
              A submitted import request needs its canonical receipt. Retry it
              before making another change.
            </p>
            <button disabled={model.busy} onClick={() => void model.send()}>
              Retry saved import request
            </button>
          </div>
        )}
        <fieldset disabled={disabled}>
          <label>
            Destination question bank<select
              value={bank}
              onChange={(event) => {
                setBank(event.target.value);
              }}
            >
              <option value="">Choose a bank</option>
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
              Download CSV template
            </button>
            <button
              className="quiet"
              disabled={!bank}
              onClick={() => void model.run(exportBank)}
            >
              Export protected bank JSON
            </button>
          </div>
          <p>
            The CSV template supports choice, true/false, ordering, short
            answer, numeric and essay questions. Use Schood bank JSON for all
            question types and existing institution media/rubric references.
            Nothing in a file is executed.
          </p>
          <label>
            Question-bank file<input
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
