#!/usr/bin/env node
// Builds the SAT Playbook public-module migrations from
// content/sat-playbook/modules/*.md and content/sat-playbook/modules/_sources.json.
//
//   node scripts/content/sat-pb-modules.mjs           validate + print stats + write migrations
//   node scripts/content/sat-pb-modules.mjs --check   validate + print stats only
//
// Module file format:
//   <!--meta
//   { "slug": "...", "title": "...", "summary": "...", "module_key": "...", "sort_order": 1,
//     "group": "core" | "reading_writing" | "math", "hero_kicker": "Module 1",
//     (module_key in the file is the grouping key, stored as metadata.module_group;
//      the page's module_key column is set to the slug)
//     "seo_description": "...", "seo_keywords": ["..."],
//     "related_practice": [{ "label": "...", "url": "https://..." }],
//     "sources": [{ "key": "structure", "note": "...", "primary": true }] }
//   -->
//   ## Section heading            (one level-2 heading per section)
//   <!-- checklist -->            optional first line: checklist (body = "- item" lines)
//   <!-- callout: Short label --> optional first line: callout (body = plain text)
//   ...markdown body...           default kind: rich_text, stored as content.markdown
//
// Ids are deterministic (contract B): pages md5('schood-sat-pb-page:' || slug),
// sections md5('schood-sat-pb-section:' || slug || ':' || n), sources
// md5('schood-sat-pb-source:' || url). Every insert is `on conflict do nothing`.
// No external dependencies.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const contentDir = join(root, 'content', 'sat-playbook', 'modules');
const migrationsDir = join(root, 'supabase', 'migrations');
const checkOnly = process.argv.includes('--check');

const PRODUCT_ID = 'a8b41e2c-9a36-4caf-9bba-7212e35a8b8c';
const SEED = 'sat-pb-modules';
const REVISION = 'sat-pb-public-v1';
const PUBLISHED_AT = '2026-10-24T00:00:00Z';
const VERIFIED_ON = '2026-10-24';

const SLUGS = [
  'sat-essentials',
  'reading-writing-information-ideas',
  'reading-writing-craft-structure',
  'reading-writing-expression-of-ideas',
  'reading-writing-conventions',
  'math-algebra',
  'math-advanced-math',
  'math-problem-solving-data-analysis',
  'math-geometry-trigonometry',
  'desmos-and-calculator-strategy',
  'pacing-and-adaptive-modules',
  'test-day-guide',
  'score-goals-and-study-plans',
  'retake-and-superscore-strategy',
];

const GROUPS = {
  core: { file: '20261026160900_sat_playbook_public_modules_core.sql', label: 'core strategy modules' },
  reading_writing: { file: '20261026160910_sat_playbook_public_modules_reading_writing.sql', label: 'Reading and Writing modules' },
  math: { file: '20261026160920_sat_playbook_public_modules_math.sql', label: 'Math and Desmos modules' },
};

const MIN_WORDS = 3000;
const MAX_WORDS = 6000;
const MIN_SECTIONS = 20;

// Same heuristic as the SAT/IELTS PageBlocks renderer: a string that does not
// match is rendered as one plain <p>, which would collapse paragraphs.
const looksLikeMarkdown = (text) =>
  /(^|\n)#{1,6}\s|(^|\n)[-*+]\s|(^|\n)\d+\.\s|\*\*[^*]+\*\*|`[^`]+`|^>\s|\[[^\]]+\]\([^)]+\)/.test(text);

const errors = [];
const fail = (file, message) => errors.push(`${file}: ${message}`);

const sql = (value) => (value === null || value === undefined ? 'null' : `'${String(value).replace(/'/g, "''")}'`);
const sqlJson = (value) => `${sql(JSON.stringify(value))}::jsonb`;
const sqlTextArray = (values) => `array[${values.map(sql).join(', ')}]::text[]`;

