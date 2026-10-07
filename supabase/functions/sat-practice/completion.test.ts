import {
  AttemptError,
  savedAttemptResult,
  submitAttempt,
} from "./completion.ts";
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
const id = "11111111-1111-4111-8111-111111111111",
  user = "22222222-2222-4222-8222-222222222222";
const a = "33333333-3333-4333-8333-333333333333",
  b = "44444444-4444-4444-8444-444444444444";
function fixture(status = "in_progress", rpcError: any = null) {
  const calls: any[] = [];
  const attempt = {
    id,
    user_id: user,
    status,
    question_ids: [a, b],
    answers: {},
  };
  const sb = {
    from: () => {
      const query: any = {
        select: () => query,
        eq: (key: string, value: string) => {
          calls.push({ key, value });
          return query;
        },
        maybeSingle: () => Promise.resolve({ data: attempt, error: null }),
      };
      return query;
    },
    rpc: (_name: string, payload: any) => {
      calls.push(payload);
      return Promise.resolve({
        data: rpcError ? null : { attempt, questions: payload.p_questions },
        error: rpcError,
      });
    },
  };
  const questions = [{ id: b, correct: { value: "12" } }, {
    id: a,
    correct: { option_id: "B" },
  }];
  return { sb, calls, questions, attempt };
}
Deno.test("Submission grades server keys in attempt order, including constructed answers and omissions", async () => {
  const { sb, calls, questions } = fixture();
  await submitAttempt(sb, user, {
    attempt_id: id,
    answers: { [a]: { selected_option: "B" }, [b]: { text: "12" } },
  }, () => Promise.resolve(questions));
  const rpc = calls.at(-1);
  assertEquals(rpc.p_questions.map((q: any) => q.id), [a, b]);
  assertEquals(rpc.p_scored_items.map((q: any) => q.correct), [true, true]);
  await submitAttempt(
    sb,
    user,
    { attempt_id: id, answers: {} },
    () => Promise.resolve(questions),
  );
  assertEquals(
    calls.at(-1).p_scored_items.map((q: any) => [q.answer, q.correct]),
    [[null, false], [null, false]],
  );
  assertEquals(
    calls.some((c) => c.key === "user_id" && c.value === user),
    true,
  );
});
Deno.test("Completed retries avoid edited or deleted bank questions and use the atomic receipt", async () => {
  const { sb, calls } = fixture("scored");
  let loads = 0;
  await submitAttempt(sb, user, { attempt_id: id, answers: {} }, () => {
    loads++;
    throw Error("deleted");
  });
  assertEquals(loads, 0);
  assertEquals(calls.at(-1).p_questions, []);
});
Deno.test("Missing questions, missing keys and foreign answer keys stop before any completion", async () => {
  const { sb, calls, questions } = fixture();
  await assertRejects(
    () =>
      submitAttempt(
        sb,
        user,
        { attempt_id: id, answers: {} },
        () => Promise.resolve(questions.slice(1)),
      ),
    AttemptError,
    "unavailable",
  );
  await assertRejects(
    () =>
      submitAttempt(
        sb,
        user,
        { attempt_id: id, answers: {} },
        () => Promise.resolve(questions.map((q) => ({ ...q, correct: null }))),
      ),
    AttemptError,
    "unavailable",
  );
  await assertRejects(
    () =>
      submitAttempt(
        sb,
        user,
        { attempt_id: id, answers: { [id]: "x" } },
        () => Promise.resolve(questions),
      ),
    AttemptError,
    "does not belong",
  );
  assertEquals(calls.filter((c) => c.p_user_id).length, 0);
});
Deno.test("Conflicts and outages have actionable private errors", async () => {
  for (
    const [code, status] of [["23505", 409], ["P0002", 404], ["22023", 400], [
      "XX000",
      503,
    ]] as const
  ) {
    const { sb, questions } = fixture("in_progress", {
      code,
      message: "private database diagnostic",
    });
    const error = await assertRejects(
      () =>
        submitAttempt(
          sb,
          user,
          { attempt_id: id, answers: {} },
          () => Promise.resolve(questions),
        ),
      AttemptError,
    );
    assertEquals((error as AttemptError).status, status);
    assertEquals(error.message.includes("private database"), false);
  }
});
Deno.test("Saved scored reads use private immutable results and fail explicitly on storage outage", async () => {
  const { attempt } = fixture("scored"),
    receipt = { attempt, questions: [{ id: a }], notebook: [] };
  const mock = (error: any) => {
    const query: any = {
      select: () => query,
      eq: () => query,
      maybeSingle: () => Promise.resolve({ data: { result: receipt }, error }),
    };
    return { from: () => query };
  };
  assertEquals(await savedAttemptResult(mock(null), user, attempt), receipt);
  await assertRejects(
    () => savedAttemptResult(mock({ message: "outage" }), user, attempt),
    AttemptError,
    "temporarily unavailable",
  );
});
