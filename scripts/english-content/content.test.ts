import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeStudioItem, STUDIO_SERVICE_KEYS } from "../../supabase/functions/_shared/english-content-studio.ts";

const root = new URL("../../supabase/content/english/", import.meta.url);

Deno.test("every authored English item passes the content studio validator", () => {
  const problems: string[] = [];
  let count = 0;
  for (const skill of STUDIO_SERVICE_KEYS) {
    let entries: Deno.DirEntry[] = [];
    try {
      entries = [...Deno.readDirSync(new URL(`${skill}/`, root))];
    } catch {
      continue;
    }
    for (const entry of entries.filter((e) => e.isFile && e.name.endsWith(".json"))) {
      count += 1;
      const parsed = JSON.parse(Deno.readTextFileSync(new URL(`${skill}/${entry.name}`, root)));
      const result = normalizeStudioItem(skill, { status: "published", ...parsed.item }, parsed.children ?? []);
      if (!result.ok) problems.push(...result.errors.map((e) => `${skill}/${entry.name}: ${e.field}: ${e.message}`));
      else if (`${result.parent.slug}.json` !== entry.name) problems.push(`${skill}/${entry.name}: file name must match slug`);
    }
  }
  assertEquals(problems, []);
  assertEquals(count > 0, true);
});
