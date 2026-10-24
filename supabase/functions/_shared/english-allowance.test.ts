import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideAccess, learnerDayStart, submitSlug } from "./english-allowance.ts";

Deno.test("learners with the skill, and admins, are always allowed", () => {
  assertEquals(decideAccess({ admin: false, entitled: true, usedFreeToday: 9 }).allowed, true);
  assertEquals(decideAccess({ admin: true, entitled: false, usedFreeToday: 9 }).basis, "admin");
});

Deno.test("others get one free activity a day", () => {
  assertEquals(decideAccess({ admin: false, entitled: false, usedFreeToday: 0 }), { allowed: true, basis: "free", free_left: 1 });
  assertEquals(decideAccess({ admin: false, entitled: false, usedFreeToday: 1 }), { allowed: false, basis: "free_used", free_left: 0 });
  assertEquals(decideAccess({ admin: false, entitled: false, usedFreeToday: 1, perDay: 3 }).free_left, 2);
});

Deno.test("the free day follows Uzbekistan time (UTC+5)", () => {
  // 20:30 UTC on the 22nd is 01:30 on the 23rd in Tashkent: the day started at 19:00 UTC.
  assertEquals(learnerDayStart(new Date("2026-10-22T20:30:00Z")), "2026-10-22T19:00:00.000Z");
  // 10:00 UTC on the 22nd is 15:00 in Tashkent: the day started at 19:00 UTC on the 21st.
  assertEquals(learnerDayStart(new Date("2026-10-22T10:00:00Z")), "2026-10-21T19:00:00.000Z");
});

Deno.test("submit routes name the activity so today's free one can be redone", () => {
  assertEquals(submitSlug("/units/past-simple-a2/submit"), "past-simple-a2");
  assertEquals(submitSlug("/articles/smart%20choices/submit"), "smart choices");
  assertEquals(submitSlug("/drills/submit"), null);
  assertEquals(submitSlug("/units/%E0%A4/submit"), null);
  assertEquals(submitSlug(undefined), null);
});

Deno.test("the free allowance follows the configured daily number", () => {
  assertEquals(decideAccess({ admin: false, entitled: false, usedFreeToday: 2, perDay: 3 }), { allowed: true, basis: "free", free_left: 1 });
  assertEquals(decideAccess({ admin: false, entitled: false, usedFreeToday: 3, perDay: 3 }).allowed, false);
  // 0 switches the free tier off: only learners with the skill may practise.
  assertEquals(decideAccess({ admin: false, entitled: false, usedFreeToday: 0, perDay: 0 }), { allowed: false, basis: "free_used", free_left: 0 });
  assertEquals(decideAccess({ admin: false, entitled: true, usedFreeToday: 0, perDay: 0 }).allowed, true);
});

Deno.test("a paused service refuses everyone except admins", () => {
  assertEquals(decideAccess({ admin: false, entitled: true, usedFreeToday: 0, paused: true }).basis, "paused");
  assertEquals(decideAccess({ admin: false, entitled: false, usedFreeToday: 0, paused: true }).allowed, false);
  assertEquals(decideAccess({ admin: true, entitled: false, usedFreeToday: 0, paused: true }), { allowed: true, basis: "admin", free_left: 1 });
});
