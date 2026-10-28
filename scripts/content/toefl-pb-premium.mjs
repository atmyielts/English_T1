#!/usr/bin/env node
// Generates the TOEFL Playbook premium guides + plan templates migration from
// the authored sources in content/toefl-playbook/premium/*.md and
// content/toefl-playbook/plans/*.json.
//
//   node scripts/content/toefl-pb-premium.mjs           # write the migration
//   node scripts/content/toefl-pb-premium.mjs --check   # validate + print counts only
//   node scripts/content/toefl-pb-premium.mjs --verify  # fail if the migration drifted from the sources
//
// Deterministic ids (contract B):
//   page    md5('schood-toefl-pb-page:'    || slug)::uuid
//   section md5('schood-toefl-pb-section:' || slug || ':' || n)::uuid
//   source  md5('schood-toefl-pb-source:'  || url)::uuid
//   plan    md5('schood-toefl-pb-plan:'    || slug)::uuid
// Every insert is `on conflict do nothing`, so re-running is safe and never
// overwrites edits made later in the admin console.
//
// Section source format (markdown file per guide):
//   front matter between `---` lines: key: value
//   `## Heading {kind}` starts a section. kind defaults to rich_text.
//     rich_text        body markdown           -> {markdown}
//     checklist        `- item` lines          -> {items: [...]}
//     faq              `### Question` + answer  -> {items: [{question, answer}]}
//     callout          `**Label**` then body   -> {label, body}
//     timeline         `- **Label** — value`   -> {items: [{label, value}]}
//     comparison_table same as timeline
//     cta_strip        `key: value` lines      -> {label, primary_text, primary_url, secondary_text, secondary_url}
//     cloze            ```cloze fenced paragraph, `---`, then `word: explanation` lines.
//                      Emits two rich_text sections (drill + answer key); the
//                      gapped words are computed with the ETS rule (after the
//                      intact first sentence, the second half of every second
//                      word is removed, 10 words) and checked against the key.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const premiumDir = join(root, 'content', 'toefl-playbook', 'premium');
const plansDir = join(root, 'content', 'toefl-playbook', 'plans');
// Two files so guides and plan templates ship as separate, ordered migrations.
const MIGRATION = '20261028100910_toefl_playbook_premium_guides.sql';
const PLANS_MIGRATION = '20261028101000_toefl_playbook_plan_templates.sql';
const migrationPath = join(root, 'supabase', 'migrations', MIGRATION);
const plansMigrationPath = join(root, 'supabase', 'migrations', PLANS_MIGRATION);
const SEEDED_BY = MIGRATION.replace(/\.sql$/, '');
const PLANS_SEEDED_BY = PLANS_MIGRATION.replace(/\.sql$/, '');
const PRODUCT_ID = 'f9512c15-ec1c-4fcb-a5ec-a2c6ac3a020e';
const CONTENT_REVISION = 'toefl-2026-premium-v1';

const REQUIRED_GUIDES = [
  'guide-band-4-to-5-roadmap',
  'guide-band-5-to-6-roadmap',
  'guide-complete-the-words-drills',
  'guide-email-and-discussion-templates',
  'guide-interview-answer-frameworks',
  'guide-final-14-days',
];
const REQUIRED_PLANS = [
  'four-week-sprint',
  'eight-week-standard',
  'twelve-week-foundation',
  'speaking-writing-priority',
  'reading-listening-priority',
];
// Public module slugs owned by toefl-pb-modules (contract B). Links to these and
// to the premium guides are the only internal links allowed.
const MODULE_SLUGS = [
  'toefl-essentials', 'score-scale-2026', 'reading-complete-the-words', 'reading-daily-life-and-academic',
  'listening-strategy', 'writing-build-a-sentence', 'writing-email', 'writing-academic-discussion',
  'speaking-listen-and-repeat', 'speaking-take-an-interview', 'test-day-guide', 'score-goals-and-study-plans',
  'retake-and-mybest-strategy',
];
const INTERNAL_SLUGS = new Set([...MODULE_SLUGS, ...REQUIRED_GUIDES]);
const INTERNAL_APP_ROUTES = new Set(['/dashboard', '/onboarding', '/diagnostic', '/modules']);
const ALLOWED_BLOCKS = new Set(['rich_text', 'comparison_table', 'skill_grid', 'faq', 'checklist', 'resource_cards', 'timeline', 'cta_strip', 'callout', 'stat_grid']);
const PLAN_TYPES = new Set(['crash', 'balanced', 'improvement', 'skill_recovery']);
const SECTIONS = new Set(['reading', 'listening', 'speaking', 'writing', 'all']);
// Same heuristic as apps/toefl-playbook PageBlocks: prose that does not match
// renders as one plain paragraph, so multi-paragraph prose must match it.
const looksLikeMarkdown = (text) => /(^|\n)#{1,6}\s|(^|\n)[-*+]\s|(^|\n)\d+\.\s|\*\*[^*]+\*\*|`[^`]+`|^>\s|\[[^\]]+\]\([^)]+\)/.test(text);

