import type { AdapterKind } from '../../../../packages/ai-core/src/mod.ts';
import { anthropic } from './anthropic.ts';
import { cloudflareWorkersAi } from './cloudflare_workers_ai.ts';
import { googleGemini } from './google_gemini.ts';
import { openaiCompatible } from './openai_compatible.ts';
import type { Adapter } from './types.ts';

export * from './types.ts';

/** Every protocol the registry can name in ai_providers.adapter. */
export const ADAPTERS: Record<AdapterKind, Adapter> = {
  openai_compatible: openaiCompatible,
  anthropic,
  google_gemini: googleGemini,
  cloudflare_workers_ai: cloudflareWorkersAi,
};
