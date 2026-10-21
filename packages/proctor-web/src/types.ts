import type { ProctorPolicy } from '../../assessment-core/src/mod.ts';
export const BROWSER_EVENTS = ['focus_loss','focus_return','tab_hidden','tab_visible','fullscreen_enter','fullscreen_exit','copy','paste','cut','context_menu','online','offline','client_loaded'] as const;
export type BrowserEventKind = typeof BROWSER_EVENTS[number];
export interface BrowserEvent { stream_id: string; sequence: number; kind: BrowserEventKind; occurred_at: string }
export interface CandidateNotice { id: string; kind: 'warning' | 'paused' | 'resumed'; reason: string; issued_at: string; acknowledged: boolean;issuer_kind?:'user'|'system' }
export interface CandidateProctorState {
  session: { id: string; state: string; policy_snapshot: ProctorPolicy } | null;
  attempt: { state: string; deadline_at: string; section_deadline_at: string };
  notices: CandidateNotice[];
  server_time: string;
}
export type Preflight = { required: false } | { required: true; policy_id: string; title: string; policy: ProctorPolicy; consented: boolean; identity_verified: boolean; runtime_ready: boolean; consent_version: string; capture_required?:boolean; capture_enabled?:boolean; capture_protocol?:string };
export interface MonitoringStatus { pending: number; problem: string | null }
export interface EventStore {
  append(kind: BrowserEventKind, occurredAt: string): Promise<void>;
  pending(): Promise<BrowserEvent[]>;
  acknowledge(stream: string, sequences: number[]): Promise<void>;
  close(): void;
}
