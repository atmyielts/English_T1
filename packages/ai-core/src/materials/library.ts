import type { MaterialKindDefinition } from '../materials.ts';
import { SchemaError, type Schema } from '../schema.ts';
import { MATERIAL_KINDS } from './kinds.ts';
import { displayAnswer, materialText, questionNumbers, studentView } from './render.ts';
import { materialSchema, parseMaterial, versions, type Block, type Material } from './model.ts';

// The teacher material kinds for core's library (MaterialKindDefinition): one per
// T1 kind, sharing the material schema, the Markdown document a page's body is made
// from (the teacher's copy, key at the end) and Telegram text (the student version).
// The function registers these with registerMaterialKind; the app registers the
// same toMarkdown with its renderer.

const CLOZE = /\[\[([a-z][a-z0-9_-]{0,30})\]\]/g;
const escape = (value: string) => value.replace(/\|/g, '\\|');

function blockMarkdown(block: Block, numbers: Map<string, number>): string {
  const head = block.title ? `### ${block.title}\n\n` : '';
  switch (block.type) {
    case 'text': return `${head}${block.body.replace(CLOZE, (whole, id: string) => (numbers.has(id) ? `**(${numbers.get(id)})** ________` : whole))}`;
    case 'script': return `${head}${block.setting ? `*${block.setting}*\n\n` : ''}${block.lines.map((line) => `**${line.speaker}:** ${line.text}`).join('\n\n')}`;
    case 'questions': {
      const shared = block.options?.length ? `\n\n${block.options.map((option) => `- **${option.id}** ${option.text}`).join('\n')}` : '';
      const box = block.word_box?.length ? `\n\n> ${block.word_box.join(' · ')}` : '';
      const items = block.questions.map((question) => {
        const judgement = question.type === 'true_false' || question.type === 'true_false_not_given' || question.type === 'yes_no_not_given';
        const options = !judgement && question.options?.length ? `\n${question.options.map((option) => `   - ${option.id}. ${option.text}`).join('\n')}` : '';
        return `${numbers.get(question.id)}. ${question.prompt.trim() || '________'}${options}`;
      });
      return `${head}*${block.instructions}*${shared}${box}\n\n${items.join('\n')}`;
    }
    case 'words': return `${head}| Word | Meaning | Uzbek | Russian | Example |\n|---|---|---|---|---|\n${block.words.map((word) => `| **${escape(word.term)}**${word.part_of_speech ? ` *(${escape(word.part_of_speech)})*` : ''} | ${escape(word.meaning)} | ${escape(word.meaning_uz ?? '')} | ${escape(word.meaning_ru ?? '')} | ${escape(word.example ?? '')} |`).join('\n')}`;
    case 'cards': return `${head}${block.cards.map((card, index) => `**${index + 1}. ${card.title}**${card.role ? ` — *${card.role}*` : ''}\n\n${card.prompt}${card.points?.length ? `\n\n${card.points.map((point) => `- ${point}`).join('\n')}` : ''}${card.prep_seconds || card.talk_seconds ? `\n\n*${card.prep_seconds ? `${card.prep_seconds}s prep` : ''}${card.prep_seconds && card.talk_seconds ? ', ' : ''}${card.talk_seconds ? `${card.talk_seconds}s talk` : ''}*` : ''}`).join('\n\n')}`;
    case 'flashcards': return `${head}| Front | Back | Example |\n|---|---|---|\n${block.cards.map((card) => `| ${escape(card.front)} | ${escape(card.back)} | ${escape(card.example ?? '')} |`).join('\n')}`;
    case 'task': return `${head}${block.prompt}${block.words || block.minutes ? `\n\n*${[block.words ? `${block.words.min}–${block.words.max} words` : '', block.minutes ? `${block.minutes} minutes` : ''].filter(Boolean).join(' · ')}*` : ''}`;
    case 'model_answer': return `### ${block.title ?? 'Model answer'}\n\n> *Model answer (for teachers; share it as a model, not as the student's work).*\n\n${block.body}${block.notes?.length ? `\n\n${block.notes.map((note) => `- ${note}`).join('\n')}` : ''}`;
    case 'rubric': return `${head}| Criterion | Max | Description |\n|---|---|---|\n${block.criteria.map((criterion) => `| ${escape(criterion.name)} | ${criterion.max} | ${escape(criterion.description)} |`).join('\n')}`;
    case 'stages': return `${head}| Stage | Minutes | Aim | Steps | Interaction |\n|---|---|---|---|---|\n${block.stages.map((stage) => `| **${escape(stage.name)}** | ${stage.minutes} | ${escape(stage.aim)} | ${stage.steps.map(escape).join('<br>')} | ${escape(stage.interaction ?? '')} |`).join('\n')}${block.homework ? `\n\n**Homework:** ${block.homework}` : ''}`;
    case 'slides': return `${head}${block.slides.map((slide, index) => `**Slide ${index + 1}: ${slide.title}**\n\n${slide.bullets.map((bullet) => `- ${bullet}`).join('\n')}${slide.notes ? `\n\n*Notes: ${slide.notes}*` : ''}`).join('\n\n')}`;
    case 'outline': return `${head}${block.units.map((unit, index) => `**${index + 1}. ${unit.title}**${unit.weeks ? ` (${unit.weeks} weeks)` : ''}\n\n${[...unit.aims.map((aim) => `- ${aim}`), ...unit.can_do.map((line) => `- ✓ ${line}`)].join('\n')}${unit.grammar?.length ? `\n\n*Grammar:* ${unit.grammar.join(', ')}` : ''}${unit.vocabulary?.length ? `\n\n*Vocabulary:* ${unit.vocabulary.join(', ')}` : ''}${unit.skills?.length ? `\n\n*Skills:* ${unit.skills.join(', ')}` : ''}${unit.assessment ? `\n\n*Assessment:* ${unit.assessment}` : ''}`).join('\n\n')}`;
  }
}

