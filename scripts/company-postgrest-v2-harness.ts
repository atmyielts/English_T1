// Shared interface for v2 scenarios. The driver owns the isolated database and
// records every HTTP status, swallowed database error and route reached.
// deno-lint-ignore-file no-explicit-any
import type { ConnectConfig } from '../supabase/functions/company/connect/shared.ts';
export interface V2Harness {
  call: (method: string, path: string, options?: {
    as?: string; body?: unknown; expect?: number | number[] | ((status: number) => boolean);
    label?: string; ip?: string; headers?: Record<string, string>; allowLog?: RegExp; allowDb?: RegExp;
  }) => Promise<{ status: number; body: any }>;
  sql: (query: string) => Promise<string>;
  area: (name: string, work: () => Promise<void>) => Promise<void>;
  eq: (label: string, actual: unknown, expected: unknown) => void;
  ok: (label: string, condition: unknown) => void;
  need: (value: any, label: string) => any;
  db: any;
  configureConnect: (config: ConnectConfig) => void;
  state: Record<string, any>;
  users: { owner: string; admin: string; manager: string; employee: string; employee2: string; otherOwner: string; staff: string };
}
