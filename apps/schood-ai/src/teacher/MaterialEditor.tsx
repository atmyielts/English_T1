import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { SchemaError } from '../../../../packages/ai-core/src/mod.ts';
import { checkMaterial, CHOICE_TYPES, FIXED_OPTIONS, parseMaterial, TEXT_ROLES, type Block, type Choice, type Material, type Question, type QuestionsBlock } from '../../../../packages/ai-core/src/materials/mod.ts';
import { Badge, Button, Field, TextArea, TextInput, useT } from '../core/index.ts';
import { issueText } from './Checks.tsx';

// The structured editor for a teaching material: passages, scripts, question sets
// with their options and keys, word lists, cards and plans, for every version. The
// deterministic key checks run as you type (the same ai-core checks the function
// runs), and the strict schema is checked before anything is saved.

type Version = 'core' | 'support' | 'stretch';
const LETTERS = 'ABCDEFGHIJKL';
const lines = (value: string) => value.split('\n').map((line) => line.trim()).filter(Boolean);
const iconButton = 'inline-flex h-9 w-9 items-center justify-center rounded-full border border-navy-line/40 bg-white hover:bg-cream-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy disabled:opacity-40';

function blocksOf(material: Material, version: Version): Block[] {
  if (version === 'core') return material.blocks;
  return material.variants?.find((variant) => variant.label === version)?.blocks ?? [];
}
function withBlocks(material: Material, version: Version, blocks: Block[]): Material {
  if (version === 'core') return { ...material, blocks };
  return { ...material, variants: (material.variants ?? []).map((variant) => (variant.label === version ? { ...variant, blocks } : variant)) };
}

function OptionsEditor({ options, onChange, label }: { options: Choice[]; onChange(next: Choice[]): void; label: string }) {
  const t = useT();
  return <fieldset className="m-0 grid gap-2 border-0 p-0">
    <legend className="mb-1 text-sm font-semibold text-gray-800">{label}</legend>
    {options.map((option, index) => <div key={index} className="flex items-center gap-2">
      <span className="w-6 shrink-0 text-center text-sm font-bold">{option.id}</span>
      <TextInput aria-label={t('teacher.editor.optionText', { id: option.id })} value={option.text} onChange={(event) => onChange(options.map((entry, i) => (i === index ? { ...entry, text: event.target.value } : entry)))}/>
      <button type="button" className={iconButton} aria-label={t('teacher.editor.removeOption', { id: option.id })} disabled={options.length <= 2} onClick={() => onChange(options.filter((_, i) => i !== index).map((entry, i) => ({ ...entry, id: /^[A-L]$/.test(entry.id) ? LETTERS[i] : entry.id })))}><Trash2 size={14} aria-hidden="true"/></button>
    </div>)}
    {options.length < 12 && <Button size="sm" variant="ghost" icon={<Plus size={14} aria-hidden="true"/>} onClick={() => onChange([...options, { id: LETTERS[options.length] ?? String(options.length + 1), text: '' }])}>{t('teacher.editor.addOption')}</Button>}
  </fieldset>;
}

