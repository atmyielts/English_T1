import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseEnglishClientRecoveryEvent } from "./english-client-recovery.ts";

Deno.test("English recovery telemetry accepts only bounded non-sensitive fields", () => {
  assertEquals(
    parseEnglishClientRecoveryEvent({
      kind: "chunk_load",
      path: "/reading/dashboard?token=must-not-survive",
      release: "929e9f1a524386890e5d979328ff9219a646b83c",
      error_name: "TypeError",
      message: "raw messages are intentionally ignored",
    }),
    {
      kind: "chunk_load",
      path: "/reading/dashboard",
      release: "929e9f1a524386890e5d979328ff9219a646b83c",
      errorName: "TypeError",
    },
  );
});

Deno.test("English recovery telemetry fails closed for invalid classifications", () => {
  assertEquals(parseEnglishClientRecoveryEvent({ kind: "arbitrary" }), null);
  assertEquals(
    parseEnglishClientRecoveryEvent({
      kind: "render_error",
      path: "https://evil.example/secret",
      release: "not a commit",
      error_name: "bad name with spaces",
    }),
    {
      kind: "render_error",
      path: "/",
      release: "unknown",
      errorName: "Error",
    },
  );
});
