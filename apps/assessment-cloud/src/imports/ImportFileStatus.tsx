import type { ImportPlan } from "../../../../packages/assessment-core/src/bank-import.ts";
import { useAppT } from "../i18n/index.ts";
export interface SelectedImportFile {
  name: string;
  format: "csv" | "json";
  source: string;
  plan: ImportPlan;
}
export function ImportFileStatus(
  { file, bank, stage }: {
    file: SelectedImportFile | null;
    bank: string;
    stage: (data: Record<string, unknown>) => void;
  },
) {
  const t = useAppT();
  if (!file) return null;
  return (
    <>
      <p>
        {t("fileStatus.summary", { name: file.name, valid: String(file.plan.rows.length), errors: String(file.plan.errors.length), warnings: String(file.plan.rows.filter((row) => row.warnings.length).length) })}
      </p>
      {file.plan.errors.length > 0 && (
        <ul aria-label={t("fileStatus.errorsLabel")}>
          {file.plan.errors.slice(0, 100).map((issue) => (
            <li key={issue.line}>{t("fileStatus.entry", { line: String(issue.line), message: issue.message })}</li>
          ))}
        </ul>
      )}
      <button
        disabled={!bank || file.plan.errors.length > 0}
        onClick={() =>
          stage({
            bank_id: bank,
            source_name: file.name,
            format: file.format,
            source: file.source,
          })}
      >
        {t("fileStatus.stage")}
      </button>
    </>
  );
}
