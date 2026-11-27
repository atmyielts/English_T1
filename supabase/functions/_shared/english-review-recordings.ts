import { hasRecordedListening } from "./english-recorded-listening.ts";
import type { DictationReviewPayload } from "./english-review.ts";

export type ReviewRecording = { audio_url: string; starts_at_seconds: number; ends_at_seconds: number };
type Segment = {
  segment_index: number;
  segment_text: string;
  starts_at_seconds: number | null;
  ends_at_seconds: number | null;
};
type RecordingSource = { slug: string; audio_url: unknown; listening_segments?: Segment[] };
const tidy = (text: string) => text.normalize("NFC").replace(/\s+/g, " ").trim();

/** Resolve an existing review card to the exact authored timed segment. */
export const reviewDictationRecording = (
  payload: DictationReviewPayload,
  itemKey: string,
  source: RecordingSource | undefined,
): ReviewRecording | null => {
  if (!source || source.slug !== payload.source_slug || !hasRecordedListening(source.audio_url)) return null;
  const prefix = `listening:${payload.source_slug}:dictation:`;
  if (!itemKey.startsWith(prefix)) return null;
  const index = itemKey.slice(prefix.length);
  if (!/^\d+$/.test(index)) return null;
  const segment = source.listening_segments?.find((row) => row.segment_index === Number(index));
  if (!segment || tidy(segment.segment_text) !== tidy(payload.sentence)) return null;
  const { starts_at_seconds, ends_at_seconds } = segment;
  if (starts_at_seconds === null || ends_at_seconds === null || !Number.isFinite(starts_at_seconds) || !Number.isFinite(ends_at_seconds)
    || starts_at_seconds < 0 || ends_at_seconds <= starts_at_seconds) return null;
  return { audio_url: source.audio_url as string, starts_at_seconds, ends_at_seconds };
};

export const loadReviewRecordingSources = async (
  sb: any,
  productId: string | undefined,
  languageId: string,
  slugs: string[],
): Promise<Map<string, RecordingSource>> => {
  if (!productId || !slugs.length) return new Map();
  const { data, error } = await sb.from("listening_items")
    .select("slug, audio_url, listening_segments(segment_index, segment_text, starts_at_seconds, ends_at_seconds)")
    .eq("product_id", productId)
    .eq("language_id", languageId)
    .eq("status", "published")
    .not("audio_url", "is", null)
    .in("slug", [...new Set(slugs)]);
  if (error) return new Map(); // Keep the other due reviews available.
  return new Map(((data ?? []) as RecordingSource[]).map((source) => [source.slug, source]));
};
