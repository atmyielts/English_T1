import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildExamSeedSql } from "./build-exam-seed.ts";

const root = new URL("../../", import.meta.url);
const path = (relative: string) => decodeURIComponent(new URL(relative, root).pathname).replace(/^\/([A-Za-z]:)/, "$1");

Deno.test("exam practice papers validate and the seed migration is up to date", () => {
  const { sql, problems, count } = buildExamSeedSql(path("supabase/content/english/exam"));
  assertEquals(problems, []);
  assertEquals(count >= 3, true);
  // Line endings may be CRLF in a Windows checkout.
  const migration = Deno.readTextFileSync(path("supabase/migrations/20261026100100_english_exam_papers_seed.sql")).replace(/\r\n/g, "\n");
  assertEquals(migration === sql, true, "run scripts/english-content/build-exam-seed.ts to rebuild the seed");
});
