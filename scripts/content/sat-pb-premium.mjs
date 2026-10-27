#!/usr/bin/env node
// Generates the SAT Playbook premium-guide and plan-template migrations from
// the sources in content/sat-playbook/premium/*.md and content/sat-playbook/plans/*.json.
//
//   node scripts/content/sat-pb-premium.mjs          write the migrations
//   node scripts/content/sat-pb-premium.mjs --check  fail if they are stale or content fails validation
//   node scripts/content/sat-pb-premium.mjs --stats  print word and section counts
//
// Guide format: a JSON front-matter block between `---` lines, then sections that
// start with `## Heading`. A heading may end with `{checklist}` (body = `- item` lines)
// or `{callout: Label}` (plain-text body). Everything else is a rich_text section
// stored as {markdown}. Ids are deterministic (contract section B) and every insert
// uses `on conflict do nothing`, so re-running the migration never overwrites edits.

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREMIUM_DIR = join(ROOT, 'content', 'sat-playbook', 'premium');
const PLANS_DIR = join(ROOT, 'content', 'sat-playbook', 'plans');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const GUIDES_MIGRATION = '20261026161000_sat_playbook_premium_guides.sql';
const PLANS_MIGRATION = '20261026161100_sat_playbook_plan_templates.sql';
const PRODUCT_ID = 'a8b41e2c-9a36-4caf-9bba-7212e35a8b8c';
const CONTENT_REVISION = 'sat-pb-premium-2026-10-v1';

const PUBLIC_MODULES = [
  'sat-essentials', 'reading-writing-information-ideas', 'reading-writing-craft-structure',
  'reading-writing-expression-of-ideas', 'reading-writing-conventions', 'math-algebra',
  'math-advanced-math', 'math-problem-solving-data-analysis', 'math-geometry-trigonometry',
  'desmos-and-calculator-strategy', 'pacing-and-adaptive-modules', 'test-day-guide',
  'score-goals-and-study-plans', 'retake-and-superscore-strategy',
];
const PREMIUM_GUIDES = [
  'guide-rw-hard-module-traps', 'guide-math-hard-module-traps', 'guide-1200-to-1400-roadmap',
  'guide-1400-to-1550-roadmap', 'guide-desmos-power-moves', 'guide-final-14-days',
];
const PLAN_SLUGS = ['four-week-sprint', 'eight-week-standard', 'twelve-week-foundation', 'math-priority', 'reading-writing-priority'];
const PLAN_TYPES = new Set(['crash', 'balanced', 'improvement', 'skill_recovery']);
const FOCUS = new Set(['reading_writing', 'math', 'both']);
const MIN_WORDS = 3000;
const MIN_SECTIONS = 20;

const args = new Set(process.argv.slice(2));
const errors = [];
const fail = (msg) => errors.push(msg);

// Mirrors the renderer's markdown detection in apps/sat-playbook PageBlocks.
const looksLikeMarkdown = (text) =>
  /(^|\n)#{1,6}\s|(^|\n)[-*+]\s|(^|\n)\d+\.\s|\*\*[^*]+\*\*|`[^`]+`|^>\s|\[[^\]]+\]\([^)]+\)/.test(text);
const countWords = (text) => (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu) ?? []).length;

// ------------------------------------------------------------------ parsing
const parseGuide = (file) => {
  const raw = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) throw new Error(`${basename(file)}: missing front matter`);
  const meta = JSON.parse(fm[1]);
  const body = raw.slice(fm[0].length);
  const chunks = body.split(/^## /m).slice(1);
  const sections = chunks.map((chunk, index) => {
    const nl = chunk.indexOf('\n');
    let heading = (nl < 0 ? chunk : chunk.slice(0, nl)).trim();
    const text = (nl < 0 ? '' : chunk.slice(nl + 1)).trim();
    let blockType = 'rich_text';
    let content;
    const tag = heading.match(/\s*\{(checklist|callout)(?::\s*([^}]*))?\}\s*$/);
    if (tag) {
      heading = heading.slice(0, tag.index).trim();
      blockType = tag[1];
    }
    if (blockType === 'checklist') {
      const items = text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
        if (!l.startsWith('- ')) throw new Error(`${meta.slug} §${index + 1}: checklist lines must start with "- "`);
        return l.slice(2).trim();
      });
      content = { items };
    } else if (blockType === 'callout') {
      if (looksLikeMarkdown(text)) throw new Error(`${meta.slug} §${index + 1}: callout body is rendered as plain text; remove markdown`);
      content = { label: (tag[2] ?? '').trim() || heading, body: text.replace(/\s*\n\s*/g, ' ') };
    } else {
      // The renderer only switches to markdown (and therefore GFM tables) when it sees
      // one of these markers, so every rich_text body must contain at least one.
      if (!looksLikeMarkdown(text)) fail(`${meta.slug} §${index + 1} "${heading}": rich_text body has no markdown markers (bold, list, heading, code or link) and would render as one plain paragraph`);
      content = { markdown: text };
    }
    const words = countWords(heading) + countWords(text);
    return { n: index + 1, heading, blockType, content, words, text };
  });
  return { meta, sections, words: sections.reduce((a, s) => a + s.words, 0), file: basename(file) };
};

