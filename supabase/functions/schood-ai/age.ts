import { SchoodAIError, type RequestContext } from './types.ts';

// Whether a person is an adult, for price-table entries marked adultsOnly (a
// streak freeze bought with credits). Core does not know ages; areas that do
// register a source (the learner area's consent step records an age band).
// Any source saying 'minor' wins; without a source saying 'adult', the age is
// unknown and adults-only actions are refused (adult_required, with the reason).

export type AgeAnswer = 'adult' | 'minor' | null;
export type AgeSource = (ctx: RequestContext, userId: string) => Promise<AgeAnswer>;
const sources = new Map<string, AgeSource>();

/** Answers "is this person an adult?" from your area's data. Names are unique; register at module load. */
export function registerAgeSource(name: string, source: AgeSource): void {
  if (!/^[a-z][a-z0-9_.-]{1,60}$/.test(name)) throw new Error(`age source ${name} is invalid`);
  if (sources.has(name)) throw new Error(`age source ${name} is already registered`);
  sources.set(name, source);
}

/** Throws adult_required (403, reason minor or unknown) unless a source confirms an adult and none says minor. */
export async function requireAdult(ctx: RequestContext, userId: string | null): Promise<void> {
  if (!userId) throw new SchoodAIError('adult_required', 'This is only for adults.', 403, { reason: 'unknown' });
  let adult = false;
  for (const [name, source] of sources) {
    let answer: AgeAnswer = null;
    try {
      answer = await source(ctx, userId);
    } catch (cause) {
      // A broken source cannot confirm anyone; the others still decide.
      console.error(JSON.stringify({ event: 'schood_ai_age_source_failed', source: name, error: String(cause).slice(0, 200) }));
    }
    if (answer === 'minor') throw new SchoodAIError('adult_required', 'This is only for adults.', 403, { reason: 'minor' });
    if (answer === 'adult') adult = true;
  }
  if (!adult) throw new SchoodAIError('adult_required', 'Confirm your age first.', 403, { reason: 'unknown' });
}
