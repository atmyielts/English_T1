import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { depthEn } from "../src/i18n/depth.en.ts";
import { depthRu } from "../src/i18n/depth.ru.ts";
import { depthUz } from "../src/i18n/depth.uz.ts";

const SRC = new URL("../src/", import.meta.url);

Deno.test("depth strings have the same keys in English, Russian and Uzbek", () => {
  const en = Object.keys(depthEn).sort();
  assertEquals(Object.keys(depthRu).sort(), en);
  assertEquals(Object.keys(depthUz).sort(), en);
  for (const [key, value] of [...Object.entries(depthEn), ...Object.entries(depthRu), ...Object.entries(depthUz)]) {
    assert(typeof value === "string" && value.trim().length > 0, `${key} must not be empty`);
  }
});

Deno.test("Uzbek uses the ʻ letter mark in oʻ and gʻ, and Russian has no Latin look-alikes in words", () => {
  for (const [key, value] of Object.entries(depthUz)) assert(!/[og]'/i.test(value), `${key} uses ' instead of ʻ`);
  for (const [key, value] of Object.entries(depthUz)) assert(!/[а-яё]/i.test(value), `${key} has Cyrillic letters in Uzbek`);
  for (const [key, value] of Object.entries(depthRu)) {
    const words = value.replace(/\{[^}]*\}/g, " ").split(/[^\p{L}]+/u).filter(Boolean);
    for (const word of words) assert(!(/[a-z]/i.test(word) && /[а-яё]/i.test(word)), `${key}: "${word}" mixes Latin and Cyrillic`);
  }
});

Deno.test("placeholders match across languages", () => {
  const names = (value: string) => [...value.matchAll(/\{(\w+)/g)].map((match) => match[1]).sort();
  for (const [key, value] of Object.entries(depthEn)) {
    assertEquals(names(depthRu[key] ?? ""), names(value), `ru ${key}`);
    assertEquals(names(depthUz[key] ?? ""), names(value), `uz ${key}`);
  }
});

const walk = (dir: URL): string[] => {
  const out: string[] = [];
  for (const entry of Deno.readDirSync(dir)) {
    const url = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
    if (entry.isDirectory) out.push(...walk(url));
    else if (/\.tsx?$/.test(entry.name)) out.push(Deno.readTextFileSync(url));
  }
  return out;
};

Deno.test("every depth key the app uses exists, including key families", () => {
  const sources = walk(SRC).join("\n");
  const used = new Set([...sources.matchAll(/['"`](depth\.[a-zA-Z0-9_.]+)['"`]/g)].map((match) => match[1]!));
  const missing = [...used].filter((key) => !(key in depthEn) && !key.endsWith("."));
  assertEquals(missing, []);
  const families: Record<string, string[]> = {
    "depth.strength.": ["new", "weak", "growing", "strong"],
    "depth.reading.pace.": ["slow", "typical", "fast"],
    "depth.reading.next.": ["reread", "easier", "same", "harder"],
    "depth.reading.": ["true", "false", "yes", "no"],
    "depth.listen.accent.": ["us", "gb", "au", "in"],
    "depth.listen.issue.": ["small_words", "endings", "contractions", "numbers", "spelling", "missed_words", "extra_words"],
    "depth.listen.tip.": ["small_words", "endings", "contractions", "numbers", "spelling", "missed_words", "extra_words"],
  };
  for (const [prefix, members] of Object.entries(families)) {
    for (const member of members) assert(`${prefix}${member}` in depthEn, `missing ${prefix}${member}`);
  }
});
