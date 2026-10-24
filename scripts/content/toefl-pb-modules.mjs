#!/usr/bin/env node
// Generates the TOEFL Playbook public-module migration from the Markdown
// sources in content/toefl-playbook/modules/*.md and the official source list
// in content/toefl-playbook/sources.json. No dependencies.
//
//   node scripts/content/toefl-pb-modules.mjs           validate + write migration
//   node scripts/content/toefl-pb-modules.mjs --check   validate + print stats only
//
// Source format (one file per module):
//
//   ---
//   slug: writing-email
//   title: Write an Email
//   summary: One or two sentences.
//   sort_order: 7
//   module_group: skill_writing
//   section: writing
//   hero_kicker: Module 7 - Writing
//   seo_keywords: TOEFL, Write an Email
//   sources: ets-test-overview-pdf, ets-ibt-content-writing
//   ---
//   <!-- rich_text: Heading -->      Markdown body (### subheadings, lists, bold, small tables)
//   <!-- checklist: Heading -->      "- item" lines, plain text
//   <!-- callout: Eyebrow -->        first line = label, remaining lines = one plain-text paragraph
//
// Deterministic ids (contract B):
//   page    md5('schood-toefl-pb-page:' || slug)::uuid
//   section md5('schood-toefl-pb-section:' || slug || ':' || n)::uuid   (n = 1-based order)
//   source  md5('schood-toefl-pb-source:' || url)::uuid
// Every insert is `on conflict do nothing`, so re-running never overwrites edits.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODULE_DIR = join(ROOT, 'content', 'toefl-playbook', 'modules');
const SOURCES_FILE = join(ROOT, 'content', 'toefl-playbook', 'sources.json');
const MIGRATION_NAME = '20261026170000_toefl_playbook_public_modules';
const MIGRATION_FILE = join(ROOT, 'supabase', 'migrations', `${MIGRATION_NAME}.sql`);
const PRODUCT_ID = 'f9512c15-ec1c-4fcb-a5ec-a2c6ac3a020e';
const CONTENT_REVISION = 'toefl-2026-format-v1';
const VERIFIED_AT = '2026-10-24T00:00:00Z';
const PRACTICE_URL = 'https://toefl.schood.online/practice';

const SLUGS = [
  'toefl-essentials',
  'score-scale-2026',
  'reading-complete-the-words',
  'reading-daily-life-and-academic',
  'listening-strategy',
  'writing-build-a-sentence',
  'writing-email',
  'writing-academic-discussion',
  'speaking-listen-and-repeat',
  'speaking-take-an-interview',
  'test-day-guide',
  'score-goals-and-study-plans',
  'retake-and-mybest-strategy',
];
const KINDS = new Set(['rich_text', 'checklist', 'callout']);
const GROUPS = new Set(['format_overview', 'scoring_engine', 'skill_reading', 'skill_listening', 'skill_writing', 'skill_speaking', 'test_day_protocol', 'result_strategy']);
const SECTIONS = new Set(['all', 'reading', 'listening', 'writing', 'speaking']);
const MIN_WORDS = 3000;
const MAX_WORDS = 6000;
const MIN_SECTIONS = 20;

const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');

