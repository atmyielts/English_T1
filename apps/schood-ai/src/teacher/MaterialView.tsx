import { Fragment, type ReactNode } from 'react';
import { displayAnswer, FIXED_OPTIONS, questionNumbers, versions, type Block, type Material, type Question, type QuestionsBlock } from '../../../../packages/ai-core/src/materials/mod.ts';
import { Answer, Badge, useT } from '../core/index.ts';
import { loadMaterialMarkdown } from './markdown.ts';

void loadMaterialMarkdown();

// A teaching material drawn from its blocks: on screen, in the library, on a
// handout and on paper. `mode` decides what shows: the student copy (no key, no
// explanations, no model answers) or the teacher copy (key under each question).
// Maths renders with KaTeX through core's Answer; passages keep their paragraphs.

export type ViewMode = 'student' | 'teacher';
const CLOZE = /\[\[([a-z][a-z0-9_-]{0,30})\]\]/g;
const HAS_CLOZE = /\[\[[a-z][a-z0-9_-]{0,30}\]\]/;

function Cloze({ body, numbers }: { body: string; numbers: Map<string, number> }) {
  const parts: ReactNode[] = [];
  let last = 0, index = 0;
  for (const match of body.matchAll(CLOZE)) {
    parts.push(body.slice(last, match.index));
    const number = numbers.get(match[1]);
    parts.push(<span key={index++} className="mx-0.5 inline-block min-w-16 border-b-2 border-gray-500 px-1 text-center text-xs font-bold text-gray-600">{number ?? '?'}</span>);
    last = (match.index ?? 0) + match[0].length;
  }
  parts.push(body.slice(last));
  return <p className="m-0 whitespace-pre-wrap leading-7">{parts}</p>;
}

const judgement = (question: Question) => question.type === 'true_false' || question.type === 'true_false_not_given' || question.type === 'yes_no_not_given';

function QuestionItem({ question, block, number, mode }: { question: Question; block: QuestionsBlock; number: number; mode: ViewMode }) {
  const t = useT();
  const own = !judgement(question) && question.options?.length ? question.options : null;
  const blanks = question.type === 'gap' || question.type === 'short_answer' || question.type === 'numeric' || question.type === 'transformation' || question.type === 'error_correction';
  return <li className="break-inside-avoid py-1.5">
    <div className="flex gap-2">
      <span className="w-7 shrink-0 text-right font-bold tabular-nums text-gray-800">{number}.</span>
      <div className="min-w-0 flex-1">
        {question.prompt.trim() ? <Answer text={question.prompt.replace(/_{3,}/g, '\\_\\_\\_\\_\\_\\_\\_\\_')} className="material-prompt"/> : <span className="text-gray-500">________</span>}
        {own && <ol className={`m-0 mt-1 grid list-none gap-1 p-0 ${own.length > 3 && own.every((option) => option.text.length < 28) ? 'sm:grid-cols-2' : ''}`}>
          {own.map((option) => <li key={option.id} className="flex gap-2 text-sm"><span className="font-semibold">{option.id}</span><span className="min-w-0"><Answer text={option.text}/></span></li>)}
        </ol>}
        {judgement(question) && mode === 'student' && <p className="m-0 mt-1 text-xs text-gray-600">{(FIXED_OPTIONS[question.type] ?? []).map((option) => option.text).join(' / ')}</p>}
        {blanks && mode === 'student' && !question.prompt.includes('___') && <div className="mt-2 h-6 border-b border-dashed border-gray-400" aria-hidden="true"/>}
        {question.type === 'open' && mode === 'student' && <div className="mt-2 space-y-4" aria-hidden="true">{[0, 1, 2].map((line) => <div key={line} className="h-5 border-b border-gray-300"/>)}</div>}
        {mode === 'teacher' && question.type !== 'open' && question.answer.length > 0 && <p className="m-0 mt-1 rounded-xl bg-lime-soft/60 px-2 py-1 text-sm">
          <span className="font-semibold">{t('teacher.view.key')}:</span> {displayAnswer(question, block)}{question.explanation && <span className="text-gray-700"> — {question.explanation}</span>}
        </p>}
      </div>
    </div>
  </li>;
}

