export type EnglishRouteContext = {
  sourceService: string | null;
  intent: string | null;
  skill: string | null;
  reason: string | null;
  planItemId: string | null;
  targetId: string | null;
};

export const emptyRouteContext = (): EnglishRouteContext => ({
  sourceService: null,
  intent: null,
  skill: null,
  reason: null,
  planItemId: null,
  targetId: null,
});

const readValue = (params: URLSearchParams, key: string): string | null => {
  const value = params.get(key)?.trim();
  return value ? value : null;
};

export const readEnglishRouteContext = (
  search: string | URLSearchParams,
): EnglishRouteContext => {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  return {
    sourceService: readValue(params, 'source_service') ?? readValue(params, 'from'),
    intent: readValue(params, 'intent'),
    skill: readValue(params, 'skill'),
    reason: readValue(params, 'reason'),
    planItemId: readValue(params, 'plan_item_id'),
    targetId: readValue(params, 'target_id'),
  };
};

export const hasEnglishRouteContext = (context: EnglishRouteContext): boolean =>
  Boolean(
    context.sourceService ||
      context.intent ||
      context.skill ||
      context.reason ||
      context.planItemId ||
      context.targetId,
  );

export const withEnglishRouteContext = (
  href: string,
  context: Partial<EnglishRouteContext>,
): string => {
  const isAbsoluteHref = /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//');
  const base =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://english.schood.online';
  const url = new URL(href, base);
  const entries: Array<[string, string | null | undefined]> = [
    ['source_service', context.sourceService],
    ['intent', context.intent],
    ['skill', context.skill],
    ['reason', context.reason],
    ['plan_item_id', context.planItemId],
    ['target_id', context.targetId],
  ];

  entries.forEach(([key, value]) => {
    if (value && value.trim()) url.searchParams.set(key, value.trim());
  });

  return isAbsoluteHref ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
};

export const formatRouteContextReason = (reason: string | null): string | null =>
  reason ? reason.replace(/[-_]+/g, ' ') : null;

export const formatRouteContextSource = (sourceService: string | null): string | null => {
  if (!sourceService) return null;
  return sourceService
    .split(/[-_]+/)
    .map((part) => (part ? part.slice(0, 1).toUpperCase() + part.slice(1) : part))
    .join(' ');
};
