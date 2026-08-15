export const buildPlatformHref = (
  platformBaseUrl: string,
  pathname: string,
  params: Record<string, string | null | undefined> = {},
): string => {
  const normalizedBase = `${platformBaseUrl.replace(/\/+$/, '')}/`;
  const url = new URL(pathname.replace(/^\/+/, ''), normalizedBase);

  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '') return;
    url.searchParams.set(key, value);
  });

  return url.toString();
};