function keyMarkdown(blocks: readonly Block[], numbers: Map<string, number>): string {
  const lines: string[] = [];
  for (const block of blocks) {
    if (block.type !== 'questions') continue;
    for (const question of block.questions) {
      if (question.type === 'open' || !question.answer.length) continue;
      lines.push(`${numbers.get(question.id)}. ${displayAnswer(question, block)}${question.explanation ? ` — *${question.explanation}*` : ''}`);
    }
  }
  return lines.length ? `## Answer key\n\n${lines.join('\n')}` : '';
}

/** The page body: the teacher's copy as Markdown, with each version and the answer key at the end. */
export function materialMarkdown(material: Material): string {
  const parts: string[] = [];
  if (material.aims?.length) parts.push(`**Aims:** ${material.aims.join('; ')}`);
  for (const version of versions(material)) {
    const numbers = questionNumbers(version.blocks);
    if (version.label !== 'core') parts.push(`## ${version.label === 'support' ? 'Support' : 'Stretch'} version (${version.level})`);
    else if (material.variants?.length) parts.push(`## Core version (${material.level})`);
    parts.push(...version.blocks.map((block) => blockMarkdown(block, numbers)).filter(Boolean));
    const key = keyMarkdown(version.blocks, numbers);
    if (key) parts.push(version.label === 'core' ? key : key.replace('## Answer key', `### Answer key (${version.label})`));
  }
  return parts.join('\n\n').trim();
}

/** Telegram text: the student version (no keys or model answers), in plain text. */
export const materialTelegram = (material: Material): string => materialText(studentView(material));

/** The material schema for one kind: a material of another kind is refused. */
export function kindSchema(kind: string): Schema<Material> {
  return {
    parse(value, path) {
      const material = parseMaterial(value);
      void path;
      if (material.kind !== kind) throw new SchemaError('kind', `expected ${kind}`);
      return material;
    },
    json: materialSchema.json,
  };
}

/** One library kind definition per T1 material kind. */
export const MATERIAL_KIND_DEFINITIONS: MaterialKindDefinition<Material>[] = /*#__PURE__*/ Object.keys(MATERIAL_KINDS).map((kind) => ({
  kind, schema: kindSchema(kind), toMarkdown: materialMarkdown, toTelegram: materialTelegram,
}));
