import type { ImportPlan } from "../../../../packages/assessment-core/src/bank-import.ts";
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
  if (!file) return null;
  return (
    <>
      <p>
        {file.name}: {file.plan.rows.length} valid questions,{" "}
        {file.plan.errors.length} errors,{" "}
        {file.plan.rows.filter((row) => row.warnings.length).length}{" "}
        duplicate warnings.
      </p>
      {file.plan.errors.length > 0 && (
        <ul aria-label="Import validation errors">
          {file.plan.errors.slice(0, 100).map((issue) => (
            <li key={issue.line}>Entry {issue.line}: {issue.message}</li>
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
        Stage file for review
      </button>
    </>
  );
}
