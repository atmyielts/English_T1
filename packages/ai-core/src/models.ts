// The provider-agnostic model registry (docs/product/44_SCHOOD_AI.md, "Models").
// Providers, models and routes live in the database (ai_providers, ai_models,
// ai_model_routes) and are edited from the admin console. This module holds the pure
// rules both sides share: validation, which route serves a feature, which models on
// it qualify, and what a call cost.

export const CAPABILITIES = ['chat', 'stream', 'json', 'json_schema', 'vision', 'stt', 'tts'] as const;
export type Capability = (typeof CAPABILITIES)[number];
export const isCapability = (value: unknown): value is Capability => typeof value === 'string' && (CAPABILITIES as readonly string[]).includes(value);
export const ADAPTERS = ['openai_compatible', 'anthropic', 'google_gemini', 'cloudflare_workers_ai'] as const;
export type AdapterKind = (typeof ADAPTERS)[number];

export interface RegistryProvider {
  key: string;
  adapter: AdapterKind;
  displayName: string;
  baseUrl: string;
  /** Name of the Supabase secret that holds the key. Keys never sit in a table. */
  apiKeyEnv: string;
  /** Non-secret headers sent on every request (for example OpenRouter's X-Title). */
  headers: Record<string, string>;
  /** Non-secret adapter settings, for example Cloudflare's `account_id`. */
  config: Record<string, string>;
  enabled: boolean;
}
export interface RegistryModel {
  key: string;
  providerKey: string;
  /** The provider's own model id. */
  modelId: string;
  displayName: string;
  capabilities: Capability[];
  contextWindow: number | null;
  maxOutput: number | null;
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
  /** The provider contractually does not train on prompts (needed for children's chats when a route asks). */
  noTraining: boolean;
  enabled: boolean;
}
export interface RegistryRoute {
  key: string;
  modelKeys: string[];
  requiredCapabilities: Capability[];
  requireNoTraining: boolean;
  maxOutputTokens: number | null;
  temperature: number | null;
  enabled: boolean;
}
export interface Registry { providers: RegistryProvider[]; models: RegistryModel[]; routes: RegistryRoute[] }

export const PROVIDER_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{1,40}$/;
export const MODEL_KEY_PATTERN = /^[a-z0-9][a-z0-9_.:/-]{2,120}$/;
export const ROUTE_KEY_PATTERN = /^[a-z0-9][a-z0-9_.-]{1,60}$/;
/**
 * Secrets a provider may name. Well-known provider keys may only be sent to that
 * provider's own host, so a mistyped base URL cannot leak them; SCHOOD_AI_KEY_* is
 * for custom, Azure or self-hosted endpoints. Supabase and payment secrets can never
 * be named.
 */
export const KEY_ENV_HOSTS: Record<string, readonly string[]> = {
  OPENROUTER_API_KEY: ['openrouter.ai'],
  OPENAI_API_KEY: ['api.openai.com'],
  ANTHROPIC_API_KEY: ['api.anthropic.com'],
  GOOGLE_AI_API_KEY: ['generativelanguage.googleapis.com'],
  GEMINI_API_KEY: ['generativelanguage.googleapis.com'],
  GROQ_API_KEY: ['api.groq.com'],
  DEEPSEEK_API_KEY: ['api.deepseek.com'],
  MISTRAL_API_KEY: ['api.mistral.ai'],
  TOGETHER_API_KEY: ['api.together.xyz'],
  FIREWORKS_API_KEY: ['api.fireworks.ai'],
  XAI_API_KEY: ['api.x.ai'],
  // A Workers AI token only (Account › Workers AI › Read/Run), never the Pages deploy token.
  CLOUDFLARE_AI_API_TOKEN: ['api.cloudflare.com'],
};
export const CUSTOM_KEY_ENV = /^SCHOOD_AI_KEY_[A-Z0-9_]{1,40}$/;
/** Headers a provider row may not set: the adapter owns authentication. */
const RESERVED_HEADERS = /^(authorization|x-api-key|api-key|x-goog-api-key|cookie|host|content-length|content-type|anthropic-version)$/i;

