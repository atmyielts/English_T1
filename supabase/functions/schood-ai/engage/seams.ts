import type { RequestContext } from '../types.ts';
import type { PassportItemKind } from './types.ts';

// Extension points other areas fill in at module load, so engage never reads their
// private tables. Each is documented in docs/product/ai-requests/engage.md.
//
//   registerPassportSource  the coach engine adds coach_certificates and mastery levels;
//   registerSampleSource    the coach engine resolves its own voice-clip references;
//   registerSittingSource   pricing returns the certificate-exam sittings a person bought;
//   registerOfferSource     pricing returns an honest offer for a milestone (annual plan).

export interface PassportSourceItem {
  kind: Exclude<PassportItemKind, 'sample'>;
  /** Stable id in the source (a certificate id). */
  ref: string;
  title: string;
  data: Record<string, unknown>;
  verifyUrl: string | null;
  verified: boolean;
  issuedAt: string | null;
}
export type PassportSource = (ctx: RequestContext, userId: string) => Promise<PassportSourceItem[]>;
const passportSources = new Map<string, PassportSource>();
export function registerPassportSource(name: string, source: PassportSource): void {
  if (!/^[a-z][a-z0-9_]{1,30}$/.test(name)) throw new Error(`passport source ${name} is invalid`);
  if (passportSources.has(name)) throw new Error(`passport source ${name} is already registered`);
  passportSources.set(name, source);
}
export const passportSourceEntries = () => [...passportSources];

/** Resolves a sample recorded by another area to a short-lived playback URL for its owner. */
export type SampleSource = (ctx: RequestContext, input: { userId: string; ref: string; ttlSeconds: number }) => Promise<string | null>;
const sampleSources = new Map<string, SampleSource>();
export function registerSampleSource(area: string, source: SampleSource): void {
  if (sampleSources.has(area)) throw new Error(`sample source ${area} is already registered`);
  sampleSources.set(area, source);
}
export const sampleSource = (area: string) => sampleSources.get(area) ?? null;

/** Purchased certificate sittings the person has: one reference per purchase (an entitlement or order id). */
export type SittingSource = (ctx: RequestContext, userId: string) => Promise<{ ref: string; examKey: string | null; expiresAt: string | null }[]>;
let sittingSource: SittingSource | null = null;
export function registerSittingSource(source: SittingSource): void {
  if (sittingSource) throw new Error('a sitting source is already registered');
  sittingSource = source;
}
export const currentSittingSource = () => sittingSource;
/** Tests only. */
export function resetSittingSource(): void { sittingSource = null; }

export interface Offer {
  key: string;
  /** Plan code shown on /plans; the price and terms come from the source, never from engage. */
  plan: string;
  title: string;
  terms: string;
  path: string;
}
export type OfferSource = (ctx: RequestContext, input: { userId: string; moment: 'graduation' | 'goal_done' | 'return' }) => Promise<Offer | null>;
let offerSource: OfferSource | null = null;
export function registerOfferSource(source: OfferSource): void {
  if (offerSource) throw new Error('an offer source is already registered');
  offerSource = source;
}
export const currentOfferSource = () => offerSource;
export function resetOfferSource(): void { offerSource = null; }
