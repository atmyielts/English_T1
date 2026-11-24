import { coreUnitMinutes, intensiveLevels, intensiveSkills, type IntensiveSkill, type Unit } from '../../supabase/functions/_shared/english-intensive.ts';

const [directory, output] = Deno.args;
if (!directory || !output) throw Error('Usage: build-intensive-seed.ts <content directory> <migration file or --check>');

const normal = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const optionText = (text: string): string => text.normalize('NFC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim().replace(/\s+/g, ' ');
const packetSlugs = new Set<string>();
const titles = new Set<string>();
const sources = new Set<string>();
const questions = new Set<string>();
const wordsAtLeast = { A1: 55, A2: 65, B1: 100, B2: 115, C1: 140, C2: 150 };
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const inserts: string[] = [];
const errors: string[] = [];
let count = 0;

for (const level of intensiveLevels) {
  const entries = [...Deno.readDirSync(`${directory}/${level}`)].filter((entry) => entry.isFile && entry.name.endsWith('.json'))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (entries.length !== 11) errors.push(`${level}: expected 11 dossiers, found ${entries.length}`);

  for (const [index, entry] of entries.entries()) {
    const id = `${level}/${entry.name}`;
    const check = (ok: unknown, problem: string) => { if (!ok) errors.push(`${id}: ${problem}`); };
    const text = (value: unknown, label: string, maximum = 6000) =>
      check(typeof value === 'string' && value.trim().length && value.length <= maximum, `${label} is missing or too long`);
    const list = (list: unknown, label: string, minimum: number, maximum = 12) => {
      check(Array.isArray(list) && list.length >= minimum && list.length <= maximum, `${label} must have ${minimum} to ${maximum} items`);
      if (Array.isArray(list)) list.forEach((value) => text(value, label, 800));
    };

    try {
      const unit = JSON.parse(Deno.readTextFileSync(`${directory}/${id}`).replace(/^\uFEFF/, '')) as Unit;
      const intro: string[] = [];
      const guide = { ...unit.guide };
      for (const paragraph of unit.summary.split(/\r?\n\s*\r?\n/)) {
        const prefix = paragraph.match(/^([a-z]+)(?:\s+\(when available\))?:\s+/i);
        const skill = prefix?.[1]?.toLowerCase() as IntensiveSkill | undefined;
        if (prefix && skill && intensiveSkills.includes(skill)) guide[skill] = paragraph.slice(prefix[0].length);
        else intro.push(paragraph);
      }
      unit.summary = intro.join('\n\n');
      unit.guide = guide;
      text(unit.slug, 'slug', 120);
      check(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(unit.slug), 'invalid slug');
      check(unit.level === level && entry.name === `${unit.slug}.json`, 'level and filename must match the dossier');
      text(unit.title, 'title', 200);
      text(unit.summary, 'summary', 800);
      check(!packetSlugs.has(unit.slug) && !titles.has(normal(unit.title)), 'duplicate dossier slug or title');
      packetSlugs.add(unit.slug);
      titles.add(normal(unit.title));

      for (const type of ['documents', 'recordings'] as const) {
        const stories = unit[type];
        check(stories.length === 2, `${type} must have two sources`);
        for (const source of stories) {
          text(source.title, `${type} title`, 200);
          text(source.text, `${type} text`);
          const normalized = normal(source.text);
          check(normalized.split(' ').length >= wordsAtLeast[level], `${type} source lacks enough substance for this level`);
          check(!sources.has(normalized), 'source text has already appeared');
          sources.add(normalized);
        }
      }
      for (const recording of unit.recordings) {
        check(!recording.audio_url, 'first release keeps Listening scripts ready for the studio recording');
      }

      for (const [name, quiz] of [['Reading', unit.reading], ['Listening', unit.listening], ['Grammar', unit.grammar.questions]] as const) {
        check(quiz.length >= (name === 'Grammar' ? 8 : 6) && quiz.length <= 20, `${name} question count is out of range`);
        for (const question of quiz) {
          text(question.prompt, `${name} prompt`, 700);
          list(question.options, `${name} options`, 4, 4);
          check(new Set(question.options.map(optionText)).size === 4, `${name} has repeated options`);
          check(Number.isInteger(question.answer) && question.answer >= 0 && question.answer <= 3, `${name} answer index is invalid`);
          text(question.explanation, `${name} explanation`, 800);
          const key = normal(question.prompt + ' ' + question.options.join(' '));
          check(!questions.has(key), `duplicate ${name} exercise`);
          questions.add(key);
        }
      }

      text(unit.grammar.focus, 'grammar focus', 200);
      for (const guidance of Object.values(guide)) text(guidance, 'session guidance', 1200);
      text(unit.grammar.explanation, 'grammar explanation', 1000);
      text(unit.grammar.transfer, 'grammar transfer', 1000);
      check(unit.grammar.examples.length >= 3, 'add at least three worked grammar examples');
      for (const example of unit.grammar.examples) {
        for (const name of ['before', 'after', 'why'] as const) text(example[name], `grammar example ${name}`, 800);
        check(normal(example.before) !== normal(example.after) || example.before !== example.after, 'grammar example has no edit');
      }

      check(unit.vocabulary.length >= 12, 'add at least twelve vocabulary items');
      check(new Set(unit.vocabulary.map(({ word }) => normal(word))).size === unit.vocabulary.length, 'repeated entry in vocabulary deck');
      for (const vocabulary of unit.vocabulary) {
        for (const name of ['word', 'meaning', 'example', 'pair'] as const) text(vocabulary[name], `vocabulary ${name}`, 800);
      }

      for (const skill of ['speaking', 'writing'] as const) {
        for (const entry of ['audience', 'first', 'change', 'second'] as const) text(unit[skill][entry], `${skill} ${entry}`, 1200);
        list(unit[skill].checklist, `${skill} self-check`, 3);
        check(normal(unit[skill].first) !== normal(unit[skill].second), `${skill} revision must change the task`);
      }
      for (const field of ['role', 'goal', 'change'] as const) text(unit.immersion[field], `immersion ${field}`, 1000);
      list(unit.immersion.constraints, 'immersion constraints', 2);
      list(unit.immersion.deliverables, 'immersion deliverables', 2);
      list(unit.immersion.checklist, 'immersion self-check', 3);

      const tag = '$intensive_packet$';
      const json = JSON.stringify(unit);
      check(!json.includes(tag), 'content contains the reserved SQL marker');
      inserts.push(`insert into public.english_intensive_units (slug, level, title, summary, position, packet)\nvalues (${[unit.slug, level, unit.title, unit.summary].map(literal).join(', ')}, ${index + 1}, ${tag}${json}${tag}::jsonb)\non conflict (slug) do nothing;`);
      count++;
    } catch (error) {
      errors.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  Deno.exit(1);
}
if (output !== '--check') {
  Deno.writeTextFileSync(output, `-- Generated with scripts/english-content/build-intensive-seed.ts from English Hub intensive units.\n${inserts.join('\n\n')}\n`);
}
console.log(`${count} dossiers validated. ${coreUnitMinutes} suggested study minutes per dossier with Listening pending.`);
