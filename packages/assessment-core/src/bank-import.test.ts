import {
  BANK_CSV_TEMPLATE,
  CSV_COLUMNS,
  exportBankRows,
  parseCsv,
  prepareBankImport,
} from "./bank-import.ts";
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(JSON.stringify({ a, b }));
  }
}
function rejects(fn: () => unknown) {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error("Expected rejection");
}
Deno.test("bank CSV handles BOM, quoted commas, quotes, multiline and CRLF without executing formulas", () => {
  equal(parseCsv('\uFEFFa,b\r\n"x,y","one\n""two"""\r\n=SUM(1),@value'), [
    ["a", "b"],
    ["x,y", 'one\n"two"'],
    ["=SUM(1)", "@value"],
  ]);
  for (
    const value of ['a,"unclosed', '"closed"bad,cell', 'a"quote,b', "x\0,y"]
  ) rejects(() => parseCsv(value));
});
Deno.test("template parses into a normalized choice draft and exact raw-byte provenance", async () => {
  const result = await prepareBankImport("csv", BANK_CSV_TEMPLATE);
  equal(result.errors, []);
  equal(result.rows[0].key.correct, "a");
  equal(result.rows[0].item.options, [{ id: "a", text: "2" }, {
    id: "b",
    text: "3",
  }]);
  const other = await prepareBankImport("csv", BANK_CSV_TEMPLATE + "\n");
  if (other.source_hash === result.source_hash) {
    throw new Error("Raw byte digest must preserve newlines");
  }
});
Deno.test("CSV validates each row, strict booleans, missing numeric inputs and option multiplicity", async () => {
  const rows = [[
    "numeric",
    "en",
    "Value",
    "1",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "false",
    "false",
    "",
    "",
  ], [
    "single_choice",
    "en",
    "Choose",
    "1",
    "Yes",
    "No",
    "",
    "",
    "a|b",
    "",
    "",
    "false",
    "false",
    "",
    "",
  ], [
    "short_answer",
    "en",
    "Text",
    "1",
    "",
    "",
    "",
    "",
    "hello",
    "",
    "",
    "TRUE",
    "false",
    "",
    "",
  ]];
  const result = await prepareBankImport(
    "csv",
    CSV_COLUMNS.join(",") + "\n" + rows.map((row) => row.join(",")).join("\n"),
  );
  equal(result.rows.length, 0);
  equal(result.errors.map((row) => row.line), [2, 3, 4]);
});
Deno.test("all structured item types retain validated keys and duplicate diagnostics strip injected authority", async () => {
  const row = {
    item: {
      schema_version: "assessment.item.v1",
      type: "gap_fill",
      locale: "uz",
      prompt: "Salom ___",
      max_score: 2,
      tags: [],
      response_ids: ["blank"],
      approved_by: "spoofed",
      answer_key: "secret",
    },
    key: {
      correct: { blank: ["dunyo", "olam"] },
      partial_credit: true,
      actor: "spoofed",
    },
  };
  const source = JSON.stringify({
      schema_version: "assessment.bank.v1",
      rows: [row, row],
    }),
    plan = await prepareBankImport("json", source);
  equal(plan.errors, []);
  equal(plan.rows[1].warnings.length, 1);
  equal("approved_by" in plan.rows[0].item, false);
  equal(
    exportBankRows(plan.rows).rows,
    plan.rows.map(({ item, key }) => ({ item, key })),
  );
});
Deno.test("unsupported schemas, empty files, duplicate headers and oversized files fail closed", async () => {
  for (
    const [format, source] of [
      ["json", '{"schema_version":"wrong","rows":[]}'],
      ["csv", ""],
      ["csv", "type,type\na,b"],
      ["json", "x".repeat(4_000_001)],
    ] as const
  ) {
    let failed = false;
    try {
      await prepareBankImport(format, source);
    } catch {
      failed = true;
    }
    if (!failed) throw new Error("Invalid input accepted");
  }
});
