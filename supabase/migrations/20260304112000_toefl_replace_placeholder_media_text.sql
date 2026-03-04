-- Replace TOEFL launch placeholder/sample media and source text with internal assets.
do $$
declare
  target_product_id constant uuid := 'b262ffa8-9912-4eba-93d7-58af3164d1cc';
begin
  -- 1) Replace sample Wikimedia audio URLs with internal generated TOEFL audio assets.
  with toefl_audio as (
    select
      cu.id,
      row_number() over (order by cu.id) as rn
    from public.content_units cu
    join public.parts p on p.id = cu.part_id
    join public.sections s on s.id = p.section_id
    join public.experiences e on e.id = s.experience_id
    where e.product_id = target_product_id
      and cu.type = 'audio'
      and coalesce(cu.data ->> 'url', '') ilike '%wikimedia.org%'
  ),
  audio_pool as (
    select array[
      'https://schood-toefl.pages.dev/media/toefl/listening-lecture-01.wav',
      'https://schood-toefl.pages.dev/media/toefl/listening-lecture-02.wav',
      'https://schood-toefl.pages.dev/media/toefl/listening-conversation-01.wav',
      'https://schood-toefl.pages.dev/media/toefl/listening-conversation-02.wav',
      'https://schood-toefl.pages.dev/media/toefl/integrated-lecture-01.wav',
      'https://schood-toefl.pages.dev/media/toefl/integrated-lecture-02.wav'
    ]::text[] as urls
  ),
  mapped_audio as (
    select
      a.id,
      ap.urls[((a.rn - 1) % array_length(ap.urls, 1)) + 1] as new_url
    from toefl_audio a
    cross join audio_pool ap
  )
  update public.content_units cu
  set data =
    jsonb_set(
      coalesce(cu.data, '{}'::jsonb),
      '{url}',
      to_jsonb(ma.new_url),
      true
    )
    || jsonb_build_object(
      'source', 'schood_internal_tts_v1',
      'rights_status', 'original_internal'
    )
  from mapped_audio ma
  where cu.id = ma.id;

  -- 2) Replace integrated-writing placeholder passages with editorial source text.
  with target_passages as (
    select
      cu.id,
      row_number() over (order by cu.id) as rn
    from public.content_units cu
    join public.parts p on p.id = cu.part_id
    join public.sections s on s.id = p.section_id
    join public.experiences e on e.id = s.experience_id
    where e.product_id = target_product_id
      and cu.type = 'reading_passage'
      and coalesce(cu.data ->> 'text', '') ilike 'Insert licensed integrated-writing source passage here.%'
  ),
  passage_pool as (
    select
      1 as idx,
      'Community Wetlands and Flood Control'::text as title,
      'A recent planning report argues that restoring wetlands near expanding cities can reduce flood risk while also improving biodiversity. During periods of heavy rain, wetland soils absorb and store water that would otherwise move quickly into drainage systems. The report notes that engineered channels move water away from streets, but they do not always provide enough capacity during intense storms. In contrast, restored wetlands spread water over a wider area and release it more slowly over time. Supporters add that wetland projects can be combined with public walking paths and native planting programs, which increase local support for long-term maintenance.'::text as body
    union all
    select
      2 as idx,
      'Study Habits and Long-Term Retention'::text as title,
      'An education review compares two preparation methods used by university students. The first method relies on long weekend sessions before quizzes, while the second method uses shorter study periods distributed across the week. According to the review, students who use distributed study usually recall more information after one month. The researchers explain that repeated retrieval practice strengthens memory traces and helps learners identify weak areas earlier. Critics of distributed study argue that students with busy schedules may find daily sessions difficult to maintain. However, the review concludes that even brief, consistent sessions can outperform infrequent marathon study when the goal is durable understanding.'::text as body
    union all
    select
      3 as idx,
      'Urban Tree Canopy and Heat Exposure'::text as title,
      'A municipal climate brief examines how tree canopy coverage affects heat exposure in dense neighborhoods. The brief reports that areas with mature street trees often record lower daytime surface temperatures than nearby areas with limited shade. Analysts explain that shaded sidewalks reduce direct solar load, while vegetation also cools surrounding air through evapotranspiration. The document recommends targeted planting near schools, transit stops, and high-footfall corridors where residents spend more time outdoors. It also warns that canopy benefits depend on long-term maintenance, including irrigation in dry months and periodic health inspections. Without maintenance, survival rates decline and expected cooling effects are reduced.'::text as body
  ),
  mapped_passages as (
    select
      tp.id,
      pp.title,
      pp.body
    from target_passages tp
    join passage_pool pp
      on pp.idx = ((tp.rn - 1) % 3) + 1
  )
  update public.content_units cu
  set data =
    jsonb_set(
      jsonb_set(
        coalesce(cu.data, '{}'::jsonb),
        '{title}',
        to_jsonb(mp.title),
        true
      ),
      '{text}',
      to_jsonb(mp.body),
      true
    )
    || jsonb_build_object(
      'source', 'schood_editorial_v1',
      'rights_status', 'original_internal'
    )
  from mapped_passages mp
  where cu.id = mp.id;
end
$$;
