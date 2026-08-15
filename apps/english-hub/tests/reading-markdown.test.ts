import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseReadingMarkdown } from "../src/modules/reading/markdown.ts";

Deno.test("reading markdown keeps single-newline headings separate from prose", () => {
  const blocks = parseReadingMarkdown(
    "## Why city signs matter\nStreet signs are short, but they carry important decisions.\n\n## Three-step scan\nFirst, find the action word.",
  );

  assertEquals(blocks, [
    { type: "heading", text: "Why city signs matter" },
    { type: "paragraph", text: "Street signs are short, but they carry important decisions." },
    { type: "heading", text: "Three-step scan" },
    { type: "paragraph", text: "First, find the action word." },
  ]);
});

Deno.test("reading markdown joins wrapped prose and preserves quotes", () => {
  const blocks = parseReadingMarkdown(
    "A paragraph that wraps\nonto a second source line.\n\n> Read the action word first.",
  );

  assertEquals(blocks, [
    { type: "paragraph", text: "A paragraph that wraps onto a second source line." },
    { type: "quote", text: "Read the action word first." },
  ]);
});
