export type GuideEvent = {
  journey_id: string;
  version_id: string;
  event: string;
  question_id: string | null;
  offer_id: string | null;
  audience: string | null;
  locale: string;
  campaign: string;
  created_at: string;
};
export type GuideMetric = Omit<GuideEvent, "journey_id" | "created_at"> & {
  count: number;
};

/** One cohort per anonymous journey. No answer values or IDs leave this aggregation. */
export function guideMetrics(
  rows: GuideEvent[],
): { groups: GuideMetric[]; funnel: GuideMetric[] } {
  const journeys = new Map<string, GuideEvent[]>();
  for (const row of rows) {
    journeys.set(row.journey_id, [
      ...(journeys.get(row.journey_id) ?? []),
      row,
    ]);
  }
  const details = new Map<string, GuideMetric>();
  const stages = new Map<string, GuideMetric>();
  const add = (
    map: Map<string, GuideMetric>,
    value: Omit<GuideMetric, "count">,
  ) => {
    const key = JSON.stringify(value);
    const existing = map.get(key);
    if (existing) existing.count++;
    else map.set(key, { ...value, count: 1 });
  };
  for (const events of journeys.values()) {
    events.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const latest = events.at(-1)!;
    const audience = [...events].reverse().find((e) => e.audience)?.audience ??
      null;
    const cohort = {
      version_id: latest.version_id,
      audience,
      locale: latest.locale,
      campaign: latest.campaign,
    };
    const seenDetails = new Set<string>();
    const seenStages = new Set<string>();
    for (const event of events) {
      const detail = {
        ...cohort,
        event: event.event,
        question_id: event.question_id,
        offer_id: event.offer_id,
      };
      const key = JSON.stringify(detail);
      if (!seenDetails.has(key)) {
        add(details, detail);
        seenDetails.add(key);
      }
      if (!seenStages.has(event.event)) {
        add(stages, {
          ...cohort,
          event: event.event,
          question_id: null,
          offer_id: null,
        });
        seenStages.add(event.event);
      }
    }
    if (seenStages.has('started') && seenStages.has('result')) {
      add(stages, { ...cohort, event: 'completed_from_starts', question_id: null, offer_id: null });
    }
  }
  return { groups: [...details.values()], funnel: [...stages.values()] };
}
