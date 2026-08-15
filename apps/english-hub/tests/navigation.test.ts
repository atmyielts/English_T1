import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildPlatformHref } from "../src/lib/navigation.ts";

Deno.test("buildPlatformHref creates a valid pricing URL and preserves the English return path", () => {
  assertEquals(
    buildPlatformHref("https://schood.online", "/pricing", {
      product: "english-reading",
      returnTo: "https://english.schood.online/reading/dashboard?intent=review",
    }),
    "https://schood.online/pricing?product=english-reading&returnTo=https%3A%2F%2Fenglish.schood.online%2Freading%2Fdashboard%3Fintent%3Dreview",
  );
});

Deno.test("buildPlatformHref keeps auth query parameters on local preview URLs", () => {
  assertEquals(
    buildPlatformHref("http://127.0.0.1:4100/", "/auth", {
      mode: "signin",
      returnTo: "http://127.0.0.1:5183/speaking",
    }),
    "http://127.0.0.1:4100/auth?mode=signin&returnTo=http%3A%2F%2F127.0.0.1%3A5183%2Fspeaking",
  );
});
