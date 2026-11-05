import { api } from '../api.ts';

// The admin console's calls (supabase/functions/schood-ai/admin/mod.ts). Every
// call needs the existing admin permission and its MFA policy; refusals come back
// as ApiError (admin_required / forbidden / mfa_required).

export interface ServiceSettings { ai_enabled: boolean; features: Record<string, boolean>; global_daily_calls: number; user_daily_calls: number; workspace_daily_calls: number; global_daily_usd: number | null }
export interface ProviderView { key: string; adapter: string; display_name: string; base_url: string; api_key_env: string; extra_headers: Record<string, string>; config: Record<string, string>; enabled: boolean; key_configured: boolean }
export interface ModelView {
  key: string; provider_key: string; model_id: string; display_name: string; capabilities: string[]; context_window: number | null; max_output: number | null;
  input_usd_per_mtok: number; output_usd_per_mtok: number; no_training: boolean; enabled: boolean;
}
export interface RouteView { key: string; model_keys: string[]; required_capabilities: string[]; require_no_training: boolean; max_output_tokens: number | null; temperature: number | null; enabled: boolean }
export interface UsageLine { key: string; calls: number; failed: number; error_rate: number; cost_usd: number; avg_latency_ms: number | null }
export interface TestResult { status: string; text?: string; model_key?: string; latency_ms: number | null; input_tokens?: number; output_tokens?: number; cost_usd?: number; code?: string | null }
export interface AdminWorkspace { id: string; kind: 'personal' | 'centre'; name: string; status: 'active' | 'suspended'; owner_id: string; contract_plan: string | null; contract_until: string | null; features: Record<string, boolean> }
export interface ReportView { id: string; reason: string; note: string | null; excerpt: string | null; status: 'open' | 'reviewed' | 'dismissed'; workspace_id: string | null; created_at: string }
export interface AuditView { id: number; workspace_id: string | null; actor_id: string | null; event: string; target_type: string | null; target_id: string | null; details: Record<string, unknown>; created_at: string }

export const adminApi = {
  settings: () => api<{ settings: ServiceSettings }>('admin/settings').then((r) => r.settings),
  saveSettings: (patch: Partial<ServiceSettings>) => api<{ settings: ServiceSettings }>('admin/settings', { method: 'PATCH', body: patch }).then((r) => r.settings),
  providers: () => api<{ providers: ProviderView[] }>('admin/providers').then((r) => r.providers),
  saveProvider: (provider: Omit<ProviderView, 'key_configured'>) => api<{ provider: ProviderView }>('admin/providers', { method: 'POST', body: provider }).then((r) => r.provider),
  models: () => api<{ models: ModelView[] }>('admin/models').then((r) => r.models),
  saveModel: (model: ModelView) => api<{ model: ModelView }>('admin/models', { method: 'POST', body: model }).then((r) => r.model),
  routes: () => api<{ routes: RouteView[] }>('admin/routes').then((r) => r.routes),
  saveRoute: (route: RouteView) => api<{ route: RouteView }>('admin/routes', { method: 'POST', body: route }).then((r) => r.route),
  test: (modelKey: string, prompt: string) => api<TestResult>('admin/test', { method: 'POST', body: { model_key: modelKey, prompt }, timeoutMs: 90_000 }),
  usage: (days: number) => api<{ days: number; by_model: UsageLine[]; by_feature: UsageLine[] }>('admin/usage', { query: { days: String(days) } }),
  workspaces: (q: string) => api<{ workspaces: AdminWorkspace[] }>('admin/workspaces', { query: { q } }).then((r) => r.workspaces),
  saveWorkspace: (id: string, patch: { features?: Record<string, boolean>; status?: 'active' | 'suspended' }) =>
    api<{ workspace: AdminWorkspace }>('admin/workspaces', { method: 'PATCH', body: { id, ...patch } }).then((r) => r.workspace),
  grant: (workspaceId: string, amount: number, reference: string, note: string) =>
    api<{ balance: { plan: number; pack: number; total: number } }>('admin/credits', { method: 'POST', body: { workspace_id: workspaceId, amount, reference, note: note || undefined } }).then((r) => r.balance),
  reports: (status: ReportView['status']) => api<{ reports: ReportView[] }>('admin/reports', { query: { status } }).then((r) => r.reports),
  reviewReport: (id: string, status: 'reviewed' | 'dismissed') => api('admin/reports', { method: 'PATCH', body: { id, status } }),
  audit: (filter: { event?: string; workspace_id?: string; before?: number }) =>
    api<{ events: AuditView[] }>('admin/audit', { query: { event: filter.event || undefined, workspace_id: filter.workspace_id || undefined, before: filter.before ? String(filter.before) : undefined } }).then((r) => r.events),
};