const countWords = (text) =>
  text
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/[#*_`>|[\]]/g, ' ')
    .split(/\s+/)
    .filter((token) => /[A-Za-z0-9]/.test(token)).length;

const sources = JSON.parse(readFileSync(join(contentDir, '_sources.json'), 'utf8'));
const sourceByKey = new Map();
for (const source of sources) {
  if (!source.key || !/^https:\/\//.test(source.url || '') || !source.title) fail('_sources.json', `invalid source ${JSON.stringify(source)}`);
  if (sourceByKey.has(source.key)) fail('_sources.json', `duplicate key ${source.key}`);
  if (!['official_url', 'provider_url', 'news', 'internal_note'].includes(source.source_type)) fail('_sources.json', `bad source_type for ${source.key}`);
  sourceByKey.set(source.key, source);
}

const parseModule = (file) => {
  const raw = readFileSync(join(contentDir, file), 'utf8').replace(/\r\n/g, '\n');
  const metaMatch = raw.match(/^<!--meta\n([\s\S]*?)\n-->\n/);
  if (!metaMatch) {
    fail(file, 'missing <!--meta ... --> header');
    return null;
  }
  let meta;
  try {
    meta = JSON.parse(metaMatch[1]);
  } catch (error) {
    fail(file, `meta is not valid JSON: ${error.message}`);
    return null;
  }
  const body = raw.slice(metaMatch[0].length);
  const parts = body.split(/^## (.+)$/m);
  if (parts[0].trim()) fail(file, 'text before the first "## " section heading');
  const sections = [];
  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i].trim();
    let text = parts[i + 1].trim();
    let blockType = 'rich_text';
    let label = null;
    const directive = text.match(/^<!--\s*(checklist|callout)(?::\s*(.+?))?\s*-->\s*\n?/);
    if (directive) {
      blockType = directive[1];
      label = directive[2] ? directive[2].trim() : null;
      text = text.slice(directive[0].length).trim();
    }
    const where = `${file} § "${heading}"`;
    if (!heading) fail(file, 'empty heading');
    if (!text) fail(where, 'empty section body');
    if (/<!--/.test(text)) fail(where, 'stray HTML comment in body');
    let content;
    if (blockType === 'checklist') {
      const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
      const items = lines.map((line) => line.replace(/^-\s+/, ''));
      if (lines.some((line) => !line.startsWith('- '))) fail(where, 'checklist lines must all start with "- "');
      if (items.length < 3) fail(where, 'checklist needs at least 3 items');
      if (new Set(items).size !== items.length) fail(where, 'duplicate checklist items (renderer keys by text)');
      if (items.some((item) => /\*\*|`|\]\(/.test(item))) fail(where, 'checklist items render as plain text; remove markdown');
      content = { items };
    } else if (blockType === 'callout') {
      if (!label) fail(where, 'callout needs a label: <!-- callout: Label -->');
      if (/\n\s*\n/.test(text)) fail(where, 'callout body must be a single paragraph');
      if (/\*\*|`|\]\(|(^|\n)[-*]\s/.test(text)) fail(where, 'callout body renders as plain text; remove markdown');
      content = { label, body: text.replace(/\s*\n\s*/g, ' ') };
    } else {
      if (/\n/.test(text) && !looksLikeMarkdown(text)) {
        fail(where, 'multi-line rich_text (paragraphs or tables) must contain a list, bold, heading or link, or the renderer shows it as one plain paragraph');
      }
      if (/^#\s|^##\s/m.test(text)) fail(where, 'use ### or deeper inside a section');
      content = { markdown: text };
    }
    sections.push({ heading, blockType, content, words: countWords(`${heading}\n${label ?? ''}\n${text}`) });
  }
  return { file, meta, sections };
};

const modules = readdirSync(contentDir)
  .filter((file) => file.endsWith('.md') && !file.startsWith('_'))
  .sort()
  .map(parseModule)
  .filter(Boolean);

const seenSlugs = new Set();
const seenOrders = new Set();
for (const mod of modules) {
  const { file, meta, sections } = mod;
  if (!SLUGS.includes(meta.slug)) fail(file, `slug ${meta.slug} is not in the contract list`);
  if (`${meta.slug}.md` !== file) fail(file, `file name must be ${meta.slug}.md`);
  if (seenSlugs.has(meta.slug)) fail(file, 'duplicate slug');
  seenSlugs.add(meta.slug);
  for (const key of ['title', 'summary', 'module_key', 'hero_kicker', 'seo_description']) {
    if (typeof meta[key] !== 'string' || !meta[key].trim()) fail(file, `meta.${key} is required`);
  }
  if (!Number.isInteger(meta.sort_order)) fail(file, 'meta.sort_order must be an integer');
  if (seenOrders.has(meta.sort_order)) fail(file, `duplicate sort_order ${meta.sort_order}`);
  seenOrders.add(meta.sort_order);
  if (!GROUPS[meta.group]) fail(file, `meta.group must be one of ${Object.keys(GROUPS).join(', ')}`);
  if (!Array.isArray(meta.seo_keywords) || meta.seo_keywords.length === 0) fail(file, 'meta.seo_keywords required');
  if (!Array.isArray(meta.related_practice) || meta.related_practice.length === 0) fail(file, 'meta.related_practice required');
  for (const link of meta.related_practice ?? []) {
    if (!link.label || !/^https:\/\//.test(link.url || '')) fail(file, `bad related_practice ${JSON.stringify(link)}`);
  }
  if (!Array.isArray(meta.sources) || meta.sources.length === 0) fail(file, 'meta.sources required');
  if ((meta.sources ?? []).filter((s) => s.primary).length !== 1) fail(file, 'exactly one source must be primary');
  for (const ref of meta.sources ?? []) {
    if (!sourceByKey.has(ref.key)) fail(file, `unknown source key ${ref.key}`);
  }
  if (sections.length < MIN_SECTIONS) fail(file, `${sections.length} sections; need ${MIN_SECTIONS}+`);
  const headings = sections.map((s) => s.heading);
  if (new Set(headings).size !== headings.length) fail(file, 'duplicate section headings');
  mod.words = sections.reduce((sum, s) => sum + s.words, 0);
  if (mod.words < MIN_WORDS || mod.words > MAX_WORDS) fail(file, `${mod.words} words; need ${MIN_WORDS}-${MAX_WORDS}`);
  mod.readingMinutes = Math.max(1, Math.round(mod.words / 200));
  for (const s of sections) {
    const all = JSON.stringify(s.content);
    for (const m of all.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) {
      if (!/^https:\/\//.test(m[1])) fail(`${file} § "${s.heading}"`, `non-https link ${m[1]}`);
    }
  }
}

const stats = modules
  .slice()
  .sort((a, b) => a.meta.sort_order - b.meta.sort_order)
  .map((m) => ({
    order: m.meta.sort_order,
    slug: m.meta.slug,
    words: m.words,
    sections: m.sections.length,
    kinds: [...new Set(m.sections.map((s) => s.blockType))].join(','),
    minutes: m.readingMinutes,
  }));
console.table(stats);
const missing = SLUGS.filter((slug) => !seenSlugs.has(slug));
if (missing.length) console.log(`Not written yet: ${missing.join(', ')}`);

if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
if (checkOnly) {
  console.log('Content check passed.');
  process.exit(0);
}
if (missing.length) {
  console.error('All 14 modules must exist before migrations are written.');
  process.exit(1);
}

const pageId = (slug) => `md5(${sql(`schood-sat-pb-page:${slug}`)})::uuid`;

const buildMigration = (groupKey) => {
  const group = GROUPS[groupKey];
  const mods = modules.filter((m) => m.meta.group === groupKey).sort((a, b) => a.meta.sort_order - b.meta.sort_order);
  const usedKeys = [...new Set(mods.flatMap((m) => m.meta.sources.map((s) => s.key)))];
  const usedSources = sources.filter((s) => usedKeys.includes(s.key));
  const out = [];
  out.push(`-- SAT Playbook public modules: ${group.label} (${mods.map((m) => m.meta.slug).join(', ')}).`);
  out.push('-- GENERATED by scripts/content/sat-pb-modules.mjs from content/sat-playbook/modules/. Do not edit by hand.');
  out.push('-- Original Schood editorial content; facts checked against the cited College Board pages on 2026-10-24.');
  out.push('-- Idempotent: deterministic ids, every insert is on conflict do nothing (existing rows are left untouched).');
  out.push('begin;');
  out.push("set local lock_timeout = '5s';");
  out.push('');
  out.push('do $$');
  out.push('begin');
  out.push(`  if not exists (select 1 from public.products where id = '${PRODUCT_ID}'::uuid) then`);
  out.push("    raise exception 'SAT Playbook product % not found', '" + PRODUCT_ID + "';");
  out.push('  end if;');
  out.push('end');
  out.push('$$;');
  out.push('');
  out.push('-- Official sources ------------------------------------------------------------');
  out.push('insert into public.sat_playbook_sources (id, source_type, provider_key, title, url, summary, status, published_at, verified_at, last_checked_at, metadata)');
  out.push('values');
  out.push(
    usedSources
      .map(
        (s) =>
          `  (md5(${sql(`schood-sat-pb-source:${s.url}`)})::uuid, ${sql(s.source_type)}, ${sql(s.provider_key)}, ${sql(s.title)}, ${sql(s.url)}, ${sql(s.summary)}, 'published', ${sql(PUBLISHED_AT)}::timestamptz, ${sql(PUBLISHED_AT)}::timestamptz, ${sql(PUBLISHED_AT)}::timestamptz, ${sqlJson({ seeded_by: SEED, source_key: s.key })})`,
      )
      .join(',\n'),
  );
  out.push('on conflict do nothing;');
  for (const mod of mods) {
    const { meta, sections } = mod;
    const kinds = [...new Set(sections.map((s) => s.blockType))];
    const pageMeta = {
      seeded_by: SEED,
      content_revision: REVISION,
      original_slug: meta.slug,
      module_group: meta.module_key,
      migration_group: meta.group,
      hero_kicker: meta.hero_kicker,
      word_count: mod.words,
      section_count: sections.length,
      reading_minutes: mod.readingMinutes,
      estimated_reading_minutes: mod.readingMinutes,
      section_kinds: kinds,
      related_practice: meta.related_practice,
      last_verified: VERIFIED_ON,
      verification_status: 'verified',
      editorial: 'original-schood',
    };
    out.push('');
    out.push(`-- Module ${meta.sort_order}: ${meta.slug} (${sections.length} sections, ${mod.words} words) ------------`);
    out.push('insert into public.sat_playbook_pages (id, product_id, parent_page_id, page_type, module_key, slug, title, summary, status, visibility, locale_code, sort_order, seo_title, seo_description, seo_keywords, published_at, metadata)');
    out.push(
      `values (${pageId(meta.slug)}, '${PRODUCT_ID}'::uuid, null, 'module', ${sql(meta.slug)}, ${sql(meta.slug)}, ${sql(meta.title)}, ${sql(meta.summary)}, 'published', 'public', 'en', ${meta.sort_order}, ${sql(meta.seo_title || `${meta.title} | SAT Playbook`)}, ${sql(meta.seo_description)}, ${sqlTextArray(meta.seo_keywords)}, ${sql(PUBLISHED_AT)}::timestamptz, ${sqlJson(pageMeta)})`,
    );
    out.push('on conflict do nothing;');
    out.push('');
    out.push('insert into public.sat_playbook_page_sections (id, page_id, block_type, heading, status, sort_order, content, metadata)');
    out.push(`select md5(${sql(`schood-sat-pb-section:${meta.slug}:`)} || s.n)::uuid, p.id, s.block_type, s.heading, 'published', s.n, s.content, s.metadata`);
    out.push('from public.sat_playbook_pages p');
    out.push('cross join (values');
    out.push(
      sections
        .map(
          (s, index) =>
            `  (${index + 1}, ${sql(s.blockType)}, ${sql(s.heading)}, ${sqlJson(s.content)}, ${sqlJson({ seeded_by: SEED, content_revision: REVISION })})`,
        )
        .join(',\n'),
    );
    out.push(') as s(n, block_type, heading, content, metadata)');
    out.push(`where p.id = ${pageId(meta.slug)}`);
    out.push('on conflict do nothing;');
    out.push('');
    out.push('insert into public.sat_playbook_page_sources (page_id, source_id, sort_order, citation_note, is_primary)');
    out.push('select p.id, src.id, v.sort_order, v.citation_note, v.is_primary');
    out.push('from (values');
    out.push(
      meta.sources
        .map((ref, index) => {
          const source = sourceByKey.get(ref.key);
          return `  (${sql(source.url)}, ${index + 1}, ${sql(ref.note || (ref.primary ? 'Primary verification source' : 'Supporting official source'))}, ${ref.primary ? 'true' : 'false'})`;
        })
        .join(',\n'),
    );
    out.push(') as v(url, sort_order, citation_note, is_primary)');
    out.push('join public.sat_playbook_sources src on src.url = v.url');
    out.push(`join public.sat_playbook_pages p on p.id = ${pageId(meta.slug)}`);
    out.push('on conflict do nothing;');
  }
  out.push('');
  out.push('commit;');
  out.push('');
  return out.join('\n');
};

for (const groupKey of Object.keys(GROUPS)) {
  const text = buildMigration(groupKey);
  const path = join(migrationsDir, GROUPS[groupKey].file);
  writeFileSync(path, text, 'utf8');
  console.log(`Wrote ${GROUPS[groupKey].file} (${(Buffer.byteLength(text) / 1024).toFixed(1)} KB)`);
}