const loadGuides = () => {
  const files = readdirSync(PREMIUM_DIR).filter((f) => f.endsWith('.md')).sort();
  return files.map((f) => parseGuide(join(PREMIUM_DIR, f)));
};
const loadPlans = () => readdirSync(PLANS_DIR).filter((f) => f.endsWith('.json')).sort()
  .map((f) => ({ ...JSON.parse(readFileSync(join(PLANS_DIR, f), 'utf8')), file: f }));
const sources = JSON.parse(readFileSync(join(PREMIUM_DIR, 'sources.json'), 'utf8'));

// ------------------------------------------------------------------ validation
const KNOWN_PAGES = new Set([...PUBLIC_MODULES, ...PREMIUM_GUIDES]);
const checkLinks = (where, text) => {
  for (const m of text.matchAll(/\]\((\/[^)\s]*)\)|\((\/[a-z0-9-]+(?:\/[a-z0-9-]+)?)\)/g)) {
    const path = (m[1] ?? m[2]).replace(/[#?].*$/, '');
    const parts = path.split('/').filter(Boolean);
    if (parts[0] === 'plans') {
      if (!PLAN_SLUGS.includes(parts[1])) fail(`${where}: unknown plan link ${path}`);
    } else if (parts.length !== 1 || !KNOWN_PAGES.has(parts[0])) {
      fail(`${where}: unknown internal link ${path}`);
    }
  }
};

const validateGuides = (guides) => {
  const sourceUrls = new Set(sources.map((s) => s.url));
  const slugs = guides.map((g) => g.meta.slug).sort();
  if (JSON.stringify(slugs) !== JSON.stringify([...PREMIUM_GUIDES].sort())) fail(`premium guide slugs must be exactly ${PREMIUM_GUIDES.join(', ')}; got ${slugs.join(', ')}`);
  for (const g of guides) {
    const { meta } = g;
    if (`${meta.slug}.md` !== g.file) fail(`${g.file}: file name must match slug`);
    if (!PUBLIC_MODULES.includes(meta.parent_slug)) fail(`${meta.slug}: parent_slug must be a public module slug`);
    if (g.words < MIN_WORDS) fail(`${meta.slug}: ${g.words} words < ${MIN_WORDS}`);
    if (g.sections.length < MIN_SECTIONS) fail(`${meta.slug}: ${g.sections.length} sections < ${MIN_SECTIONS}`);
    if (!Array.isArray(meta.sources) || meta.sources.length === 0) fail(`${meta.slug}: needs sources`);
    for (const s of meta.sources ?? []) if (!sourceUrls.has(s.url)) fail(`${meta.slug}: source ${s.url} missing from sources.json`);
    for (const slug of meta.related_modules ?? []) if (!KNOWN_PAGES.has(slug)) fail(`${meta.slug}: unknown related module ${slug}`);
    for (const s of g.sections) checkLinks(`${meta.slug} §${s.n}`, s.text);
  }
};

const validatePlans = (plans) => {
  const slugs = plans.map((p) => p.slug).sort();
  if (JSON.stringify(slugs) !== JSON.stringify([...PLAN_SLUGS].sort())) fail(`plan slugs must be exactly ${PLAN_SLUGS.join(', ')}; got ${slugs.join(', ')}`);
  for (const p of plans) {
    if (`${p.slug}.json` !== p.file) fail(`${p.file}: file name must match slug`);
    if (!PLAN_TYPES.has(p.plan_type)) fail(`${p.slug}: bad plan_type`);
    if (!FOCUS.has(p.focus_section)) fail(`${p.slug}: bad focus_section`);
    if (!(p.score_min >= 400 && p.score_max <= 1600 && p.score_min <= p.score_max)) fail(`${p.slug}: score bounds`);
    const weeks = p.schedule?.weeks ?? [];
    const days = weeks.reduce((a, w) => a + (w.days?.length ?? 0), 0);
    if (days !== p.duration_days) fail(`${p.slug}: ${days} scheduled days != duration_days ${p.duration_days}`);
    if (!Array.isArray(p.schedule?.phases) || p.schedule.phases.length === 0) fail(`${p.slug}: phases required`);
    for (const w of weeks) {
      if (!w.label || !Array.isArray(w.focus) || w.focus.length === 0) fail(`${p.slug} week ${w.week}: label and focus required`);
      if (!w.checkpoint) fail(`${p.slug} week ${w.week}: checkpoint required`);
      for (const d of w.days ?? []) {
        if (!Array.isArray(d.tasks) || d.tasks.length === 0) fail(`${p.slug} week ${w.week} day ${d.day}: tasks required`);
        for (const t of d.tasks ?? []) checkLinks(`${p.slug} week ${w.week} day ${d.day}`, t);
      }
    }
    for (const slug of [...(p.schedule?.modules ?? []), ...(p.schedule?.guides ?? [])]) if (!KNOWN_PAGES.has(slug)) fail(`${p.slug}: unknown page ${slug}`);
  }
};

// ------------------------------------------------------------------ SQL helpers
const TAG = '$sat_pb$';
const lit = (value) => {
  const s = String(value);
  if (s.includes(TAG)) throw new Error(`content contains the dollar-quote tag ${TAG}`);
  return `${TAG}${s}${TAG}`;
};
const jsonLit = (value) => `${lit(JSON.stringify(value))}::jsonb`;
const textArray = (values) => values.length ? `array[${values.map(lit).join(', ')}]::text[]` : `'{}'::text[]`;
const pageId = (slug) => `md5('schood-sat-pb-page:' || ${lit(slug)})::uuid`;
const sectionId = (slug, n) => `md5('schood-sat-pb-section:' || ${lit(slug)} || ':' || '${n}')::uuid`;
const sourceId = (url) => `md5('schood-sat-pb-source:' || ${lit(url)})::uuid`;
const planId = (slug) => `md5('schood-sat-pb-plan:' || ${lit(slug)})::uuid`;

const header = (name, purpose) => `-- ============================================================================
-- ${name}
-- ----------------------------------------------------------------------------
-- ${purpose}
-- GENERATED by scripts/content/sat-pb-premium.mjs. Do not edit by hand: change
-- the sources and re-run the script.
-- Deterministic ids (md5 of the slug / url) and \`on conflict do nothing\` make
-- this migration idempotent and never overwrite rows edited in the admin console.
-- ============================================================================

begin;

set local lock_timeout = '5s';
`;

const buildGuidesSql = (guides) => {
  const migration = GUIDES_MIGRATION.replace(/\.sql$/, '');
  const usedUrls = new Set(guides.flatMap((g) => g.meta.sources.map((s) => s.url)));
  const usedSources = sources.filter((s) => usedUrls.has(s.url));
  const out = [header(migration, 'SAT Playbook premium guides (6), their sections and official sources.')];

  out.push(`-- Sources -------------------------------------------------------------------
insert into public.sat_playbook_sources (
  id, source_type, provider_key, title, url, summary, status,
  published_at, verified_at, last_checked_at, metadata
)
values
${usedSources.map((s) => `  (${sourceId(s.url)}, ${lit(s.source_type)}, ${lit(s.provider_key)}, ${lit(s.title)}, ${lit(s.url)}, ${lit(s.summary)}, 'published', now(), now(), now(), ${jsonLit({ seeded_by: migration, checked_on: '2026-10-24' })})`).join(',\n')}
on conflict do nothing;
`);

  out.push(`-- Pages (premium guides) ------------------------------------------------------
-- parent_page_id links each guide to its public module when that module exists
-- (the public modules ship in the 20261026160xxx range, which runs first).
insert into public.sat_playbook_pages (
  id, product_id, parent_page_id, page_type, module_key, slug, title, summary,
  status, visibility, locale_code, sort_order, seo_title, seo_description,
  seo_keywords, published_at, metadata
)
select
  v.id, '${PRODUCT_ID}'::uuid,
  (select p.id from public.sat_playbook_pages p where p.locale_code = 'en' and p.slug = v.parent_slug limit 1),
  'guide', v.parent_slug, v.slug, v.title, v.summary,
  'published', 'premium', 'en', v.sort_order, v.title || ' | SAT Playbook', v.summary,
  v.keywords, now(), v.metadata
from (
  values
${guides.map((g) => {
    const m = g.meta;
    const metadata = {
      seeded_by: migration,
      content_revision: CONTENT_REVISION,
      premium: true,
      teaser_for: m.parent_slug,
      level: m.level,
      related_modules: m.related_modules ?? [],
      word_count: g.words,
      section_count: g.sections.length,
      source_file: `content/sat-playbook/premium/${g.file}`,
    };
    const keywords = ['SAT', 'digital SAT', ...(m.keywords ?? [])];
    return `    (${pageId(m.slug)}, ${lit(m.parent_slug)}, ${lit(m.slug)}, ${lit(m.title)}, ${lit(m.summary)}, ${Number(m.sort_order)}, ${textArray(keywords)}, ${jsonLit(metadata)})`;
  }).join(',\n')}
) as v(id, parent_slug, slug, title, summary, sort_order, keywords, metadata)
on conflict do nothing;
`);

  for (const g of guides) {
    const slug = g.meta.slug;
    out.push(`-- Sections: ${slug} (${g.sections.length} sections, ${g.words} words)
insert into public.sat_playbook_page_sections (id, page_id, block_type, heading, status, sort_order, content, metadata)
select v.id, v.page_id, v.block_type, v.heading, 'published', v.sort_order, v.content, v.metadata
from (
  values
${g.sections.map((s) => `    (${sectionId(slug, s.n)}, ${pageId(slug)}, ${lit(s.blockType)}, ${lit(s.heading)}, ${s.n}, ${jsonLit(s.content)}, ${jsonLit({ seeded_by: migration, content_revision: CONTENT_REVISION, n: s.n })})`).join(',\n')}
) as v(id, page_id, block_type, heading, sort_order, content, metadata)
where exists (select 1 from public.sat_playbook_pages p where p.id = v.page_id)
on conflict do nothing;
`);
  }

  out.push(`-- Page ↔ source citations ---------------------------------------------------
insert into public.sat_playbook_page_sources (page_id, source_id, sort_order, citation_note, is_primary)
select v.page_id, s.id, v.sort_order, v.citation_note, v.is_primary
from (
  values
${guides.flatMap((g) => g.meta.sources.map((s, i) => `    (${pageId(g.meta.slug)}, ${lit(s.url)}, ${i + 1}, ${lit(s.note ?? 'Official reference')}, ${s.primary ? 'true' : 'false'})`)).join(',\n')}
) as v(page_id, url, sort_order, citation_note, is_primary)
join public.sat_playbook_sources s on s.url = v.url
where exists (select 1 from public.sat_playbook_pages p where p.id = v.page_id)
on conflict do nothing;

commit;
`);
  return out.join('\n');
};

const buildPlansSql = (plans) => {
  const migration = PLANS_MIGRATION.replace(/\.sql$/, '');
  const out = [header(migration, 'SAT Playbook plan templates (5) with week-by-week and day-by-day schedules.')];
  out.push(`insert into public.sat_playbook_plan_templates (
  id, product_id, slug, plan_type, title, summary, duration_days, score_min, score_max,
  focus_section, intensity, status, published_at, schedule_json, metadata
)
values
${plans.map((p) => `  (${planId(p.slug)}, '${PRODUCT_ID}'::uuid, ${lit(p.slug)}, ${lit(p.plan_type)}, ${lit(p.title)}, ${lit(p.summary)}, ${Number(p.duration_days)}, ${Number(p.score_min)}, ${Number(p.score_max)}, ${lit(p.focus_section)}, ${lit(p.intensity)}, 'published', now(), ${jsonLit(p.schedule)}, ${jsonLit({ seeded_by: migration, content_revision: CONTENT_REVISION, source_file: `content/sat-playbook/plans/${p.file}`, weekly_hours: p.schedule.weekly_hours, modules: p.schedule.modules ?? [], guides: p.schedule.guides ?? [] })})`).join(',\n')}
on conflict do nothing;

commit;
`);
  return out.join('\n');
};

// ------------------------------------------------------------------ main
const guides = loadGuides();
const plans = loadPlans();
validateGuides(guides);
validatePlans(plans);

if (args.has('--stats') || errors.length) {
  for (const g of guides) {
    const types = g.sections.reduce((a, s) => ({ ...a, [s.blockType]: (a[s.blockType] ?? 0) + 1 }), {});
    console.log(`${g.meta.slug}: ${g.words} words, ${g.sections.length} sections ${JSON.stringify(types)}`);
  }
  for (const p of plans) console.log(`${p.slug}: ${p.plan_type}, ${p.duration_days} days, ${p.schedule.weeks.length} weeks, ${p.schedule.weekly_hours?.min}–${p.schedule.weekly_hours?.max} h/week`);
}
if (errors.length) {
  console.error(`\n${errors.length} validation error(s):`);
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

const outputs = [
  [join(MIGRATIONS, GUIDES_MIGRATION), buildGuidesSql(guides)],
  [join(MIGRATIONS, PLANS_MIGRATION), buildPlansSql(plans)],
];
if (args.has('--check')) {
  const stale = outputs.filter(([file, sql]) => !existsSync(file) || readFileSync(file, 'utf8') !== sql);
  if (stale.length) {
    console.error(`Stale generated migration(s): ${stale.map(([f]) => basename(f)).join(', ')}. Run node scripts/content/sat-pb-premium.mjs`);
    process.exit(1);
  }
  console.log('SAT Playbook premium content: sources valid and migrations up to date.');
} else {
  for (const [file, sql] of outputs) {
    writeFileSync(file, sql);
    console.log(`wrote ${basename(file)} (${Math.round(Buffer.byteLength(sql) / 1024)} KB)`);
  }
}
