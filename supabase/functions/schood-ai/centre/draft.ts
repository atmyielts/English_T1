import type { Schema } from '../../../../packages/ai-core/src/mod.ts';
import { wrapUserMessage } from '../prompt.ts';
import { SchoodAIError, type ChatMessage, type RequestContext } from '../types.ts';

// One charged drafting call with a fact check: every number in the draft that looks
// like a score, a price, a percentage or a count must appear in the facts the model
// was given. One correction turn is allowed; a draft that still invents numbers is
// refused and the credits are refunded (the charge wraps both turns).

const NUMBER = /(?<![\p{L}\p{N}])(\d{1,3}(?:[  ,.]\d{3})+|\d+(?:[.,]\d+)?)(?![\p{L}\p{N}])/gu;

/** Numbers as written in a text, normalised (spaces and thousands separators removed, comma decimals as dots). */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(NUMBER)) {
    const raw = match[1];
    const grouped = /^\d{1,3}([  ,.]\d{3})+$/.test(raw) && !/^\d+[.,]\d{1,2}$/.test(raw);
    out.push(grouped ? raw.replace(/[  ,.]/g, '') : raw.replace(',', '.'));
  }
  return out;
}

/** Numbers in the draft that are not in the facts (small counts up to `free` are allowed). */
export function unknownNumbers(draft: string, facts: unknown, free = 10): string[] {
  const known = new Set(numbersIn(JSON.stringify(facts ?? {})).flatMap((value) => [value, String(Number(value))]));
  return [...new Set(numbersIn(draft).filter((value) => {
    const n = Number(value);
    if (Number.isFinite(n) && Number.isInteger(n) && n >= 0 && n <= free) return false;
    // Years and clock times are not facts about people.
    if (/^(19|20)\d{2}$/.test(value)) return false;
    return !known.has(value) && !known.has(String(n));
  }))];
}

export interface DraftInput<T> {
  key: string;
  system: string;
  /** What the person asked for, if they typed anything. */
  request?: string | null;
  /** The structured brief for the model (data, not instructions). */
  brief: string;
  schema: Schema<T>;
  /** The text fields of the result that must not invent numbers. */
  texts(result: T): string[];
  facts: unknown;
  reference?: string;
  free?: number;
  maxTokens?: number;
  /** Another rule the draft must keep: returns what to correct, or null. */
  extra?(result: T): string | null;
}

export async function draftChecked<T>(ctx: RequestContext, input: DraftInput<T>) {
  return await ctx.ai.charged({ key: input.key, mode: 'json', reference: input.reference }, async (session) => {
    const messages: ChatMessage[] = [
      { role: 'system', content: input.system },
      { role: 'user', content: `${input.brief}${input.request ? `\n\nThe person’s own request:\n${wrapUserMessage(input.request)}` : ''}` },
    ];
    let result = await session.json({ messages, schema: input.schema, maxTokens: input.maxTokens ?? 1200, temperature: 0.4 });
    const problems = (value: T) => {
      const unknown = input.texts(value).flatMap((text) => unknownNumbers(text, input.facts, input.free));
      return { unknown, other: input.extra?.(value) ?? null };
    };
    let found = problems(result);
    if (found.unknown.length || found.other) {
      messages.push({ role: 'assistant', content: JSON.stringify(result) });
      const fixes = [
        ...(found.unknown.length ? [`These numbers are not in the reference data: ${found.unknown.slice(0, 10).join(', ')}. Use only numbers from the reference data.`] : []),
        ...(found.other ? [found.other] : []),
      ];
      messages.push({ role: 'user', content: `${fixes.join(' ')} Rewrite and reply with the same JSON shape.` });
      result = await session.json({ messages, schema: input.schema, maxTokens: input.maxTokens ?? 1200, temperature: 0.2 });
      found = problems(result);
      if (found.unknown.length || found.other) throw new SchoodAIError('draft_unverified', 'The draft used facts that are not in the centre’s data, so it was not kept. Your credits were returned.', 422, { numbers: found.unknown.slice(0, 10), rule: found.other ? 'facts_only' : null });
    }
    return result;
  });
}
