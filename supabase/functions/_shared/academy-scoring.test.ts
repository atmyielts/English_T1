import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { attendanceRate, compositeScore, placementBand } from "./academy-scoring.ts";

Deno.test("placementBand maps CEFR bands at boundaries", () => {
  assertEquals(placementBand(0), "A1");
  assertEquals(placementBand(29.9), "A1");
  assertEquals(placementBand(30), "A2");
  assertEquals(placementBand(44), "A2");
  assertEquals(placementBand(45), "B1");
  assertEquals(placementBand(59), "B1");
  assertEquals(placementBand(60), "B2");
  assertEquals(placementBand(74), "B2");
  assertEquals(placementBand(75), "C1");
  assertEquals(placementBand(89), "C1");
  assertEquals(placementBand(90), "C2");
  assertEquals(placementBand(100), "C2");
});

Deno.test("placementBand clamps out-of-range and non-finite input", () => {
  assertEquals(placementBand(-50), "A1");
  assertEquals(placementBand(1000), "C2");
  assertEquals(placementBand(Number.NaN), "A1");
});

Deno.test("compositeScore weights graded items and rounds to one decimal", () => {
  // 100% weight-2 + 50% weight-1 => (200 + 50) / 3 = 83.33 -> 83.3
  const result = compositeScore([
    { score: 10, maxScore: 10, weight: 2 },
    { score: 5, maxScore: 10, weight: 1 },
  ]);
  assertEquals(result, 83.3);
});

Deno.test("compositeScore ignores ungradeable items", () => {
  assertEquals(
    compositeScore([
      { score: null, maxScore: 10, weight: 1 },
      { score: 8, maxScore: 0, weight: 1 }, // non-positive max ignored
      { score: 9, maxScore: 10, weight: 1 },
    ]),
    90,
  );
});

Deno.test("compositeScore returns null when nothing is gradeable", () => {
  assertEquals(compositeScore([]), null);
  assertEquals(compositeScore([{ score: null, maxScore: 10 }]), null);
});

Deno.test("compositeScore defaults missing/invalid weight to 1", () => {
  assertEquals(
    compositeScore([
      { score: 10, maxScore: 10 },
      { score: 0, maxScore: 10, weight: -3 },
    ]),
    50,
  );
});

Deno.test("attendanceRate counts present and late as attended", () => {
  assertEquals(
    attendanceRate([
      { status: "present" },
      { status: "late" },
      { status: "absent" },
      { status: "excused" },
    ]),
    50,
  );
});

Deno.test("attendanceRate returns null below the minimum session threshold", () => {
  assertEquals(attendanceRate([{ status: "present" }], 4), null);
  assertEquals(attendanceRate([], 1), null);
});
