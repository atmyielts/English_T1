-- Listening: mark the main-idea question of seven recordings as "gist"
-- (english-listening.ts), so gist-then-detail practice asks it after the first
-- listen. Recordings without a gist question use their first question.
-- Matched by slug + question id; idempotent.

with gist(slug, question_id) as (
  values
    ('b1-podcast-learning-english-with-series', 'q1'),
    ('b2-freelance-price-negotiation', 'q5'),
    ('b2-news-new-cycle-lanes-debate', 'q1'),
    ('b2-podcast-money-myths-for-students', 'q1'),
    ('b2-talk-how-vaccines-train-the-body', 'q1'),
    ('c1-lecture-borrowed-words', 'q5'),
    ('c1-podcast-why-we-trust-online-reviews', 'q1')
)
update public.listening_items i
set questions = (
      select jsonb_agg(case when q->>'id' = g.question_id then q || '{"focus": "gist"}'::jsonb else q end order by ord)
      from jsonb_array_elements(i.questions) with ordinality as t(q, ord)
    ),
    updated_at = now()
from gist g
where i.slug = g.slug
  and jsonb_typeof(i.questions) = 'array'
  and exists (
    select 1 from jsonb_array_elements(i.questions) q
    where q->>'id' = g.question_id and coalesce(q->>'focus', '') <> 'gist'
  );