function BlockView({ block, numbers, mode }: { block: Block; numbers: Map<string, number>; mode: ViewMode }) {
  const t = useT();
  const title = block.title ? <h3 className="m-0 mb-2 font-display text-lg font-bold">{block.title}</h3> : null;
  switch (block.type) {
    case 'text': return <section className={block.role === 'passage' ? 'rounded-2xl bg-cream-soft/70 p-4 print:bg-transparent print:p-0' : ''}>{title}
      {HAS_CLOZE.test(block.body) ? <Cloze body={block.body} numbers={numbers}/> : <div className="space-y-3">{block.body.split(/\n{2,}/).map((paragraph, index) => <Answer key={index} text={paragraph}/>)}</div>}
    </section>;
    case 'script': return <section>{title}{block.setting && <p className="m-0 mb-2 text-sm italic text-gray-600">{block.setting}</p>}
      {mode === 'student' && block.role === 'listening'
        ? <p className="m-0 rounded-2xl border border-dashed border-navy-line/40 p-3 text-sm text-gray-700">{t('teacher.view.scriptHidden')}</p>
        : <dl className="m-0 grid gap-1.5">{block.lines.map((line, index) => <div key={index} className="grid grid-cols-[minmax(4rem,8rem)_1fr] gap-2"><dt className="font-semibold">{line.speaker}</dt><dd className="m-0">{line.text}</dd></div>)}</dl>}
    </section>;
    case 'questions': return <section className="break-inside-avoid-page">{title}
      <p className="m-0 mb-2 font-semibold italic text-gray-800">{block.instructions}</p>
      {block.options?.length ? <ul className="m-0 mb-2 grid list-none gap-1 rounded-2xl border border-navy-line/30 p-3 sm:grid-cols-2">{block.options.map((option) => <li key={option.id} className="text-sm"><span className="font-bold">{option.id}</span> {option.text}</li>)}</ul> : null}
      {block.word_box?.length ? <p className="m-0 mb-2 rounded-2xl border border-navy-line/30 p-3 text-sm">{block.word_box.join(' · ')}</p> : null}
      <ol className="m-0 list-none p-0">{block.questions.map((question) => <QuestionItem key={question.id} question={question} block={block} number={numbers.get(question.id) ?? 0} mode={mode}/>)}</ol>
    </section>;
    case 'words': return <section>{title}<div className="overflow-x-auto"><table className="w-full border-collapse text-sm">
      <thead><tr className="text-left text-xs uppercase tracking-wider text-gray-600"><th className="py-1 pr-3">{t('teacher.view.word')}</th><th className="py-1 pr-3">{t('teacher.view.meaning')}</th><th className="py-1 pr-3">O‘zbekcha</th><th className="py-1 pr-3">Русский</th><th className="py-1">{t('teacher.view.example')}</th></tr></thead>
      <tbody>{block.words.map((word, index) => <tr key={index} className="border-t border-navy-line/20 align-top"><td className="py-1.5 pr-3 font-semibold">{word.term}{word.part_of_speech && <span className="ml-1 text-xs font-normal italic text-gray-600">{word.part_of_speech}</span>}</td><td className="py-1.5 pr-3">{word.meaning}</td><td className="py-1.5 pr-3">{word.meaning_uz}</td><td className="py-1.5 pr-3">{word.meaning_ru}</td><td className="py-1.5 italic">{word.example}</td></tr>)}</tbody>
    </table></div></section>;
    case 'cards': return <section>{title}<div className="grid gap-3 sm:grid-cols-2 print:grid-cols-2">{block.cards.map((card, index) => <article key={index} className="break-inside-avoid rounded-2xl border-2 border-dashed border-navy-line/40 p-4">
      <h4 className="m-0 font-display font-bold">{card.title}</h4>{card.role && <p className="m-0 text-xs italic text-gray-600">{card.role}</p>}
      <p className="m-0 mt-2 text-sm">{card.prompt}</p>
      {card.points?.length ? <ul className="m-0 mt-2 pl-5 text-sm">{card.points.map((point, i) => <li key={i}>{point}</li>)}</ul> : null}
      {(card.prep_seconds || card.talk_seconds) ? <p className="m-0 mt-2 text-xs text-gray-600">{t('teacher.view.timing', { prep: card.prep_seconds ?? 0, talk: card.talk_seconds ?? 0 })}</p> : null}
    </article>)}</div></section>;
    case 'flashcards': return <section>{title}<div className="grid gap-2 sm:grid-cols-3 print:grid-cols-3">{block.cards.map((card, index) => <div key={index} className="break-inside-avoid rounded-2xl border border-navy-line/40 p-3 text-sm"><p className="m-0 font-semibold">{card.front}</p><p className="m-0 mt-1 text-gray-700">{card.back}</p>{card.example && <p className="m-0 mt-1 text-xs italic text-gray-600">{card.example}</p>}</div>)}</div></section>;
    case 'task': return <section className="rounded-2xl border border-navy-line/40 p-4">{title}<Answer text={block.prompt}/>{(block.words || block.minutes) && <p className="m-0 mt-2 text-sm font-semibold text-gray-700">{[block.words ? t('teacher.view.words', { min: block.words.min, max: block.words.max }) : '', block.minutes ? t('teacher.view.minutes', { count: block.minutes }) : ''].filter(Boolean).join(' · ')}</p>}</section>;
    case 'model_answer': return mode === 'student' ? null : <section className="rounded-2xl border border-sky-ai bg-sky-ai/20 p-4"><p className="m-0 mb-2"><Badge tone="sky">{t('teacher.view.model')}</Badge></p>{title}<div className="space-y-3">{block.body.split(/\n{2,}/).map((paragraph, index) => <Answer key={index} text={paragraph}/>)}</div>{block.notes?.length ? <ul className="m-0 mt-2 pl-5 text-sm">{block.notes.map((note, i) => <li key={i}>{note}</li>)}</ul> : null}</section>;
    case 'rubric': return <section>{title ?? <h3 className="m-0 mb-2 font-display text-lg font-bold">{t('teacher.view.rubric')}</h3>}<div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><tbody>{block.criteria.map((criterion) => <tr key={criterion.id} className="border-t border-navy-line/20 align-top"><td className="py-1.5 pr-3 font-semibold">{criterion.name}</td><td className="py-1.5 pr-3 tabular-nums">0–{criterion.max}</td><td className="py-1.5">{criterion.description}</td></tr>)}</tbody></table></div></section>;
    case 'stages': return <section>{title}<ol className="m-0 grid list-none gap-2 p-0">{block.stages.map((stage, index) => <li key={index} className="break-inside-avoid rounded-2xl border border-navy-line/30 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><strong>{index + 1}. {stage.name}</strong><span className="text-xs font-semibold text-gray-600">{t('teacher.view.minutes', { count: stage.minutes })}{stage.interaction ? ` · ${stage.interaction}` : ''}</span></div>
      <p className="m-0 mt-1 text-sm italic text-gray-700">{stage.aim}</p>
      <ul className="m-0 mt-1 pl-5 text-sm">{stage.steps.map((step, i) => <li key={i}>{step}</li>)}</ul>
      {stage.materials && <p className="m-0 mt-1 text-xs text-gray-600">{stage.materials}</p>}
    </li>)}</ol>{block.homework && <p className="m-0 mt-2 text-sm"><strong>{t('teacher.view.homework')}:</strong> {block.homework}</p>}</section>;
    case 'slides': return <section>{title}<ol className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">{block.slides.map((slide, index) => <li key={index} className="break-inside-avoid rounded-2xl border border-navy-line/30 p-3"><p className="m-0 text-xs font-semibold text-gray-600">{t('teacher.view.slide', { number: index + 1 })}</p><h4 className="m-0 font-display font-bold">{slide.title}</h4><ul className="m-0 mt-1 pl-5 text-sm">{slide.bullets.map((bullet, i) => <li key={i}>{bullet}</li>)}</ul>{mode === 'teacher' && slide.notes && <p className="m-0 mt-1 text-xs italic text-gray-600">{slide.notes}</p>}</li>)}</ol></section>;
    case 'outline': return <section>{title}<ol className="m-0 grid list-none gap-2 p-0">{block.units.map((unit, index) => <li key={index} className="break-inside-avoid rounded-2xl border border-navy-line/30 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><strong>{index + 1}. {unit.title}</strong>{unit.weeks && <span className="text-xs font-semibold text-gray-600">{t('teacher.view.weeks', { count: unit.weeks })}</span>}</div>
      <ul className="m-0 mt-1 pl-5 text-sm">{unit.aims.map((aim, i) => <li key={`a${i}`}>{aim}</li>)}{unit.can_do.map((line, i) => <li key={`c${i}`}>✓ {line}</li>)}</ul>
      {[['teacher.view.grammar', unit.grammar], ['teacher.view.vocabulary', unit.vocabulary], ['teacher.view.skills', unit.skills]].map(([label, list]) => (list as string[] | undefined)?.length ? <p key={label as string} className="m-0 mt-1 text-xs text-gray-700"><strong>{t(label as string)}:</strong> {(list as string[]).join(', ')}</p> : null)}
      {unit.assessment && <p className="m-0 mt-1 text-xs text-gray-700"><strong>{t('teacher.view.assessment')}:</strong> {unit.assessment}</p>}
    </li>)}</ol></section>;
  }
}

