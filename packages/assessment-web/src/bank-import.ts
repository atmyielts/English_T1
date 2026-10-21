import { request } from "./client";
import { ResponseJournal } from "./journal";
import { GradeCommands } from "./grade-command";
import type { ImportRow } from "../../assessment-core/src/bank-import.ts";
import {LocalizedError} from './i18n/translate.ts';
export interface BankImport {
  id: string;
  bank_id: string;
  source_name: string;
  source_hash: string;
  review_hash: string;
  state: string;
  revision: number;
  total: number;
  processed: number;
  authorized_by: string | null;
  rows: (ImportRow & { state: string; item_version_id: string | null })[];
}
export async function openImportCommands(tenant: string, actor: string, kind: "imports" | "qti" = "imports") {
  if (!navigator.locks) {
    throw new LocalizedError("bankImport.locks");
  }
  const scope = `${kind === "qti" ? "qti-source" : "bank-import"}:${tenant}:${actor}`,
    journal = await ResponseJournal.create(scope);
  const commands = new GradeCommands(
    {
      async pending() {
        const rows = await journal.pending();
        if (!rows.length) return null;
        const value = rows[0].response as {
          action: string;
          data: Record<string, unknown>;
        };
        return { ...value, key: rows[0].command_key };
      },
      async save(action, data) {
        const row = await journal.append(1, "import-command", { action, data });
        return { action, data, key: row.command_key };
      },
      acknowledge: () => journal.acknowledge(1),
    },
    (intent) =>
      request<Record<string, unknown>>(
        `${kind}/commands`,
        tenant,
        { action: intent.action, data: intent.data },
        undefined,
        intent.key,
        actor,
      ),
    async <T>(work: () => Promise<T>) =>
      await navigator.locks.request("schood-import:" + scope, work),
    "bank import",
  );
  return { commands, close: () => journal.close() };
}
export function downloadBankFile(
  content: string,
  name: string,
  type = "application/json",
) {
  const href = URL.createObjectURL(new Blob([content], { type })),
    link = document.createElement("a");
  link.href = href;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