export function keyEnvAllowed(env: string): boolean {
  return Object.hasOwn(KEY_ENV_HOSTS, env) || CUSTOM_KEY_ENV.test(env);
}
/** Whether this key may be sent to this base URL (https only; well-known keys to their own host). */
export function keyMayReach(env: string, baseUrl: string): boolean {
  let url: URL;
  try { url = new URL(baseUrl); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  if (CUSTOM_KEY_ENV.test(env)) return true;
  const hosts = KEY_ENV_HOSTS[env];
  return !!hosts && hosts.includes(url.hostname);
}

export function providerProblems(provider: RegistryProvider): string[] {
  const problems: string[] = [];
  if (!PROVIDER_KEY_PATTERN.test(provider.key)) problems.push('key');
  if (!(ADAPTERS as readonly string[]).includes(provider.adapter)) problems.push('adapter');
  if (!provider.displayName.trim() || provider.displayName.length > 80) problems.push('display_name');
  if (!keyEnvAllowed(provider.apiKeyEnv)) problems.push('api_key_env');
  else if (!keyMayReach(provider.apiKeyEnv, provider.baseUrl)) problems.push('base_url');
  const headers = Object.entries(provider.headers ?? {});
  if (headers.length > 10 || headers.some(([name, value]) => RESERVED_HEADERS.test(name) || !/^[A-Za-z0-9-]{1,60}$/.test(name) || typeof value !== 'string' || value.length > 300 || /[\r\n]/.test(value))) problems.push('headers');
  const config = Object.entries(provider.config ?? {});
  if (config.length > 10 || config.some(([name, value]) => !/^[a-z][a-z0-9_]{1,40}$/.test(name) || typeof value !== 'string' || value.length > 200)) problems.push('config');
  else if (provider.adapter === 'cloudflare_workers_ai' && !/^[0-9a-f]{32}$/.test(provider.config?.account_id ?? '')) problems.push('config');
  return problems;
}
export function modelProblems(model: RegistryModel): string[] {
  const problems: string[] = [];
  if (!MODEL_KEY_PATTERN.test(model.key)) problems.push('key');
  if (!PROVIDER_KEY_PATTERN.test(model.providerKey)) problems.push('provider_key');
  if (!model.modelId.trim() || model.modelId.length > 160 || model.modelId === 'openrouter/auto') problems.push('model_id');
  if (!model.capabilities.length || model.capabilities.some((cap) => !(CAPABILITIES as readonly string[]).includes(cap))) problems.push('capabilities');
  for (const [field, value] of [['input_usd_per_mtok', model.inputUsdPerMTok], ['output_usd_per_mtok', model.outputUsdPerMTok]] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 1000) problems.push(field);
  }
  for (const [field, value] of [['context_window', model.contextWindow], ['max_output', model.maxOutput]] as const) {
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 10_000_000)) problems.push(field);
  }
  return problems;
}
export function routeProblems(route: RegistryRoute): string[] {
  const problems: string[] = [];
  if (!ROUTE_KEY_PATTERN.test(route.key)) problems.push('key');
  if (!route.modelKeys.length || route.modelKeys.length > 8 || new Set(route.modelKeys).size !== route.modelKeys.length || route.modelKeys.some((key) => !MODEL_KEY_PATTERN.test(key))) problems.push('model_keys');
  if (route.requiredCapabilities.some((cap) => !(CAPABILITIES as readonly string[]).includes(cap))) problems.push('required_capabilities');
  if (route.maxOutputTokens !== null && (!Number.isInteger(route.maxOutputTokens) || route.maxOutputTokens < 16 || route.maxOutputTokens > 64000)) problems.push('max_output_tokens');
  if (route.temperature !== null && (!Number.isFinite(route.temperature) || route.temperature < 0 || route.temperature > 2)) problems.push('temperature');
  return problems;
}

/** What a call does: chat modes share the chat routes; speech has its own routes. */
export type CallMode = 'text' | 'json' | 'stream' | 'stt' | 'tts';