const errors = [];
const fail = (msg) => errors.push(msg);
const sqlText = (value) => `'${String(value).replace(/'/g, "''")}'`;
const sqlJson = (value) => `${sqlText(JSON.stringify(value))}::jsonb`;
const words = (text) => (String(text).replace(/[`*_>#|\\-]+/g, ' ').match(/[A-Za-z0-9][A-Za-z0-9'’.,%/:-]*/g) ?? []).length;

// --- Complete the Words ------------------------------------------------------
const clozeGaps = (paragraph) => {
  const match = paragraph.match(/^(.*?[.!?])\s+(.*)$/s);
  if (!match) throw new Error('cloze paragraph needs an intact first sentence');
  const rest = match[2].split(/\s+/);
  const gaps = [];
  const rendered = rest.map((token, index) => {
    if (index % 2 === 0 || gaps.length >= 10) return token;
    const m = token.match(/^([^A-Za-z]*)([A-Za-z]+)([^A-Za-z]*)$/);
    if (!m || m[2].length < 2) throw new Error(`gap position lands on an unusable token "${token}"`);
    const [, pre, word, post] = m;
    const keep = Math.floor(word.length / 2);
    gaps.push({ word, visible: word.slice(0, keep), missing: word.slice(keep) });
    const blanks = Array.from({ length: word.length - keep }, () => '\\_').join(' ');
    return `${pre}${word.slice(0, keep)}${blanks}${post}`;
  });
  if (gaps.length !== 10) throw new Error(`cloze paragraph produced ${gaps.length} gaps, expected 10`);
  return { first: match[1], gapped: `${match[1]} ${rendered.join(' ')}`, gaps, wordCount: paragraph.split(/\s+/).length };
};

// --- Parsing -------------------------------------------------------------------
const parseFrontMatter = (raw, file) => {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing front matter`);
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return { meta, body: m[2].replace(/\r\n/g, '\n') };
};

const parseListItems = (body) => body.split('\n').filter((l) => /^\s*[-*]\s+/.test(l)).map((l) => l.replace(/^\s*[-*]\s+/, '').trim());

const parseSections = (body, slug) => {
  const chunks = body.split(/\n(?=## )/).map((c) => c.trim()).filter(Boolean);
  const out = [];
  for (const chunk of chunks) {
    if (!chunk.startsWith('## ')) { fail(`${slug}: text before first section`); continue; }
    const nl = chunk.indexOf('\n');
    const headLine = (nl === -1 ? chunk : chunk.slice(0, nl)).slice(3).trim();
    const text = nl === -1 ? '' : chunk.slice(nl + 1).trim();
    const km = headLine.match(/^(.*?)\s*\{([a-z_]+)\}$/);
    const heading = km ? km[1].trim() : headLine;
    const kind = km ? km[2] : 'rich_text';
    if (kind === 'cloze') {
      const cm = text.match(/```cloze\n([\s\S]*?)\n---\n([\s\S]*?)```/);
      if (!cm) { fail(`${slug}: cloze "${heading}" malformed`); continue; }
      const paragraph = cm[1].trim().replace(/\s+/g, ' ');
      const intro = text.slice(0, text.indexOf('```cloze')).trim();
      const keyLines = cm[2].trim().split('\n').map((l) => l.match(/^([A-Za-z]+):\s*(.+)$/)).filter(Boolean);
      let result;
      try { result = clozeGaps(paragraph); } catch (e) { fail(`${slug}: ${heading}: ${e.message}`); continue; }
      const expected = result.gaps.map((g) => g.word);
      const declared = keyLines.map((k) => k[1]);
      if (JSON.stringify(expected) !== JSON.stringify(declared)) {
        fail(`${slug}: ${heading}: answer key words ${JSON.stringify(declared)} do not match gaps ${JSON.stringify(expected)}`);
        continue;
      }
      if (result.wordCount < 70 || result.wordCount > 100) fail(`${slug}: ${heading}: paragraph has ${result.wordCount} words (ETS: about 70-100)`);
      out.push({
        block_type: 'rich_text',
        heading,
        content: { markdown: `${intro ? `${intro}\n\n` : ''}> ${result.gapped}\n\n**Your task:** write the 10 completed words in order before you open the answer key below.` },
        drill: { paragraph, gaps: result.gaps },
      });
      const keyMd = result.gaps.map((g, i) => `${i + 1}. **${g.word}** (${g.visible} + *${g.missing}*): ${keyLines[i][2].trim()}`).join('\n');
      out.push({
        block_type: 'rich_text',
        heading: `${heading}: answer key and explanations`,
        content: { markdown: `**Full text:** ${paragraph}\n\n${keyMd}` },
      });
      continue;
    }
    if (!ALLOWED_BLOCKS.has(kind)) { fail(`${slug}: unsupported block "${kind}"`); continue; }
    let content;
    if (kind === 'rich_text') {
      content = { markdown: text };
      if ((text.includes('\n') || text.includes('|')) && !looksLikeMarkdown(text)) fail(`${slug}: "${heading}" has line breaks or a table but no markdown markers`);
    } else if (kind === 'checklist') {
      content = { items: parseListItems(text) };
    } else if (kind === 'faq') {
      const items = text.split(/\n(?=### )/).map((q) => q.trim()).filter((q) => q.startsWith('### ')).map((q) => {
        const i = q.indexOf('\n');
        return { question: q.slice(4, i).trim(), answer: q.slice(i + 1).trim().replace(/\n+/g, ' ') };
      });
      content = { items };
    } else if (kind === 'callout') {
      const lm = text.match(/^\*\*(.+?)\*\*\s*\n([\s\S]+)$/);
      if (!lm) { fail(`${slug}: callout "${heading}" needs **Label** then body`); continue; }
      content = { label: lm[1].trim(), body: lm[2].trim().replace(/\n+/g, ' ') };
    } else if (kind === 'timeline' || kind === 'comparison_table') {
      content = {
        items: parseListItems(text).map((item) => {
          const im = item.match(/^\*\*(.+?)\*\*\s*[—:-]\s*(.+)$/);
          if (!im) fail(`${slug}: ${kind} item "${item.slice(0, 40)}" needs **Label** — value`);
          return im ? { label: im[1].trim(), value: im[2].trim() } : { label: item, value: '' };
        }),
      };
    } else if (kind === 'cta_strip') {
      content = {};
      for (const line of text.split('\n')) {
        const kv = line.match(/^([a-z_]+):\s*(.+)$/);
        if (kv) content[kv[1]] = kv[2].trim();
      }
      content.surface = 'premium';
    } else {
      content = { markdown: text };
    }
    out.push({ block_type: kind, heading, content });
  }
  return out;
};

const sectionText = (s) => {
  const c = s.content;
  if (c.markdown) return c.markdown;
  if (Array.isArray(c.items)) return c.items.map((i) => (typeof i === 'string' ? i : Object.values(i).join(' '))).join(' ');
  return Object.values(c).join(' ');
};

const checkLinks = (slug, text) => {
  for (const m of text.matchAll(/\]\(([^)]+)\)/g)) {
    const href = m[1];
    if (/^https:\/\/(toefl|playbook\.toefl)\.schood\.online(\/|$)/.test(href) || /^https:\/\/schood\.online(\/|$)/.test(href) || /^https:\/\/www\.ets\.org\//.test(href)) continue;
    if (href.startsWith('/plans/')) { if (!REQUIRED_PLANS.includes(href.slice(7))) fail(`${slug}: unknown plan link ${href}`); continue; }
    if (INTERNAL_APP_ROUTES.has(href)) continue;
    if (href.startsWith('/') && INTERNAL_SLUGS.has(href.slice(1).split(/[?#]/)[0])) continue;
    fail(`${slug}: link not allowed or unknown: ${href}`);
  }
};

// --- Load sources ----------------------------------------------------------
const registry = JSON.parse(readFileSync(join(premiumDir, '_sources.json'), 'utf8'));
const sourceByKey = new Map(registry.map((s) => [s.key, s]));

const guides = [];
for (const file of readdirSync(premiumDir).filter((f) => f.endsWith('.md')).sort()) {
  const { meta, body } = parseFrontMatter(readFileSync(join(premiumDir, file), 'utf8'), file);
  if (`${meta.slug}.md` !== file) fail(`${file}: slug mismatch`);
  for (const key of ['slug', 'title', 'summary', 'parent', 'sort_order', 'seo_description', 'sources']) if (!meta[key]) fail(`${file}: missing ${key}`);
  if (meta.parent && !MODULE_SLUGS.includes(meta.parent)) fail(`${file}: parent ${meta.parent} is not a contract module slug`);
  const sections = parseSections(body, meta.slug);
  const sources = meta.sources.split(';').map((s) => s.trim()).filter(Boolean).map((entry) => {
    const [key, ...note] = entry.split('|');
    const src = sourceByKey.get(key.trim());
    if (!src) fail(`${file}: unknown source ${key}`);
    return { src, note: note.join('|').trim() || null };
  }).filter((s) => s.src);
  let wordCount = 0;
  for (const s of sections) { wordCount += words(s.heading) + words(sectionText(s)); checkLinks(meta.slug, sectionText(s)); }
  if (sections.length < 20) fail(`${meta.slug}: ${sections.length} sections (< 20)`);
  if (wordCount < 3000) fail(`${meta.slug}: ${wordCount} words (< 3000)`);
  const headings = new Set();
  for (const s of sections) { if (headings.has(s.heading)) fail(`${meta.slug}: duplicate heading "${s.heading}"`); headings.add(s.heading); }
  guides.push({ meta, sections, sources, wordCount });
}
for (const slug of REQUIRED_GUIDES) if (!guides.some((g) => g.meta.slug === slug)) fail(`missing guide ${slug}`);

const plans = [];
for (const file of readdirSync(plansDir).filter((f) => f.endsWith('.json')).sort()) {
  const plan = JSON.parse(readFileSync(join(plansDir, file), 'utf8'));
  if (`${plan.slug}.json` !== file) fail(`${file}: slug mismatch`);
  if (!PLAN_TYPES.has(plan.plan_type)) fail(`${file}: bad plan_type`);
  if (plan.focus_section != null && !SECTIONS.has(plan.focus_section)) fail(`${file}: bad focus_section`);
  if (!(plan.score_min >= 0 && plan.score_max <= 120 && plan.score_min <= plan.score_max)) fail(`${file}: score window out of bounds`);
  const weeks = plan.schedule_json?.weeks ?? [];
  if (weeks.length * 7 !== plan.duration_days) fail(`${file}: ${weeks.length} weeks vs ${plan.duration_days} days`);
  for (const [i, w] of weeks.entries()) {
    if (!Array.isArray(w.focus) || w.focus.length === 0) fail(`${file}: week ${i + 1} needs focus[]`);
    if (!Array.isArray(w.tasks) || w.tasks.length < 4) fail(`${file}: week ${i + 1} needs 4+ tasks`);
    if (typeof w.hours !== 'number') fail(`${file}: week ${i + 1} needs hours`);
    if (!w.checkpoint) fail(`${file}: week ${i + 1} needs checkpoint`);
    for (const ref of [...(w.modules ?? []), ...(w.guides ?? [])]) if (!INTERNAL_SLUGS.has(ref)) fail(`${file}: week ${i + 1} unknown slug ${ref}`);
    for (const t of w.tasks) checkLinks(plan.slug, t);
  }
  plans.push(plan);
}
for (const slug of REQUIRED_PLANS) if (!plans.some((p) => p.slug === slug)) fail(`missing plan ${slug}`);

// Every source must be cited by at least one guide.
const usedSources = new Map();
for (const g of guides) for (const s of g.sources) usedSources.set(s.src.url, s.src);
for (const s of registry) if (!usedSources.has(s.url)) fail(`source ${s.key} is never cited`);

if (errors.length) {
  console.error('toefl-pb-premium: validation failed');
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

for (const g of guides) console.log(`${g.meta.slug.padEnd(40)} sections=${String(g.sections.length).padStart(3)} words=${g.wordCount}`);
for (const p of plans) console.log(`plan ${p.slug.padEnd(28)} ${p.duration_days}d weeks=${p.schedule_json.weeks.length} type=${p.plan_type}`);
if (process.argv.includes('--check')) process.exit(0);

// --- SQL ------------------------------------------------------------------------
const L = [];
L.push(`-- ============================================================================`);
L.push(`-- TOEFL Playbook premium guides (TOEFL iBT 2026 format)`);
L.push(`-- ----------------------------------------------------------------------------`);
L.push(`-- GENERATED by scripts/content/toefl-pb-premium.mjs from`);
L.push(`-- content/toefl-playbook/premium/*.md. Plan templates ship in ${PLANS_MIGRATION}.`);
L.push(`-- Do not edit by hand; edit the sources and re-run the generator.`);
L.push(`--`);
L.push(`-- Adds ${guides.length} premium guides (visibility = 'premium'), ${guides.reduce((n, g) => n + g.sections.length, 0)} sections, ${usedSources.size} official ETS sources,`);
L.push(`-- and page citations. Content only: no schema change, no`);
L.push(`-- update of existing rows (every insert is on conflict do nothing).`);
L.push(`-- Parent pages are the public modules from the toefl-pb-modules release; if a`);
L.push(`-- module is not present yet the guide is still inserted with parent_page_id null.`);
L.push(`-- ============================================================================`);
L.push('');
L.push('begin;');
L.push("set local lock_timeout = '5s';");
L.push('');
L.push('-- Sources ----------------------------------------------------------------------');
L.push('insert into public.toefl_playbook_sources (id, source_type, provider_key, title, url, summary, status, published_at, verified_at, last_checked_at, metadata)');
L.push('values');
L.push([...usedSources.values()].map((s) => `  (md5(${sqlText(`schood-toefl-pb-source:${s.url}`)})::uuid, 'official_url', 'ets', ${sqlText(s.title)}, ${sqlText(s.url)}, ${sqlText(s.summary)}, 'published', now(), ${sqlText(s.verified_at)}::timestamptz, ${sqlText(s.verified_at)}::timestamptz, ${sqlJson({ seeded_by: SEEDED_BY, document_date: s.document_date ?? null })})`).join(',\n'));
L.push('on conflict do nothing;');
L.push('');
L.push('-- Premium guide pages ----------------------------------------------------------');
for (const g of guides) {
  const m = g.meta;
  const meta = {
    seeded_by: SEEDED_BY,
    content_revision: CONTENT_REVISION,
    premium: true,
    teaser_for: m.parent,
    word_count: g.wordCount,
    section_count: g.sections.length,
    test_format: 'toefl-ibt-2026',
    score_scale: '1-6',
  };
  L.push('insert into public.toefl_playbook_pages (id, product_id, parent_page_id, page_type, module_key, slug, title, summary, status, visibility, locale_code, sort_order, seo_title, seo_description, seo_keywords, published_at, metadata)');
  L.push(`select md5(${sqlText(`schood-toefl-pb-page:${m.slug}`)})::uuid, ${sqlText(PRODUCT_ID)}::uuid,`);
  L.push(`  (select p.id from public.toefl_playbook_pages p where p.locale_code = 'en' and p.slug = ${sqlText(m.parent)} limit 1),`);
  L.push(`  'guide', ${sqlText(m.parent)}, ${sqlText(m.slug)}, ${sqlText(m.title)}, ${sqlText(m.summary)}, 'published', 'premium', 'en', ${Number(m.sort_order)},`);
  L.push(`  ${sqlText(m.seo_title || `${m.title} | TOEFL Playbook`)}, ${sqlText(m.seo_description)}, ${sqlText(`{${(m.seo_keywords || '').split(',').map((k) => `"${k.trim()}"`).filter((k) => k !== '""').join(',')}}`)}::text[], now(),`);
  L.push(`  ${sqlJson(meta)}`);
  L.push('where exists (select 1 from public.products where id = ' + sqlText(PRODUCT_ID) + '::uuid)');
  L.push('on conflict do nothing;');
  L.push('');
}
L.push('-- Sections ---------------------------------------------------------------------');
for (const g of guides) {
  L.push(`-- ${g.meta.slug}: ${g.sections.length} sections`);
  L.push('insert into public.toefl_playbook_page_sections (id, page_id, block_type, heading, status, sort_order, content, metadata)');
  L.push('select v.id, p.id, v.block_type, v.heading, \'published\', v.sort_order, v.content, v.metadata');
  L.push('from (values');
  L.push(g.sections.map((s, i) => {
    const n = i + 1;
    return `  (md5(${sqlText(`schood-toefl-pb-section:${g.meta.slug}:${n}`)})::uuid, ${sqlText(s.block_type)}, ${sqlText(s.heading)}, ${n}, ${sqlJson(s.content)}, ${sqlJson({ seeded_by: SEEDED_BY, content_revision: CONTENT_REVISION })})`;
  }).join(',\n'));
  L.push(') as v(id, block_type, heading, sort_order, content, metadata)');
  // Join by slug, not by the deterministic id, so sections attach even if a
  // row for this slug was created earlier by another release or the admin.
  L.push(`join public.toefl_playbook_pages p on p.locale_code = 'en' and p.slug = ${sqlText(g.meta.slug)}`);
  L.push('on conflict do nothing;');
  L.push('');
}
L.push('-- Citations (joined by url so a source row seeded by another release is reused) --');
L.push('insert into public.toefl_playbook_page_sources (page_id, source_id, sort_order, citation_note, is_primary)');
L.push('select p.id, s.id, v.sort_order, v.citation_note, v.is_primary');
L.push('from (values');
const links = [];
for (const g of guides) g.sources.forEach((s, i) => links.push(`  (${sqlText(g.meta.slug)}, ${sqlText(s.src.url)}, ${i + 1}, ${s.note ? sqlText(s.note) : 'null'}, ${i === 0 ? 'true' : 'false'})`));
L.push(links.join(',\n'));
L.push(') as v(page_slug, source_url, sort_order, citation_note, is_primary)');
L.push("join public.toefl_playbook_pages p on p.locale_code = 'en' and p.slug = v.page_slug");
L.push('join public.toefl_playbook_sources s on s.url = v.source_url');
L.push('on conflict do nothing;');
L.push('');
L.push('commit;');
L.push('');
const P = [];
P.push(`-- ============================================================================`);
P.push(`-- TOEFL Playbook plan templates (TOEFL iBT 2026 format)`);
P.push(`-- ----------------------------------------------------------------------------`);
P.push(`-- GENERATED by scripts/content/toefl-pb-premium.mjs from content/toefl-playbook/plans/*.json.`);
P.push(`-- Do not edit by hand; edit the sources and re-run the generator.`);
P.push(`-- ${plans.length} plan templates with week-by-week tasks, weekly hours, checkpoints and`);
P.push(`-- decision rules. score_min/score_max hold the ETS 0-120 comparison totals (the`);
P.push(`-- column is 0-120); the 1-6 band window lives in metadata.band_*.`);
P.push(`-- Content only: every insert is on conflict do nothing.`);
P.push(`-- ============================================================================`);
P.push('');
P.push('begin;');
P.push("set local lock_timeout = '5s';");
P.push('');
P.push('-- Plan templates ---------------------------------------------------------------');
P.push('insert into public.toefl_playbook_plan_templates (id, product_id, slug, plan_type, title, summary, duration_days, score_min, score_max, focus_section, intensity, status, published_at, schedule_json, metadata)');
P.push('select v.id, ' + sqlText(PRODUCT_ID) + "::uuid, v.slug, v.plan_type, v.title, v.summary, v.duration_days, v.score_min, v.score_max, v.focus_section, v.intensity, 'published', now(), v.schedule_json, v.metadata");
P.push('from (values');
// The playbook engine reads week.modules (and module_slugs/playbook_modules) for
// reading links, so premium guide slugs are merged into modules; `guides` is
// kept as authored for clarity.
const emitSchedule = (schedule) => ({
  ...schedule,
  weeks: schedule.weeks.map((w) => ({ ...w, modules: [...new Set([...(w.modules ?? []), ...(w.guides ?? [])])] })),
});
P.push(plans.map((p) => `  (md5(${sqlText(`schood-toefl-pb-plan:${p.slug}`)})::uuid, ${sqlText(p.slug)}, ${sqlText(p.plan_type)}, ${sqlText(p.title)}, ${sqlText(p.summary)}, ${p.duration_days}, ${p.score_min}, ${p.score_max}, ${p.focus_section == null ? 'null::text' : sqlText(p.focus_section)}, ${sqlText(p.intensity)}, ${sqlJson(emitSchedule(p.schedule_json))}, ${sqlJson({ ...p.metadata, seeded_by: PLANS_SEEDED_BY, content_revision: CONTENT_REVISION })})`).join(',\n'));
P.push(') as v(id, slug, plan_type, title, summary, duration_days, score_min, score_max, focus_section, intensity, schedule_json, metadata)');
P.push('where exists (select 1 from public.products where id = ' + sqlText(PRODUCT_ID) + '::uuid)');
P.push('on conflict do nothing;');
P.push('');
P.push('commit;');
P.push('');
const plansSql = P.join('\n');
const sql = L.join('\n');
if (process.argv.includes('--verify')) {
  // CI-friendly drift check: the committed migration must equal the generator output.
  let current = '';
  try { current = readFileSync(migrationPath, 'utf8'); } catch { /* missing file is drift */ }
  let currentPlans = '';
  try { currentPlans = readFileSync(plansMigrationPath, 'utf8'); } catch { /* missing file is drift */ }
  if (current.replace(/\r\n/g, '\n') !== sql || currentPlans.replace(/\r\n/g, '\n') !== plansSql) {
    console.error(`supabase/migrations/${MIGRATION} or ${PLANS_MIGRATION} is out of date; run node scripts/content/toefl-pb-premium.mjs`);
    process.exit(1);
  }
  console.log(`supabase/migrations/${MIGRATION} and ${PLANS_MIGRATION} are in sync with the sources`);
  process.exit(0);
}
writeFileSync(migrationPath, sql);
writeFileSync(plansMigrationPath, plansSql);
console.log(`wrote supabase/migrations/${MIGRATION} (${(Buffer.byteLength(sql) / 1024).toFixed(0)} KB)`);
console.log(`wrote supabase/migrations/${PLANS_MIGRATION} (${(Buffer.byteLength(plansSql) / 1024).toFixed(0)} KB)`);
