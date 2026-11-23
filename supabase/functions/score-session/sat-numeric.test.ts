import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  SAT_SIMULATOR_PRODUCT_ID,
  satNumericAnswerMatches,
} from "../_shared/sat-numeric-answer.ts";
import {
  buildDb,
  SAT,
  type SessionSpec,
  TOKEN,
} from "../_shared/testing/exam-fixtures.ts";
import { installFakeDb } from "../_shared/testing/fake-supabase.ts";
import { loadHandler } from "../_shared/testing/serve-capture.ts";

Deno.env.set("SUPABASE_URL", "http://fake.supabase.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");

const examples = [
  { key: "-7", response: "7", correct: false },
  { key: "3/2", response: "3.2", correct: false },
  { key: "3/4", response: ".75", correct: true },
  { key: "-1/2", response: "−0.50", correct: true },
  { key: "3", response: "3/0", correct: false },
  { key: "5/3", response: " 10 / 6 ", correct: true },
];

Deno.test("SAT numeric comparison respects exact values and authored alternatives", () => {
  for (const { key, response, correct } of examples) {
    assertEquals(satNumericAnswerMatches(response, [key]), correct);
  }
  assertEquals(satNumericAnswerMatches(".333", ["1/3", "0.333"]), true);
  assertEquals(satNumericAnswerMatches(".333", ["1/3"]), false);
  assertEquals(
    satNumericAnswerMatches("9007199254740993", ["9007199254740992"]),
    false,
  );
  assertEquals(satNumericAnswerMatches("none", ["none"]), null);
});

const fixture: SessionSpec = {
  ...SAT,
  productId: SAT_SIMULATOR_PRODUCT_ID,
  productSlug: "sat-exam-simulator",
  sections: [
    SAT.sections[0],
    {
      type: "math",
      parts: [examples.map(({ key, response }) => ({
        type: "question_text",
        correct: { answers: [key] },
        response: { text: response },
      }))],
    },
  ],
};

const scorerModules = [
  ["score-session", new URL("./index.ts", import.meta.url)],
  [
    "score-session-v2",
    new URL("../score-session-v2/index.ts", import.meta.url),
  ],
] as const;

for (const [name, module] of scorerModules) {
  const handler = await loadHandler(module);
  Deno.test(name + " applies exact written math grading", async () => {
    const db = buildDb(fixture);
    installFakeDb(db);
    const res = await handler(
      new Request("http://fake.supabase.test/functions/v1/" + name, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ session_id: db.sessionId, method: "auto" }),
      }),
    );
    assertEquals(res.status, 200);
    const { result } = await res.json();
    const math = result.sections[db.sectionIds[1]];
    assertEquals(math.raw_score, 3);
    assertEquals(math.max_score, 6);
  });
}

const review = await loadHandler(
  new URL("../review-session/index.ts", import.meta.url),
);
Deno.test("SAT answer review shows the same exact math result", async () => {
  const db = buildDb(fixture);
  db.tables.users[0].role = "admin";
  installFakeDb(db);
  const res = await review(
    new Request(
      "http://fake.supabase.test/functions/v1/review-session?session_id=" +
        db.sessionId,
      {
        headers: { Authorization: "Bearer " + TOKEN },
      },
    ),
  );
  assertEquals(res.status, 200);
  const { units } = await res.json();
  assertEquals(
    units.filter((unit: { section_id: string }) =>
      unit.section_id === db.sectionIds[1]
    )
      .map((unit: { is_correct: boolean }) => unit.is_correct),
    examples.map((example) => example.correct),
  );
});