function KeyEditor({ question, block, onChange }: { question: Question; block: QuestionsBlock; onChange(answer: string[]): void }) {
  const t = useT();
  const pool = question.options?.length ? question.options : FIXED_OPTIONS[question.type] ?? block.options ?? [];
  if (question.type === 'open') return <p className="m-0 text-xs text-gray-600">{t('teacher.editor.openNoKey')}</p>;
  if (CHOICE_TYPES.includes(question.type) && question.type !== 'ordering') {
    const multi = question.type === 'multi_choice';
    return <fieldset className="m-0 border-0 p-0"><legend className="mb-1 text-sm font-semibold">{t('teacher.editor.key')}</legend>
      <div className="flex flex-wrap gap-2">{pool.map((option) => {
        const on = question.answer.includes(option.id);
        return <label key={option.id} className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm ${on ? 'border-navy bg-lime-soft font-semibold' : 'border-navy-line/40 bg-white'}`}>
          <input type={multi ? 'checkbox' : 'radio'} name={`key-${question.id}`} className="h-4 w-4" checked={on} onChange={() => onChange(multi ? (on ? question.answer.filter((id) => id !== option.id) : [...question.answer, option.id]) : [option.id])}/>
          {option.id}{option.text && option.text !== option.id ? ` · ${option.text.slice(0, 24)}` : ''}
        </label>;
      })}</div>
    </fieldset>;
  }
  if (question.type === 'ordering') return <Field label={t('teacher.editor.orderKey')} hint={t('teacher.editor.orderHint', { ids: pool.map((option) => option.id).join(', ') })}>{(id) =>
    <TextInput id={id} value={question.answer.join(', ')} onChange={(event) => onChange(event.target.value.split(/[\s,]+/).map((part) => part.trim().toUpperCase()).filter(Boolean))}/>}</Field>;
  return <Field label={question.type === 'numeric' ? t('teacher.editor.numberKey') : t('teacher.editor.textKey')} hint={question.type === 'numeric' ? undefined : t('teacher.editor.textKeyHint')}>{(id) =>
    <TextInput id={id} value={question.answer.join(' / ')} onChange={(event) => onChange(event.target.value.split('/').map((part) => part.trim()).filter(Boolean))}/>}</Field>;
}

function QuestionsEditor({ block, onChange }: { block: QuestionsBlock; onChange(next: QuestionsBlock): void }) {
  const t = useT();
  const setQuestion = (index: number, next: Question) => onChange({ ...block, questions: block.questions.map((question, i) => (i === index ? next : question)) });
  const move = (index: number, by: number) => {
    const questions = [...block.questions];
    const [item] = questions.splice(index, 1);
    questions.splice(index + by, 0, item);
    onChange({ ...block, questions });
  };
  return <div className="grid gap-3">
    <Field label={t('teacher.editor.instructions')}>{(id) => <TextArea id={id} rows={2} value={block.instructions} onChange={(event) => onChange({ ...block, instructions: event.target.value })}/>}</Field>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t('teacher.editor.wordLimit')} hint={t('teacher.editor.wordLimitHint')}>{(id) => <TextInput id={id} type="number" min={1} max={10} value={block.word_limit ?? ''} onChange={(event) => onChange({ ...block, word_limit: event.target.value ? Number(event.target.value) : undefined })}/>}</Field>
      <Field label={t('teacher.editor.wordBox')} hint={t('teacher.editor.wordBoxHint')}>{(id) => <TextInput id={id} value={(block.word_box ?? []).join(', ')} onChange={(event) => { const box = event.target.value.split(',').map((word) => word.trim()).filter(Boolean); onChange({ ...block, word_box: box.length ? box : undefined }); }}/>}</Field>
    </div>
    {block.options && <OptionsEditor label={t('teacher.editor.sharedOptions')} options={block.options} onChange={(options) => onChange({ ...block, options })}/>}
    <ol className="m-0 grid list-none gap-3 p-0">{block.questions.map((question, index) => <li key={question.id} className="rounded-2xl border border-navy-line/30 bg-cream-soft/50 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <strong className="text-sm">{t('teacher.checks.question', { number: index + 1 })}</strong>
        <Badge>{t(`teacher.qtype.${question.type}`)}</Badge>
        <span className="flex-1"/>
        <button type="button" className={iconButton} aria-label={t('teacher.editor.up')} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} aria-hidden="true"/></button>
        <button type="button" className={iconButton} aria-label={t('teacher.editor.down')} disabled={index === block.questions.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} aria-hidden="true"/></button>
        <button type="button" className={iconButton} aria-label={t('teacher.editor.removeQuestion')} disabled={block.questions.length <= 1} onClick={() => onChange({ ...block, questions: block.questions.filter((_, i) => i !== index) })}><Trash2 size={14} aria-hidden="true"/></button>
      </div>
      <div className="grid gap-3">
        <Field label={t('teacher.editor.prompt')} hint={question.type === 'gap' ? t('teacher.editor.gapHint') : undefined}>{(id) => <TextArea id={id} rows={2} value={question.prompt} onChange={(event) => setQuestion(index, { ...question, prompt: event.target.value })}/>}</Field>
        {question.options && !FIXED_OPTIONS[question.type] && <OptionsEditor label={t('teacher.editor.options')} options={question.options} onChange={(options) => setQuestion(index, { ...question, options, answer: question.answer.filter((id) => options.some((option) => option.id === id)) })}/>}
        <KeyEditor question={question} block={block} onChange={(answer) => setQuestion(index, { ...question, answer, ...(question.type === 'multi_choice' ? { choose: answer.length || undefined } : {}) })}/>
        {question.type !== 'open' && <Field label={t('teacher.editor.explanation')}>{(id) => <TextInput id={id} value={question.explanation ?? ''} onChange={(event) => setQuestion(index, { ...question, explanation: event.target.value || undefined })}/>}</Field>}
      </div>
    </li>)}</ol>
    {block.questions.length < 60 && <Button size="sm" variant="secondary" icon={<Plus size={14} aria-hidden="true"/>} onClick={() => {
      const last = block.questions.at(-1)!;
      const used = new Set(block.questions.map((question) => question.id));
      let n = block.questions.length + 1;
      while (used.has(`q${n}`) || used.has(`${last.id.replace(/\d+$/, '')}${n}`)) n++;
      const id = `${last.id.replace(/\d+$/, '')}${n}`;
      onChange({ ...block, questions: [...block.questions, { ...last, id, prompt: '', answer: [], explanation: undefined, ...(last.options && !FIXED_OPTIONS[last.type] ? { options: last.options.map((option) => ({ ...option, text: '' })) } : {}) }] });
    }}>{t('teacher.editor.addQuestion')}</Button>}
  </div>;
}

function ListField({ label, value, onChange, rows = 3 }: { label: string; value: string[]; onChange(next: string[]): void; rows?: number }) {
  const t = useT();
  return <Field label={label} hint={t('teacher.editor.oneLine')}>{(id) => <TextArea id={id} rows={rows} value={value.join('\n')} onChange={(event) => onChange(lines(event.target.value))}/>}</Field>;
}

function RowControls({ onRemove, disabled, label }: { onRemove(): void; disabled?: boolean; label: string }) {
  return <button type="button" className={iconButton} aria-label={label} disabled={disabled} onClick={onRemove}><Trash2 size={14} aria-hidden="true"/></button>;
}

function BlockEditor({ block, onChange }: { block: Block; onChange(next: Block): void }) {
  const t = useT();
  const title = <Field label={t('teacher.editor.blockTitle')}>{(id) => <TextInput id={id} value={block.title ?? ''} onChange={(event) => onChange({ ...block, title: event.target.value || undefined })}/>}</Field>;
  switch (block.type) {
    case 'text': return <div className="grid gap-3">{title}
      <Field label={t('teacher.editor.role')}>{(id) => <select id={id} className="min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm" value={block.role} onChange={(event) => onChange({ ...block, role: event.target.value as typeof block.role })}>{TEXT_ROLES.map((role) => <option key={role} value={role}>{t(`teacher.role.${role}`)}</option>)}</select>}</Field>
      <Field label={t('teacher.editor.body')} hint={t('teacher.editor.bodyHint')}>{(id) => <TextArea id={id} rows={Math.min(18, Math.max(5, Math.ceil(block.body.length / 90)))} value={block.body} onChange={(event) => onChange({ ...block, body: event.target.value })}/>}</Field>
    </div>;
    case 'script': return <div className="grid gap-3">{title}
      <Field label={t('teacher.editor.setting')}>{(id) => <TextInput id={id} value={block.setting ?? ''} onChange={(event) => onChange({ ...block, setting: event.target.value || undefined })}/>}</Field>
      {block.lines.map((line, index) => <div key={index} className="grid gap-2 sm:grid-cols-[9rem_1fr_auto]">
        <TextInput aria-label={t('teacher.editor.speaker')} value={line.speaker} onChange={(event) => onChange({ ...block, lines: block.lines.map((entry, i) => (i === index ? { ...entry, speaker: event.target.value } : entry)) })}/>
        <TextArea aria-label={t('teacher.editor.line')} rows={2} value={line.text} onChange={(event) => onChange({ ...block, lines: block.lines.map((entry, i) => (i === index ? { ...entry, text: event.target.value } : entry)) })}/>
        <RowControls label={t('teacher.editor.removeLine')} disabled={block.lines.length <= 1} onRemove={() => onChange({ ...block, lines: block.lines.filter((_, i) => i !== index) })}/>
      </div>)}
      <Button size="sm" variant="ghost" icon={<Plus size={14} aria-hidden="true"/>} onClick={() => onChange({ ...block, lines: [...block.lines, { speaker: block.lines.at(-1)?.speaker ?? 'A', text: '' }] })}>{t('teacher.editor.addLine')}</Button>
    </div>;
    case 'questions': return <div className="grid gap-3">{title}<QuestionsEditor block={block} onChange={onChange}/></div>;
    case 'words': return <div className="grid gap-3">{title}{block.words.map((word, index) => <div key={index} className="grid gap-2 rounded-2xl border border-navy-line/20 p-2 sm:grid-cols-[1fr_1.5fr_1fr_1fr_auto]">
      {(['term', 'meaning', 'meaning_uz', 'meaning_ru'] as const).map((key) => <TextInput key={key} aria-label={t(`teacher.editor.word.${key}`)} placeholder={t(`teacher.editor.word.${key}`)} value={word[key] ?? ''} onChange={(event) => onChange({ ...block, words: block.words.map((entry, i) => (i === index ? { ...entry, [key]: event.target.value } : entry)) })}/>)}
      <RowControls label={t('teacher.editor.removeRow')} disabled={block.words.length <= 1} onRemove={() => onChange({ ...block, words: block.words.filter((_, i) => i !== index) })}/>
      <TextInput className="sm:col-span-4" aria-label={t('teacher.editor.word.example')} placeholder={t('teacher.editor.word.example')} value={word.example ?? ''} onChange={(event) => onChange({ ...block, words: block.words.map((entry, i) => (i === index ? { ...entry, example: event.target.value || undefined } : entry)) })}/>
    </div>)}
      <Button size="sm" variant="ghost" icon={<Plus size={14} aria-hidden="true"/>} onClick={() => onChange({ ...block, words: [...block.words, { term: '', meaning: '' }] })}>{t('teacher.editor.addRow')}</Button></div>;
    case 'cards': return <div className="grid gap-3">{title}{block.cards.map((card, index) => <div key={index} className="grid gap-2 rounded-2xl border border-navy-line/20 p-3">
      <div className="flex gap-2"><TextInput aria-label={t('teacher.editor.cardTitle')} value={card.title} onChange={(event) => onChange({ ...block, cards: block.cards.map((entry, i) => (i === index ? { ...entry, title: event.target.value } : entry)) })}/><RowControls label={t('teacher.editor.removeRow')} disabled={block.cards.length <= 1} onRemove={() => onChange({ ...block, cards: block.cards.filter((_, i) => i !== index) })}/></div>
      <TextArea aria-label={t('teacher.editor.prompt')} rows={2} value={card.prompt} onChange={(event) => onChange({ ...block, cards: block.cards.map((entry, i) => (i === index ? { ...entry, prompt: event.target.value } : entry)) })}/>
      <ListField label={t('teacher.editor.points')} value={card.points ?? []} rows={2} onChange={(points) => onChange({ ...block, cards: block.cards.map((entry, i) => (i === index ? { ...entry, points: points.length ? points : undefined } : entry)) })}/>
    </div>)}<Button size="sm" variant="ghost" icon={<Plus size={14} aria-hidden="true"/>} onClick={() => onChange({ ...block, cards: [...block.cards, { title: '', prompt: '' }] })}>{t('teacher.editor.addRow')}</Button></div>;
    case 'flashcards': return <div className="grid gap-2">{title}{block.cards.map((card, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
      {(['front', 'back', 'example'] as const).map((key) => <TextInput key={key} aria-label={t(`teacher.editor.card.${key}`)} placeholder={t(`teacher.editor.card.${key}`)} value={card[key] ?? ''} onChange={(event) => onChange({ ...block, cards: block.cards.map((entry, i) => (i === index ? { ...entry, [key]: event.target.value } : entry)) })}/>)}
      <RowControls label={t('teacher.editor.removeRow')} disabled={block.cards.length <= 1} onRemove={() => onChange({ ...block, cards: block.cards.filter((_, i) => i !== index) })}/>
    </div>)}<Button size="sm" variant="ghost" icon={<Plus size={14} aria-hidden="true"/>} onClick={() => onChange({ ...block, cards: [...block.cards, { front: '', back: '' }] })}>{t('teacher.editor.addRow')}</Button></div>;
    case 'task': return <div className="grid gap-3">{title}
      <Field label={t('teacher.editor.prompt')}>{(id) => <TextArea id={id} rows={4} value={block.prompt} onChange={(event) => onChange({ ...block, prompt: event.target.value })}/>}</Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('teacher.editor.minWords')}>{(id) => <TextInput id={id} type="number" min={0} value={block.words?.min ?? ''} onChange={(event) => onChange({ ...block, words: { min: Number(event.target.value || 0), max: block.words?.max ?? 250 } })}/>}</Field>
        <Field label={t('teacher.editor.maxWords')}>{(id) => <TextInput id={id} type="number" min={1} value={block.words?.max ?? ''} onChange={(event) => onChange({ ...block, words: { min: block.words?.min ?? 0, max: Number(event.target.value || 1) } })}/>}</Field>
        <Field label={t('teacher.editor.minutes')}>{(id) => <TextInput id={id} type="number" min={1} value={block.minutes ?? ''} onChange={(event) => onChange({ ...block, minutes: event.target.value ? Number(event.target.value) : undefined })}/>}</Field>
      </div>
    </div>;
    case 'model_answer': return <div className="grid gap-3">{title}<Field label={t('teacher.view.model')}>{(id) => <TextArea id={id} rows={10} value={block.body} onChange={(event) => onChange({ ...block, body: event.target.value })}/>}</Field></div>;
    case 'rubric': return <div className="grid gap-2">{title}{block.criteria.map((criterion, index) => <div key={criterion.id} className="grid gap-2 sm:grid-cols-[1fr_6rem_2fr]">
      <TextInput aria-label={t('teacher.editor.criterion')} value={criterion.name} onChange={(event) => onChange({ ...block, criteria: block.criteria.map((entry, i) => (i === index ? { ...entry, name: event.target.value } : entry)) })}/>
      <TextInput aria-label={t('teacher.editor.max')} type="number" min={1} value={criterion.max} onChange={(event) => onChange({ ...block, criteria: block.criteria.map((entry, i) => (i === index ? { ...entry, max: Number(event.target.value || 1) } : entry)) })}/>
      <TextInput aria-label={t('teacher.editor.description')} value={criterion.description} onChange={(event) => onChange({ ...block, criteria: block.criteria.map((entry, i) => (i === index ? { ...entry, description: event.target.value } : entry)) })}/>
    </div>)}</div>;
    case 'stages': return <div className="grid gap-3">{title}{block.stages.map((stage, index) => <div key={index} className="grid gap-2 rounded-2xl border border-navy-line/20 p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_6rem_8rem_auto]">
        <TextInput aria-label={t('teacher.editor.stage')} value={stage.name} onChange={(event) => onChange({ ...block, stages: block.stages.map((entry, i) => (i === index ? { ...entry, name: event.target.value } : entry)) })}/>
        <TextInput aria-label={t('teacher.editor.minutes')} type="number" min={1} value={stage.minutes} onChange={(event) => onChange({ ...block, stages: block.stages.map((entry, i) => (i === index ? { ...entry, minutes: Number(event.target.value || 1) } : entry)) })}/>
        <TextInput aria-label={t('teacher.editor.interaction')} value={stage.interaction ?? ''} onChange={(event) => onChange({ ...block, stages: block.stages.map((entry, i) => (i === index ? { ...entry, interaction: event.target.value || undefined } : entry)) })}/>
        <RowControls label={t('teacher.editor.removeRow')} disabled={block.stages.length <= 1} onRemove={() => onChange({ ...block, stages: block.stages.filter((_, i) => i !== index) })}/>
      </div>
      <TextInput aria-label={t('teacher.editor.aim')} value={stage.aim} onChange={(event) => onChange({ ...block, stages: block.stages.map((entry, i) => (i === index ? { ...entry, aim: event.target.value } : entry)) })}/>
      <ListField label={t('teacher.editor.steps')} value={stage.steps} rows={3} onChange={(steps) => onChange({ ...block, stages: block.stages.map((entry, i) => (i === index ? { ...entry, steps: steps.length ? steps : [''] } : entry)) })}/>
    </div>)}<Button size="sm" variant="ghost" icon={<Plus size={14} aria-hidden="true"/>} onClick={() => onChange({ ...block, stages: [...block.stages, { name: '', minutes: 5, aim: '', steps: [''] }] })}>{t('teacher.editor.addRow')}</Button></div>;
    case 'slides': return <div className="grid gap-3">{title}{block.slides.map((slide, index) => <div key={index} className="grid gap-2 rounded-2xl border border-navy-line/20 p-3">
      <div className="flex gap-2"><TextInput aria-label={t('teacher.editor.slideTitle')} value={slide.title} onChange={(event) => onChange({ ...block, slides: block.slides.map((entry, i) => (i === index ? { ...entry, title: event.target.value } : entry)) })}/><RowControls label={t('teacher.editor.removeRow')} disabled={block.slides.length <= 1} onRemove={() => onChange({ ...block, slides: block.slides.filter((_, i) => i !== index) })}/></div>
      <ListField label={t('teacher.editor.bullets')} value={slide.bullets} rows={3} onChange={(bullets) => onChange({ ...block, slides: block.slides.map((entry, i) => (i === index ? { ...entry, bullets } : entry)) })}/>
    </div>)}<Button size="sm" variant="ghost" icon={<Plus size={14} aria-hidden="true"/>} onClick={() => onChange({ ...block, slides: [...block.slides, { title: '', bullets: [] }] })}>{t('teacher.editor.addRow')}</Button></div>;
    case 'outline': return <div className="grid gap-3">{title}{block.units.map((unit, index) => <div key={index} className="grid gap-2 rounded-2xl border border-navy-line/20 p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_6rem_auto]">
        <TextInput aria-label={t('teacher.editor.unit')} value={unit.title} onChange={(event) => onChange({ ...block, units: block.units.map((entry, i) => (i === index ? { ...entry, title: event.target.value } : entry)) })}/>
        <TextInput aria-label={t('teacher.editor.weeks')} type="number" min={1} value={unit.weeks ?? ''} onChange={(event) => onChange({ ...block, units: block.units.map((entry, i) => (i === index ? { ...entry, weeks: event.target.value ? Number(event.target.value) : undefined } : entry)) })}/>
        <RowControls label={t('teacher.editor.removeRow')} disabled={block.units.length <= 1} onRemove={() => onChange({ ...block, units: block.units.filter((_, i) => i !== index) })}/>
      </div>
      <ListField label={t('teacher.view.aims')} value={unit.aims} rows={2} onChange={(aims) => onChange({ ...block, units: block.units.map((entry, i) => (i === index ? { ...entry, aims } : entry)) })}/>
      <ListField label={t('teacher.editor.canDo')} value={unit.can_do} rows={2} onChange={(canDo) => onChange({ ...block, units: block.units.map((entry, i) => (i === index ? { ...entry, can_do: canDo } : entry)) })}/>
    </div>)}<Button size="sm" variant="ghost" icon={<Plus size={14} aria-hidden="true"/>} onClick={() => onChange({ ...block, units: [...block.units, { title: '', aims: [], can_do: [] }] })}>{t('teacher.editor.addRow')}</Button></div>;
  }
}

/** Edits a material; `onSave` gets a material that passed the strict schema. */
export function MaterialEditor({ material, onSave, saving, saveLabel }: { material: Material; onSave(next: Material): Promise<void> | void; saving?: boolean; saveLabel?: string }) {
  const t = useT();
  const [draft, setDraft] = useState<Material>(material);
  const [version, setVersion] = useState<Version>('core');
  const [problem, setProblem] = useState<string | null>(null);
  const checks = useMemo(() => { try { return checkMaterial(draft); } catch { return null; } }, [draft]);
  const blocks = blocksOf(draft, version);
  const dirty = JSON.stringify(draft) !== JSON.stringify(material);
  const save = async () => {
    setProblem(null);
    try {
      const parsed = parseMaterial(draft);
      await onSave(parsed);
    } catch (cause) {
      if (cause instanceof SchemaError) setProblem(t('teacher.editor.invalid', { path: cause.path || '—', problem: cause.problem }));
      else throw cause;
    }
  };
  return <div className="grid gap-4">
    <Field label={t('teacher.editor.title')}>{(id) => <TextInput id={id} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })}/>}</Field>
    {draft.variants?.length ? <div role="tablist" aria-label={t('teacher.editor.versions')} className="flex flex-wrap gap-2">
      {(['core', ...draft.variants.map((variant) => variant.label)] as Version[]).map((label) => <button key={label} role="tab" type="button" aria-selected={version === label} onClick={() => setVersion(label)}
        className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${version === label ? 'border-navy bg-navy text-white' : 'border-navy-line/40 bg-white'}`}>{t(`teacher.variant.${label}`)}</button>)}
    </div> : null}
    {blocks.map((block, index) => <section key={block.id} aria-label={t(`teacher.block.${block.type}`)} className="rounded-3xl border border-navy-line bg-white p-4">
      <p className="m-0 mb-3 text-xs font-semibold uppercase tracking-wider text-gray-600">{t(`teacher.block.${block.type}`)}</p>
      <BlockEditor block={block} onChange={(next) => setDraft(withBlocks(draft, version, blocks.map((entry, i) => (i === index ? next : entry))))}/>
    </section>)}
    <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-3xl border border-navy-line bg-cream-soft/95 p-3 shadow-sm backdrop-blur">
      <Button onClick={() => void save()} disabled={saving || !dirty}>{saving ? t('teacher.editor.saving') : saveLabel ?? t('teacher.editor.save')}</Button>
      {dirty && <Button variant="ghost" onClick={() => { setDraft(material); setProblem(null); }}>{t('teacher.editor.discard')}</Button>}
      {checks && <span className="text-sm text-gray-700" aria-live="polite">{checks.errors ? t('teacher.editor.liveErrors', { count: checks.errors }) : t('teacher.editor.liveClean')}</span>}
      {problem && <p role="alert" className="m-0 w-full text-sm text-red-700">{problem}</p>}
      {checks && checks.errors > 0 && <ul className="m-0 w-full list-disc pl-5 text-xs text-amber-900">{checks.issues.filter((issue) => issue.level === 'error').slice(0, 5).map((issue, index) => <li key={index}>{issueText(t, issue)}</li>)}</ul>}
    </div>
  </div>;
}
