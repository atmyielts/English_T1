import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleWritingDepthRoute, type DepthContext } from "./depth.ts";

const authored = { level: "A1", answer_text: "The museum opens at nine.", notes: ["Give a time."], word_count: 5 };
const preferred = { level: "A2", answer_text: "The museum opens at nine, so meet me outside at ten past.", notes: [], word_count: 13 };

function fixture(revisions: number, models: typeof authored[]) {
  const tables: string[] = [];
  const context: DepthContext = {
    sb: {
      from(table: string) {
        tables.push(table);
        const builder = {
          select: () => builder,
          eq: () => builder,
          neq: () => builder,
          order: () => builder,
          limit: () => builder,
          maybeSingle: () => Promise.resolve({ data: table === "writing_drafts" ? { id: "draft-1", revision_count: revisions } : null }),
          in: (field: string, levels: string[]) => {
            assertEquals(table, "english_writing_model_answers");
            assertEquals(field, "level");
            assertEquals(levels, ["A2", "A1"]);
            return Promise.resolve({ data: models });
          },
        };
        return builder;
      },
    },
    req: new Request("http://localhost/write", { method: "POST" }),
    route: "/prompts/museum/model-answer",
    url: new URL("http://localhost/write"),
    body: {},
    userId: "learner-1",
    languageId: "english",
    productId: "writing",
    products: {} as DepthContext["products"],
    loadPrompt: () => Promise.resolve({ id: "prompt-1", level: "A1", metadata: { authored_model_level: "A1" } }),
    publicPrompt: () => ({}),
  };
  return { context, tables };
}

Deno.test("a Writing model requires the learner to submit their own text", async () => {
  const { context, tables } = fixture(0, [authored]);
  const response = await handleWritingDepthRoute(context);
  assertEquals(response?.status, 409);
  assertEquals(tables, ["writing_drafts"]);
});

Deno.test("an authored model serves its truthful level when the preferred cache is empty", async () => {
  const { context, tables } = fixture(1, [authored]);
  const response = await handleWritingDepthRoute(context);
  assertEquals(response?.status, 200);
  assertEquals(await response?.json(), { ok: true, level: "A1", text: authored.answer_text, notes: authored.notes, word_count: 5, cached: true });
  assertEquals(tables, ["writing_drafts", "learner_language_goals", "english_writing_model_answers"]);
});

Deno.test("the preferred cached level still wins when both models exist", async () => {
  const { context } = fixture(1, [authored, preferred]);
  const response = await handleWritingDepthRoute(context);
  const body = await response?.json();
  assertEquals(body.level, "A2");
  assertEquals(body.text, preferred.answer_text);
});
