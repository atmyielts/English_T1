export const hasRecordedListening = (value: unknown): boolean => typeof value === 'string' && /^https:\/\/\S+$/i.test(value);

export const loadRecordedListeningSlugs = async (sb: any, languageId: string, productId?: string): Promise<Set<string>> => {
  let query = sb.from('listening_items').select('slug,audio_url')
    .eq('language_id', languageId).eq('status', 'published').not('audio_url', 'is', null);
  if (productId) query = query.eq('product_id', productId);
  const { data, error } = await query;
  if (error) throw error;
  return new Set(((data ?? []) as { slug: string; audio_url: unknown }[])
    .filter((item) => hasRecordedListening(item.audio_url)).map((item) => item.slug));
};

export const playableCatalog = async <T extends { skill: string; slug: string }>(
  sb: any, languageId: string, items: T[],
): Promise<T[]> => {
  if (!items.some((item) => item.skill === 'listening')) return items;
  // Keep the other skills available if the optional recording lookup fails.
  const recorded = await loadRecordedListeningSlugs(sb, languageId).catch(() => new Set<string>());
  return items.filter((item) => item.skill !== 'listening' || recorded.has(item.slug));
};