const md5uuid = (text) => {
  const h = createHash('md5').update(text, 'utf8').digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const pageId = (slug) => md5uuid(`schood-toefl-pb-page:${slug}`);
const sectionId = (slug, n) => md5uuid(`schood-toefl-pb-section:${slug}:${n}`);
const sourceId = (url) => md5uuid(`schood-toefl-pb-source:${url}`);

const countWords = (text) => (String(text).match(/[A-Za-z0-9À-ɏ]+(?:['’-][A-Za-z0-9À-ɏ]+)*/g) ?? []).length;

const errors = [];
const fail = (file, message) => errors.push(`${file}: ${message}`);

// Underscores are used for Complete the Words blanks ("mi___"); escape them in
// Markdown so they never turn into emphasis. Link targets and inline code keep
// their underscores. Authors use *asterisks* for emphasis.
const escapeUnderscores = (markdown) => markdown
  .split(/(`[^`\n]*`|\]\([^)\s]*\))/g)
  .map((part, index) => (index % 2 === 1 ? part : part.replace(/(?<!\\)_/g, '\\_')))
  .join('');

// Same test as looksLikeMarkdown in apps/{toefl,ielts}-playbook PageBlocks.tsx.
const looksLikeMarkdown = (text) => /(^|\n)#{1,6}\s|(^|\n)[-*+]\s|(^|\n)\d+\.\s|\*\*[^*]+\*\*|`[^`]+`|^>\s|\[[^\]]+\]\([^)]+\)/.test(text);

// Table header cells render bold anyway; marking them **bold** also makes a
// table-only section trip the renderer's Markdown heuristic.
const boldTableHeaders = (markdown) => {
  const lines = markdown.split('\n');
  for (let i = 0; i + 1 < lines.length; i++) {
    const isRow = /^\s*\|.*\|\s*$/.test(lines[i]);
    const isDivider = /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(lines[i + 1]);
    if (!isRow || !isDivider || (i > 0 && /^\s*\|/.test(lines[i - 1]))) continue;
    const cells = lines[i].trim().slice(1, -1).split('|').map((c) => c.trim());
    lines[i] = `| ${cells.map((c) => (c && !/^\*\*.*\*\*$/.test(c) ? `**${c}**` : c)).join(' | ')} |`;
  }
  return lines.join('\n');
};

const parseFrontMatter = (file, raw) => {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    fail(file, 'missing front matter');
    return { meta: {}, body: raw };
  }
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!kv) {
      fail(file, `bad front matter line: ${line}`);
      continue;
    }
    meta[kv[1]] = kv[2].trim();
  }
  return { meta, body: match[2] };
};

const parseSections = (file, body) => {
  const marker = /^<!--\s*([a-z_]+)\s*:\s*(.+?)\s*-->\s*$/gm;
  const found = [];
  let m;
  while ((m = marker.exec(body))) found.push({ kind: m[1], heading: m[2], start: m.index, end: marker.lastIndex });
  if (found.length === 0) fail(file, 'no sections found');
  const preamble = body.slice(0, found[0]?.start ?? body.length).trim();
  if (preamble) fail(file, 'text before the first section marker');
  return found.map((section, i) => {
    const text = body.slice(section.end, found[i + 1]?.start ?? body.length).replace(/\r\n/g, '\n').trim();
    const n = i + 1;
    if (!KINDS.has(section.kind)) fail(file, `section ${n}: unsupported kind ${section.kind}`);
    if (!text) fail(file, `section ${n} (${section.heading}) is empty`);
    let content;
    let plain;
    if (section.kind === 'checklist') {
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      const items = [];
      for (const line of lines) {
        if (!line.startsWith('- ')) fail(file, `section ${n}: checklist line must start with "- ": ${line.slice(0, 60)}`);
        const item = line.replace(/^-\s+/, '').trim();
        if (/\*\*|`|\[[^\]]+\]\(/.test(item)) fail(file, `section ${n}: checklist items are plain text (no Markdown): ${item.slice(0, 60)}`);
        items.push(item);
      }
      if (items.length < 2) fail(file, `section ${n}: checklist needs at least 2 items`);
      if (new Set(items).size !== items.length) fail(file, `section ${n}: duplicate checklist items`);
      content = { items };
      plain = items.join(' ');
    } else if (section.kind === 'callout') {
      const [label, ...rest] = text.split('\n');
      const calloutBody = rest.join(' ').replace(/\s+/g, ' ').trim();
      if (!label?.trim() || !calloutBody) fail(file, `section ${n}: callout needs a label line and a body`);
      if (/\*\*|`|\[[^\]]+\]\(|^#/.test(label + calloutBody)) fail(file, `section ${n}: callout is plain text (no Markdown)`);
      content = { label: label.trim(), body: calloutBody };
      plain = `${label} ${calloutBody}`;
    } else {
      if (/^#{1,2}\s/m.test(text)) fail(file, `section ${n}: use ### or deeper inside a section (the section heading is the h2)`);
      if (/\|.*\|/.test(text)) {
        for (const row of text.split('\n').filter((l) => /^\s*\|/.test(l))) {
          const cells = row.split('|').length - 2;
          if (cells > 6) fail(file, `section ${n}: table rows may have at most 6 columns`);
        }
      }
      const markdown = boldTableHeaders(escapeUnderscores(text));
      // The playbook renderers only parse a string as Markdown when this
      // heuristic matches; otherwise the raw text (pipes, asterisks, escapes)
      // would show. Every Markdown section must therefore trip it.
      if (!looksLikeMarkdown(markdown) && /[|*>\\]/.test(markdown)) {
        fail(file, `section ${n} (${section.heading}): uses Markdown but the renderer would show it as plain text; add a list, **bold** phrase or link`);
      }
      content = { markdown };
      plain = text;
    }
    return { n, kind: section.kind, heading: section.heading, content, words: countWords(`${section.heading} ${plain}`) };
  });
};

const sources = JSON.parse(readFileSync(SOURCES_FILE, 'utf8'));
const sourceByKey = new Map();
for (const s of sources) {
  if (!s.key || !/^https:\/\/www\.ets\.org\//.test(s.url) || !s.title || !s.summary) fail('sources.json', `invalid source ${JSON.stringify(s).slice(0, 80)}`);
  if (sourceByKey.has(s.key)) fail('sources.json', `duplicate key ${s.key}`);
  sourceByKey.set(s.key, s);
}

const files = readdirSync(MODULE_DIR).filter((f) => f.endsWith('.md')).sort();
const modules = [];
for (const file of files) {
  const raw = readFileSync(join(MODULE_DIR, file), 'utf8');
  const { meta, body } = parseFrontMatter(file, raw);
  const slug = meta.slug;
  if (!SLUGS.includes(slug)) fail(file, `slug ${slug} is not one of the fixed contract slugs`);
  if (`${slug}.md` !== file) fail(file, 'file name must equal <slug>.md');
  for (const key of ['title', 'summary', 'sort_order', 'module_group', 'section', 'hero_kicker', 'sources']) {
    if (!meta[key]) fail(file, `front matter needs ${key}`);
  }
  if (meta.summary && meta.summary.length > 300) fail(file, 'summary must be 300 characters or fewer');
  if (meta.module_group && !GROUPS.has(meta.module_group)) fail(file, `unknown module_group ${meta.module_group}`);
  if (meta.section && !SECTIONS.has(meta.section)) fail(file, `unknown section ${meta.section}`);
  const sourceKeys = String(meta.sources ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const key of sourceKeys) if (!sourceByKey.has(key)) fail(file, `unknown source key ${key}`);
  const sections = parseSections(file, body);
  const headings = sections.map((s) => s.heading.toLowerCase());
  if (new Set(headings).size !== headings.length) fail(file, 'section headings must be unique within a module');
  const words = sections.reduce((sum, s) => sum + s.words, 0);
  if (sections.length < MIN_SECTIONS) fail(file, `needs at least ${MIN_SECTIONS} sections (has ${sections.length})`);
  if (words < MIN_WORDS || words > MAX_WORDS) fail(file, `needs ${MIN_WORDS}-${MAX_WORDS} words (has ${words})`);
  modules.push({
    file,
    slug,
    title: meta.title,
    summary: meta.summary,
    sortOrder: Number(meta.sort_order),
    moduleGroup: meta.module_group,
    section: meta.section,
    heroKicker: meta.hero_kicker,
    seoKeywords: String(meta.seo_keywords ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    sourceKeys,
    sections,
    words,
  });
}

for (const slug of SLUGS) if (!modules.some((m) => m.slug === slug)) fail('modules', `missing module ${slug}`);
const orders = modules.map((m) => m.sortOrder);
if (new Set(orders).size !== orders.length || orders.some((o) => !Number.isInteger(o) || o < 1)) fail('modules', 'sort_order values must be unique positive integers');

modules.sort((a, b) => a.sortOrder - b.sortOrder);
const kindTotals = {};
for (const m of modules) for (const s of m.sections) kindTotals[s.kind] = (kindTotals[s.kind] ?? 0) + 1;

console.log('slug                              words  sections  minutes');
for (const m of modules) {
  console.log(`${m.slug.padEnd(33)} ${String(m.words).padStart(5)}  ${String(m.sections.length).padStart(8)}  ${String(Math.ceil(m.words / 200)).padStart(7)}`);
}
console.log(`total words ${modules.reduce((s, m) => s + m.words, 0)}; section kinds ${JSON.stringify(kindTotals)}`);

if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}
if (checkOnly) process.exit(0);

// --- SQL --------------------------------------------------------------------
const TAG = '$tpb$';
const lit = (value) => `'${String(value).replace(/'/g, "''")}'`;
const jsonb = (value) => {
  const text = JSON.stringify(value);
  if (text.includes(TAG)) throw new Error('content contains the dollar-quote tag');
  return `${TAG}${text}${TAG}::jsonb`;
};
const textArray = (values) => (values.length ? `array[${values.map(lit).join(', ')}]::text[]` : `'{}'::text[]`);

const usedSourceKeys = [...new Set(modules.flatMap((m) => m.sourceKeys))];
const out = [];
out.push(`-- Generated by scripts/content/toefl-pb-modules.mjs from content/toefl-playbook/. Do not edit by hand.`);
out.push(`-- TOEFL Playbook public modules (13), accurate to the TOEFL iBT as updated on 21 January 2026.`);
out.push(`-- Original Schood writing; official ETS pages are cited in toefl_playbook_sources, never copied.`);
out.push(`-- Insert-only and idempotent: deterministic ids + on conflict do nothing, so admin edits are never overwritten.`);
out.push('');
out.push('begin;');
out.push("set local lock_timeout='5s';");
out.push("set local statement_timeout='60s';");
out.push('');
out.push(`do $$ begin if not exists (select 1 from public.products where id = '${PRODUCT_ID}') then raise exception 'TOEFL Playbook product missing'; end if; end $$;`);
out.push('');
out.push('-- Official sources ----------------------------------------------------------');
out.push('insert into public.toefl_playbook_sources (id, source_type, provider_key, title, url, summary, status, published_at, verified_at, last_checked_at, metadata)');
out.push('values');
out.push(usedSourceKeys.map((key) => {
  const s = sourceByKey.get(key);
  return `  ('${sourceId(s.url)}'::uuid, 'official_url', 'ets', ${lit(s.title)}, ${lit(s.url)}, ${lit(s.summary)}, 'published', now(), '${VERIFIED_AT}'::timestamptz, '${VERIFIED_AT}'::timestamptz, ${jsonb({ seeded_by: MIGRATION_NAME, source_key: key })})`;
}).join(',\n'));
out.push('on conflict do nothing;');
out.push('');
out.push('-- Pages -----------------------------------------------------------------------');
out.push('insert into public.toefl_playbook_pages (id, product_id, page_type, module_key, slug, title, summary, status, visibility, locale_code, sort_order, seo_title, seo_description, seo_keywords, published_at, metadata)');
out.push('values');
out.push(modules.map((m) => {
  const metadata = {
    seeded_by: MIGRATION_NAME,
    content_revision: CONTENT_REVISION,
    hero_kicker: m.heroKicker,
    module_group: m.moduleGroup,
    section: m.section,
    word_count: m.words,
    section_count: m.sections.length,
    reading_time_minutes: Math.ceil(m.words / 200),
    practice_url: PRACTICE_URL,
    format_basis: 'TOEFL iBT updated 21 January 2026 (ETS overview, 2026 blueprint, April 2026 score-scale report)',
    last_verified: VERIFIED_AT.slice(0, 10),
    verification_status: 'verified',
    source_file: `content/toefl-playbook/modules/${m.file}`,
  };
  const keywords = ['TOEFL', 'TOEFL iBT', 'TOEFL Playbook', ...m.seoKeywords];
  return `  ('${pageId(m.slug)}'::uuid, '${PRODUCT_ID}'::uuid, 'module', ${lit(m.slug)}, ${lit(m.slug)}, ${lit(m.title)}, ${lit(m.summary)}, 'published', 'public', 'en', ${m.sortOrder}, ${lit(`${m.title} | TOEFL Playbook`)}, ${lit(m.summary)}, ${textArray([...new Set(keywords)])}, now(), ${jsonb(metadata)})`;
}).join(',\n'));
out.push('on conflict do nothing;');
out.push('');
for (const m of modules) {
  out.push(`-- Sections: ${m.slug} (${m.sections.length} sections, ${m.words} words) ------------`);
  out.push('insert into public.toefl_playbook_page_sections (id, page_id, block_type, heading, status, sort_order, content, metadata)');
  out.push(`select v.id, v.page_id, v.block_type, v.heading, 'published', v.sort_order, v.content, v.metadata`);
  out.push('from (values');
  out.push(m.sections.map((s) => `  ('${sectionId(m.slug, s.n)}'::uuid, '${pageId(m.slug)}'::uuid, ${lit(s.kind)}, ${lit(s.heading)}, ${s.n}, ${jsonb(s.content)}, ${jsonb({ seeded_by: MIGRATION_NAME, content_revision: CONTENT_REVISION })})`).join(',\n'));
  out.push(') as v(id, page_id, block_type, heading, sort_order, content, metadata)');
  out.push('where exists (select 1 from public.toefl_playbook_pages p where p.id = v.page_id)');
  out.push('on conflict do nothing;');
  out.push('');
}
out.push('-- Page to source links -------------------------------------------------------');
out.push('insert into public.toefl_playbook_page_sources (page_id, source_id, sort_order, citation_note, is_primary)');
out.push('select v.page_id, v.source_id, v.sort_order, v.citation_note, v.is_primary');
out.push('from (values');
out.push(modules.flatMap((m) => m.sourceKeys.map((key, i) => {
  const s = sourceByKey.get(key);
  return `  ('${pageId(m.slug)}'::uuid, '${sourceId(s.url)}'::uuid, ${i + 1}, ${lit(i === 0 ? 'Primary verification source' : 'Supporting official source')}, ${i === 0 ? 'true' : 'false'})`;
})).join(',\n'));
out.push(') as v(page_id, source_id, sort_order, citation_note, is_primary)');
out.push('where exists (select 1 from public.toefl_playbook_pages p where p.id = v.page_id)');
out.push('  and exists (select 1 from public.toefl_playbook_sources s where s.id = v.source_id)');
out.push('on conflict do nothing;');
out.push('');
out.push('commit;');
out.push('');

const sql = out.join('\n');
writeFileSync(MIGRATION_FILE, sql);
console.log(`\nwrote ${MIGRATION_FILE} (${(Buffer.byteLength(sql) / 1024).toFixed(0)} KB)`);