/**
 * Routes tried for a feature, most specific first. Chat: the exact credit key
 * (`tutor.reply`), its area (`tutor`), its tier (`tier.premium`), then `default`.
 * Speech never falls back to chat routes: `stt.speaking.turn`, `stt.speaking`, `stt`.
 * A matching route is final: its policy is never bypassed by falling through.
 */
export function routeKeysFor(feature: string, tier: string, mode: CallMode = 'text'): string[] {
  const area = feature.split('.')[0];
  const keys = mode === 'stt' || mode === 'tts' ? [`${mode}.${feature}`, `${mode}.${area}`, mode] : [feature, area, `tier.${tier}`, 'default'];
  return [...new Set(keys.filter(Boolean))];
}
export function pickRoute(routes: readonly RegistryRoute[], feature: string, tier: string, mode: CallMode = 'text'): RegistryRoute | null {
  const enabled = new Map(routes.filter((route) => route.enabled).map((route) => [route.key, route]));
  for (const key of routeKeysFor(feature, tier, mode)) {
    const route = enabled.get(key);
    if (route) return route;
  }
  return null;
}
/** Capabilities a call needs before the route's own requirements are added. */
export function modeCapabilities(mode: CallMode): Capability[] {
  return mode === 'stt' ? ['stt'] : mode === 'tts' ? ['tts'] : mode === 'json' ? ['chat', 'json'] : mode === 'stream' ? ['chat', 'stream'] : ['chat'];
}

export interface Requirements { capabilities: Capability[]; noTraining: boolean }
export type SkipReason = 'unknown' | 'disabled' | 'provider_disabled' | 'capability' | 'policy' | 'unhealthy';
export interface Candidate { model: RegistryModel; provider: RegistryProvider }

/** The route's models in order, keeping those that are enabled, capable, allowed by policy and healthy. */
export function candidateModels(registry: Registry, route: RegistryRoute, required: Requirements, healthy: (modelKey: string) => boolean = () => true): { candidates: Candidate[]; skipped: { key: string; reason: SkipReason }[] } {
  const models = new Map(registry.models.map((model) => [model.key, model]));
  const providers = new Map(registry.providers.map((provider) => [provider.key, provider]));
  const needs = new Set<Capability>([...route.requiredCapabilities, ...required.capabilities]);
  const noTraining = route.requireNoTraining || required.noTraining;
  const candidates: Candidate[] = [], skipped: { key: string; reason: SkipReason }[] = [];
  for (const key of route.modelKeys) {
    const model = models.get(key), provider = model ? providers.get(model.providerKey) : undefined;
    if (!model || !provider) skipped.push({ key, reason: 'unknown' });
    else if (!model.enabled) skipped.push({ key, reason: 'disabled' });
    else if (!provider.enabled) skipped.push({ key, reason: 'provider_disabled' });
    else if ([...needs].some((cap) => !satisfies(model.capabilities, cap))) skipped.push({ key, reason: 'capability' });
    else if (noTraining && !model.noTraining) skipped.push({ key, reason: 'policy' });
    else if (!healthy(key)) skipped.push({ key, reason: 'unhealthy' });
    else candidates.push({ model, provider });
  }
  return { candidates, skipped };
}
/** A model with strict schema output also does plain JSON. */
const satisfies = (capabilities: readonly Capability[], needed: Capability) =>
  capabilities.includes(needed) || (needed === 'json' && capabilities.includes('json_schema'));

/** USD cost of one call from token counts and the registry price per million tokens. */
export function costUsd(model: Pick<RegistryModel, 'inputUsdPerMTok' | 'outputUsdPerMTok'>, inputTokens: number, outputTokens: number): number {
  const cost = (Math.max(0, inputTokens) * model.inputUsdPerMTok + Math.max(0, outputTokens) * model.outputUsdPerMTok) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
/** A rough token count when a provider reports no usage (about four characters a token). */
export const estimateTokens = (chars: number): number => Math.ceil(Math.max(0, chars) / 4);