/** The whole material. `version` picks the core, support or stretch version; `keyAtEnd` moves the key to its own page. */
export function MaterialView({ material, mode = 'teacher', version = 'core', keyAtEnd = false }: { material: Material; mode?: ViewMode; version?: 'core' | 'support' | 'stretch'; keyAtEnd?: boolean }) {
  const t = useT();
  const chosen = versions(material).find((entry) => entry.label === version) ?? versions(material)[0];
  const numbers = questionNumbers(chosen.blocks);
  const inline = mode === 'teacher' && !keyAtEnd ? 'teacher' : 'student';
  return <div className="material-view space-y-5 text-[15px] leading-7 text-gray-900">
    {material.aims?.length ? <p className="m-0 text-sm text-gray-700"><strong>{t('teacher.view.aims')}:</strong> {material.aims.join('; ')}</p> : null}
    {chosen.label !== 'core' && <p className="m-0"><Badge tone="sky">{t(`teacher.variant.${chosen.label}`)} · {chosen.level}</Badge></p>}
    {chosen.blocks.filter((block) => mode === 'teacher' || block.type !== 'model_answer').map((block) => <Fragment key={block.id}><BlockView block={block} numbers={numbers} mode={inline}/></Fragment>)}
    {mode === 'teacher' && keyAtEnd && <KeyList blocks={chosen.blocks} numbers={numbers}/>}
  </div>;
}

function KeyList({ blocks, numbers }: { blocks: Block[]; numbers: Map<string, number> }) {
  const t = useT();
  const rows = blocks.flatMap((block) => block.type === 'questions' ? block.questions.filter((question) => question.type !== 'open' && question.answer.length).map((question) => ({ question, block })) : []);
  if (!rows.length) return null;
  return <section className="break-before-page pt-2">
    <h3 className="m-0 mb-2 font-display text-lg font-bold">{t('teacher.view.answerKey')}</h3>
    <ol className="m-0 grid list-none gap-1 p-0 sm:grid-cols-2 print:grid-cols-2">{rows.map(({ question, block }) => <li key={question.id} className="text-sm"><strong className="tabular-nums">{numbers.get(question.id)}.</strong> {displayAnswer(question, block)}</li>)}</ol>
  </section>;
}

/** The library's renderer for teacher kinds: the teacher copy on screen, the student copy with the key at the end in print. */
export default function LibraryMaterial({ material, print }: { material: unknown; print: boolean }) {
  return <MaterialView material={material as Material} mode="teacher" keyAtEnd={print}/>;
}
