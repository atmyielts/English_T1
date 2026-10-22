import {
  type AnswerKey,
  ContractError,
  hash,
  type Item,
  object,
  validateItem,
  validateKey,
} from "./mod.ts";
export interface ImportRow {
  line: number;
  item: Item;
  key: AnswerKey;
  fingerprint: string;
  warnings: string[];
}
export interface ImportPlan {
  schema_version: "assessment.bank-import.v1";
  rows: ImportRow[];
  errors: { line: number; message: string }[];
  source_hash: string;
}
export const CSV_COLUMNS = [
  "type",
  "locale",
  "prompt",
  "max_score",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct_answers",
  "numeric_value",
  "numeric_tolerance",
  "case_sensitive",
  "partial_credit",
  "tags",
  "rubric_id",
] as const;
const bad = (message: string): never => {
  throw new ContractError("invalid_import", message);
};
/** Strict quoted UTF-8 CSV. Never evaluates formulas, markup or external references. */
export function parseCsv(source: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, closed = false;
  const finish = () => {
    row.push(cell);
    cell = "";
    closed = false;
  };
  source = source.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    if (
      cell.length > 100000 || row.length > CSV_COLUMNS.length ||
      result.length > 2001
    ) bad("CSV cell, column or record limit exceeded.");
    const c = source[i];
    if (c === "\0") bad("NUL characters are not allowed.");
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
      continue;
    }
    if (c === '"') {
      if (cell || closed) bad("A quote must start a quoted cell.");
      quoted = true;
    } else if (c === ",") finish();
    else if (c === "\r" || c === "\n") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      finish();
      if (row.some((value) => value !== "")) result.push(row);
      row = [];
    } else {
      if (closed) bad("Unexpected text after a closing quote.");
      cell += c;
    }
    if (cell.length > 100000) bad("A cell exceeds 100,000 characters.");
  }
  if (quoted) bad("A quoted cell was not closed.");
  if (cell.length > 100000) bad("A cell exceeds 100,000 characters.");
  if (cell || row.length || closed) {
    finish();
    if (row.some((value) => value !== "")) result.push(row);
  }
  return result;
}
function csvRecords(source: string) {
  const [headers, ...rows] = parseCsv(source);
  if (!headers?.length) bad("The file is empty.");
  if (
    new Set(headers).size !== headers.length ||
    headers.some((name) => !(CSV_COLUMNS as readonly string[]).includes(name))
  ) bad("Use unique column names from the Schood CSV template.");
  for (const name of ["type", "locale", "prompt", "max_score"]) {
    if (!headers.includes(name)) bad(`Missing column: ${name}.`);
  }
  return rows.map((cells, index) => {
    try {
      if (cells.length !== headers.length) {
        bad("The row has a different number of cells than the header.");
      }
      const row = Object.fromEntries(
          headers.map((name, i) => [name, cells[i]]),
        ),
        type = row.type;
      if (
        ![
          "single_choice",
          "multi_choice",
          "true_false",
          "ordering",
          "short_answer",
          "numeric",
          "essay",
        ].includes(type)
      ) bad("Use structured bank JSON for this question type.");
      const boolean = (name: string) => {
        const value = row[name] ?? "";
        if (!["", "true", "false"].includes(value)) {
          bad(`${name} must be true or false.`);
        }
        return value === "true";
      };
      const options = ["a", "b", "c", "d"].flatMap((id) =>
        row["option_" + id]?.trim() ? [{ id, text: row["option_" + id] }] : []
      );
      const answers = (row.correct_answers ?? "").split("|").map((value) =>
        value.trim()
      ).filter(Boolean);
      const item = validateItem({
        schema_version: "assessment.item.v1",
        type,
        locale: row.locale,
        prompt: row.prompt,
        max_score: Number(row.max_score),
        tags: (row.tags ?? "").split("|").map((value) => value.trim()).filter(
          Boolean,
        ),
        ...(options.length ? { options } : {}),
        ...(row.rubric_id ? { rubric_id: row.rubric_id } : {}),
      });
      if (
        type === "numeric" &&
        (!row.numeric_value?.trim() || !row.numeric_tolerance?.trim())
      ) bad("Numeric value and tolerance are required.");
      const key = validateKey(item, {
        correct: ["multi_choice", "ordering", "short_answer"].includes(type)
          ? answers
          : answers[0],
        numeric: {
          value: Number(row.numeric_value),
          tolerance: Number(row.numeric_tolerance),
        },
        case_sensitive: boolean("case_sensitive"),
        partial_credit: boolean("partial_credit"),
      });
      if (
        ["single_choice", "true_false"].includes(type) && answers.length !== 1
      ) bad("This question requires exactly one correct option.");
      return { line: index + 2, item, key };
    } catch (cause) {
      return {
        line: index + 2,
        error: cause instanceof Error ? cause.message : "Invalid row",
      };
    }
  });
}
export async function prepareBankImport(
  format: "csv" | "json",
  source: string,
): Promise<ImportPlan> {
  if (new TextEncoder().encode(source).length > 4_000_000) {
    bad(
      "Each file must be at most 4 MB. Split larger banks into separately reviewed files.",
    );
  }
  const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(source),
    ),
    source_hash = [...new Uint8Array(digest)].map((byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
  let records: { line: number; item?: Item; key?: AnswerKey; error?: string }[];
  if (format === "csv") records = csvRecords(source);
  else {
    let document: Record<string, unknown>;
    try {
      document = object(JSON.parse(source.replace(/^\uFEFF/, "")));
    } catch {
      bad("Expected a structured Schood bank JSON file.");
    }
    if (
      document!.schema_version !== "assessment.bank.v1" ||
      !Array.isArray(document!.rows)
    ) bad("Unsupported bank file schema.");
    records = (document!.rows as unknown[]).map((raw, index) => {
      try {
        const row = object(raw), item = validateItem(row.item);
        return { line: index + 1, item, key: validateKey(item, row.key) };
      } catch (cause) {
        return {
          line: index + 1,
          error: cause instanceof Error ? cause.message : "Invalid question",
        };
      }
    });
  }
  if (!records.length || records.length > 2000) {
    bad("Each file must contain 1–2,000 questions.");
  }
  const rows: ImportRow[] = [],
    errors: ImportPlan["errors"] = [],
    seen = new Set<string>();
  for (const record of records) {
    if (record.error) {
      errors.push({ line: record.line, message: record.error });
      continue;
    }
    const fingerprint = await hash({ item: record.item, key: record.key }),
      warnings = seen.has(fingerprint)
        ? ["Identical question and key occur earlier in this file."]
        : [];
    seen.add(fingerprint);
    rows.push({
      line: record.line,
      item: record.item!,
      key: record.key!,
      fingerprint,
      warnings,
    });
  }
  return {
    schema_version: "assessment.bank-import.v1",
    rows,
    errors,
    source_hash,
  };
}
export const BANK_CSV_TEMPLATE = CSV_COLUMNS.join(",") + "\r\n" +
  [
    "single_choice",
    "en",
    "Which number is even?",
    "1",
    "2",
    "3",
    "",
    "",
    "a",
    "",
    "",
    "false",
    "false",
    "arithmetic",
    "",
  ].join(",") + "\r\n";
/** Portable, lossless structured interchange; all executable/unknown fields are reconstructed away. */
export function exportBankRows(rows: { item: unknown; key: unknown }[]) {
  return {
    schema_version: "assessment.bank.v1",
    rows: rows.map((row) => {
      const item = validateItem(row.item);
      return { item, key: validateKey(item, row.key) };
    }),
  };
}
