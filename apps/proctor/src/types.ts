import type { Row } from '../../../packages/assessment-web/src/client';
import type { ProctorPolicy } from '../../../packages/assessment-core/src/mod.ts';

export type Policy = Row & { id: string; title: string; policy: ProctorPolicy };
export type Session = Row & { id: string; candidate_id: string; state: string; policy_snapshot: ProctorPolicy; last_heartbeat_at: string | null };
export type IntegrityEvent = Row & { id: string; kind: string; source: string; occurred_at: string; received_at: string };
export type ReviewCase = Row & { id: string; title: string; state: string; disposition: string | null };
export type Finding = Row & { reviewer_id: string; disposition: string; rationale: string; evidence_event_ids: string[] };
export type RecordingCitation = Row & {id:string;finding_id:string;recording_id:string;from_sequence:number;to_sequence:number;recording_head_hash:string;from_chain_hash:string;to_chain_hash:string;start_ms:number;end_ms:number;media_count:number;gap_count:number;source:string;provenance:string};
export type SessionDetail = { session: Session; events: IntegrityEvent[]; cases: ReviewCase[]; findings: Finding[]; recording_citations?:RecordingCitation[];outcomes?:Record<string,CaseOutcome>;permissions: { observe: boolean; review: boolean; decide?: boolean } };
export type CaseOutcome = { adjudication: { disposition: string; rationale: string; created_at: string } | null; disclosure: { disposition: string; summary: string; created_at: string } | null };
export type Command = (action: string, data: Record<string, unknown>, success: string) => Promise<void>;
export type ScreenProps = { rows: Record<string, Row[]>; busy: boolean; command: Command };
export const identifier = (value: unknown) => String(value ?? '');
export const label = (value: unknown) => String(value ?? '').replaceAll('_', ' ');
/** Optional services this deployment can reach. Unset URLs hide the features
 * that would need them, so staff are never offered something that cannot launch. */
export const evidenceConfigured = Boolean(import.meta.env.VITE_PROCTOR_EVIDENCE_URL);
export { liveConfigured } from '../../../packages/assessment-web/src/live-proctor';
