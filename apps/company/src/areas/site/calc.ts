// The value calculator's arithmetic: only the visitor's own numbers, no benchmarks and
// no prices of ours. A blank input stays blank, so a result appears only when every
// number it needs was given.

export interface CalcInput {
  people: number | null;
  spend: number | null;
  leavers: number | null;
  costPerLeaver: number | null;
  hoursPerWeek: number | null;
  weeks: number | null;
  hourlyCost: number | null;
  quote: number | null;
  avoidablePercent: number | null;
}

export interface CalcResult {
  spendPerPerson: number | null;
  turnoverCost: number | null;
  timeCost: number | null;
  /** Sum of the parts that are known; null until at least one is. */
  totalToday: number | null;
  /** The costs a programme could touch: turnover and time. */
  addressable: number | null;
  saving: number | null;
  net: number | null;
  breakEvenPercent: number | null;
  breakEvenLeavers: number | null;
  breakEvenHours: number | null;
}

const known = (value: number | null): value is number => value !== null && Number.isFinite(value) && value >= 0;
const finite = (value: number): number | null => Number.isFinite(value) ? value : null;
const product = (...values: (number | null)[]) => values.every(known) ? finite((values as number[]).reduce((a, b) => a * b, 1)) : null;
const ratio = (top: number | null, bottom: number | null) => known(top) && known(bottom) && bottom > 0 ? finite(top / bottom) : null;

export function calculate(input: CalcInput): CalcResult {
  const turnoverCost = product(input.leavers, input.costPerLeaver);
  const timeCost = product(input.people, input.hoursPerWeek, input.weeks, input.hourlyCost);
  const parts = [input.spend, turnoverCost, timeCost].filter(known);
  const costs = [turnoverCost, timeCost].filter(known);
  const addressable = costs.length ? finite(costs.reduce((a, b) => a + b, 0)) : null;
  const saving = known(addressable) && known(input.avoidablePercent) ? finite(addressable * (Math.min(input.avoidablePercent, 100) / 100)) : null;
  const hourValue = product(input.people, input.weeks, input.hourlyCost);
  return {
    spendPerPerson: ratio(input.spend, input.people),
    turnoverCost,
    timeCost,
    totalToday: parts.length ? finite(parts.reduce((a, b) => a + b, 0)) : null,
    addressable,
    saving,
    net: known(saving) && known(input.quote) ? finite(saving - input.quote) : null,
    breakEvenPercent: known(input.quote) ? (() => { const share = ratio(input.quote, addressable); return share === null ? null : finite(share * 100); })() : null,
    breakEvenLeavers: ratio(input.quote, input.costPerLeaver),
    breakEvenHours: ratio(input.quote, hourValue),
  };
}

/** Reads a typed number: spaces and commas as thousands are fine; anything else is blank. */
export function parseAmount(value: string): number | null {
  const cleaned = value.replace(/[\s ,]/g, '');
  if (cleaned === '') return null;
  const number = Number(cleaned);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
