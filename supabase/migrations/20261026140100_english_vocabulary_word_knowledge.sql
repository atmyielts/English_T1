-- Word knowledge for vocabulary sets: collocations (words a word goes with)
-- and word family (other forms), shown when learning a set, in My words and
-- in review. Both are optional; the content studio writes them only when an
-- author gives them (english-content-studio.ts wordKnowledgeColumns), and the
-- notebook copies them into a saved word's metadata.
--
-- Content: four sets authored in supabase/content/english/vocabulary
-- (b1-commuting, b2-the-job-market, b2-environment-and-climate,
-- c1-describing-trends). Words are matched by set slug + word, so a row an
-- admin removed or renamed is simply not touched. Idempotent.

alter table public.vocabulary_deck_words
  add column if not exists collocations jsonb not null default '[]'::jsonb,
  add column if not exists word_family jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vocabulary_deck_words_collocations_array') then
    alter table public.vocabulary_deck_words
      add constraint vocabulary_deck_words_collocations_array check (jsonb_typeof(collocations) = 'array');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vocabulary_deck_words_word_family_array') then
    alter table public.vocabulary_deck_words
      add constraint vocabulary_deck_words_word_family_array check (jsonb_typeof(word_family) = 'array');
  end if;
end
$$;

update public.vocabulary_deck_words w
set collocations = v.collocations,
    word_family = v.word_family,
    updated_at = now()
from public.vocabulary_decks d,
  (values
    ('b1-commuting', 'commute', '["a daily commute", "a long commute", "commute to work", "commute by train"]'::jsonb, '[{"word": "commuter", "part_of_speech": "noun"}, {"word": "commute", "part_of_speech": "noun"}]'::jsonb),
    ('b1-commuting', 'rush hour', '["during rush hour", "rush-hour traffic", "avoid the rush hour"]'::jsonb, '[]'::jsonb),
    ('b1-commuting', 'traffic jam', '["stuck in a traffic jam", "a huge traffic jam", "cause a traffic jam"]'::jsonb, '[]'::jsonb),
    ('b1-commuting', 'crowded', '["a crowded bus", "crowded with people", "get crowded"]'::jsonb, '[{"word": "crowd", "part_of_speech": "noun"}, {"word": "overcrowded", "part_of_speech": "adjective"}]'::jsonb),
    ('b1-commuting', 'fare', '["a bus fare", "pay the fare", "a single fare", "fare increase"]'::jsonb, '[]'::jsonb),
    ('b1-commuting', 'route', '["a bus route", "the quickest route", "take a different route"]'::jsonb, '[{"word": "reroute", "part_of_speech": "verb"}]'::jsonb),
    ('b1-commuting', 'delay', '["a long delay", "without delay", "cause a delay", "a delay of ten minutes"]'::jsonb, '[{"word": "delay", "part_of_speech": "verb"}, {"word": "delayed", "part_of_speech": "adjective"}]'::jsonb),
    ('b1-commuting', 'miss', '["miss the bus", "miss your stop", "just miss"]'::jsonb, '[{"word": "missed", "part_of_speech": "adjective"}]'::jsonb),
    ('b1-commuting', 'platform', '["on platform 4", "the train leaves from platform 2", "wait on the platform"]'::jsonb, '[]'::jsonb),
    ('b1-commuting', 'passenger', '["passenger seat", "airline passengers", "passenger numbers"]'::jsonb, '[]'::jsonb),
    ('b1-commuting', 'get off', '["get off the bus", "get off at the next stop", "get off the train"]'::jsonb, '[{"word": "get on", "part_of_speech": "phrasal verb"}]'::jsonb),
    ('b1-commuting', 'on foot', '["go on foot", "ten minutes on foot", "travel on foot"]'::jsonb, '[]'::jsonb),
    ('b2-the-job-market', 'vacancy', '["fill a vacancy", "a job vacancy", "advertise a vacancy"]'::jsonb, '[{"word": "vacant", "part_of_speech": "adjective"}]'::jsonb),
    ('b2-the-job-market', 'applicant', '["a successful applicant", "job applicants", "shortlist applicants"]'::jsonb, '[{"word": "apply", "part_of_speech": "verb"}, {"word": "application", "part_of_speech": "noun"}]'::jsonb),
    ('b2-the-job-market', 'shortlist', '["be shortlisted for", "draw up a shortlist", "make the shortlist"]'::jsonb, '[{"word": "shortlist", "part_of_speech": "noun"}]'::jsonb),
    ('b2-the-job-market', 'internship', '["do an internship", "a paid internship", "a summer internship", "apply for an internship"]'::jsonb, '[{"word": "intern", "part_of_speech": "noun"}]'::jsonb),
    ('b2-the-job-market', 'track record', '["a proven track record", "a good track record", "a track record of success"]'::jsonb, '[]'::jsonb),
    ('b2-the-job-market', 'probation', '["on probation", "a probation period", "pass your probation"]'::jsonb, '[{"word": "probationary", "part_of_speech": "adjective"}]'::jsonb),
    ('b2-the-job-market', 'freelance', '["work freelance", "a freelance designer", "freelance work"]'::jsonb, '[{"word": "freelancer", "part_of_speech": "noun"}, {"word": "freelance", "part_of_speech": "verb"}]'::jsonb),
    ('b2-the-job-market', 'headhunt', '["be headhunted by", "headhunt talent"]'::jsonb, '[{"word": "headhunter", "part_of_speech": "noun"}]'::jsonb),
    ('b2-the-job-market', 'perks', '["job perks", "one of the perks", "perks of the job"]'::jsonb, '[]'::jsonb),
    ('b2-the-job-market', 'transferable skills', '["develop transferable skills", "highlight transferable skills"]'::jsonb, '[{"word": "transfer", "part_of_speech": "verb"}]'::jsonb),
    ('b2-the-job-market', 'career ladder', '["climb the career ladder", "move up the career ladder", "the bottom of the career ladder"]'::jsonb, '[]'::jsonb),
    ('b2-the-job-market', 'notice period', '["a one-month notice period", "work your notice period", "serve a notice period"]'::jsonb, '[{"word": "notice", "part_of_speech": "noun"}]'::jsonb),
    ('b2-environment-and-climate', 'emissions', '["carbon emissions", "reduce emissions", "cut emissions", "greenhouse gas emissions"]'::jsonb, '[{"word": "emit", "part_of_speech": "verb"}]'::jsonb),
    ('b2-environment-and-climate', 'water scarcity', '["face water scarcity", "severe water scarcity"]'::jsonb, '[{"word": "scarce", "part_of_speech": "adjective"}]'::jsonb),
    ('b2-environment-and-climate', 'renewable', '["renewable energy", "renewable sources", "renewable resources"]'::jsonb, '[{"word": "renew", "part_of_speech": "verb"}, {"word": "renewables", "part_of_speech": "noun"}]'::jsonb),
    ('b2-environment-and-climate', 'fossil fuels', '["burn fossil fuels", "dependence on fossil fuels", "move away from fossil fuels"]'::jsonb, '[]'::jsonb),
    ('b2-environment-and-climate', 'carbon footprint', '["reduce your carbon footprint", "a large carbon footprint", "measure a carbon footprint"]'::jsonb, '[]'::jsonb),
    ('b2-environment-and-climate', 'endangered', '["an endangered species", "critically endangered", "endangered animals"]'::jsonb, '[{"word": "endanger", "part_of_speech": "verb"}, {"word": "danger", "part_of_speech": "noun"}]'::jsonb),
    ('b2-environment-and-climate', 'conservation', '["wildlife conservation", "conservation efforts", "energy conservation"]'::jsonb, '[{"word": "conserve", "part_of_speech": "verb"}, {"word": "conservationist", "part_of_speech": "noun"}]'::jsonb),
    ('b2-environment-and-climate', 'biodiversity', '["loss of biodiversity", "protect biodiversity", "rich biodiversity"]'::jsonb, '[{"word": "diverse", "part_of_speech": "adjective"}, {"word": "diversity", "part_of_speech": "noun"}]'::jsonb),
    ('b2-environment-and-climate', 'deforestation', '["large-scale deforestation", "stop deforestation", "deforestation rates"]'::jsonb, '[{"word": "forest", "part_of_speech": "noun"}, {"word": "deforest", "part_of_speech": "verb"}]'::jsonb),
    ('b2-environment-and-climate', 'sustainable', '["sustainable development", "sustainable energy", "environmentally sustainable"]'::jsonb, '[{"word": "sustain", "part_of_speech": "verb"}, {"word": "sustainability", "part_of_speech": "noun"}, {"word": "sustainably", "part_of_speech": "adverb"}]'::jsonb),
    ('b2-environment-and-climate', 'heatwave', '["a severe heatwave", "during a heatwave", "a summer heatwave"]'::jsonb, '[]'::jsonb),
    ('b2-environment-and-climate', 'landfill', '["a landfill site", "end up in landfill", "send waste to landfill"]'::jsonb, '[]'::jsonb),
    ('c1-describing-trends', 'surge', '["a surge in demand", "a sudden surge", "prices surged"]'::jsonb, '[{"word": "surge", "part_of_speech": "verb"}]'::jsonb),
    ('c1-describing-trends', 'plummet', '["prices plummeted", "plummet to a record low", "sales plummeted by 40%"]'::jsonb, '[]'::jsonb),
    ('c1-describing-trends', 'fluctuate', '["fluctuate wildly", "fluctuate between 10 and 20", "fluctuating prices"]'::jsonb, '[{"word": "fluctuation", "part_of_speech": "noun"}]'::jsonb),
    ('c1-describing-trends', 'steady', '["a steady rise", "a steady decline", "remain steady"]'::jsonb, '[{"word": "steadily", "part_of_speech": "adverb"}, {"word": "steady", "part_of_speech": "verb"}]'::jsonb),
    ('c1-describing-trends', 'peak', '["peak at", "reach a peak", "peak season", "peak levels"]'::jsonb, '[{"word": "peak", "part_of_speech": "noun"}, {"word": "peak", "part_of_speech": "adjective"}]'::jsonb),
    ('c1-describing-trends', 'level off', '["level off at", "begin to level off"]'::jsonb, '[]'::jsonb),
    ('c1-describing-trends', 'decline', '["a sharp decline", "a gradual decline", "a decline in sales", "go into decline"]'::jsonb, '[{"word": "decline", "part_of_speech": "verb"}, {"word": "declining", "part_of_speech": "adjective"}]'::jsonb),
    ('c1-describing-trends', 'marginal', '["a marginal increase", "a marginal difference", "marginal gains"]'::jsonb, '[{"word": "marginally", "part_of_speech": "adverb"}, {"word": "margin", "part_of_speech": "noun"}]'::jsonb),
    ('c1-describing-trends', 'dramatic', '["a dramatic rise", "a dramatic fall", "dramatic changes"]'::jsonb, '[{"word": "dramatically", "part_of_speech": "adverb"}, {"word": "drama", "part_of_speech": "noun"}]'::jsonb),
    ('c1-describing-trends', 'double', '["double in size", "almost double", "more than double"]'::jsonb, '[{"word": "double", "part_of_speech": "adjective"}, {"word": "doubling", "part_of_speech": "noun"}]'::jsonb),
    ('c1-describing-trends', 'outnumber', '["outnumber by two to one", "be outnumbered by"]'::jsonb, '[{"word": "number", "part_of_speech": "noun"}]'::jsonb),
    ('c1-describing-trends', 'account for', '["account for 30%", "account for the majority", "account for a large share"]'::jsonb, '[]'::jsonb)
  ) as v(deck_slug, word, collocations, word_family)
where d.id = w.deck_id
  and d.slug = v.deck_slug
  and w.word = v.word
  and (w.collocations is distinct from v.collocations or w.word_family is distinct from v.word_family);

-- Words learners already saved from these sets get the same knowledge.
update public.user_vocabulary_notebook_entries n
set metadata = n.metadata
  || jsonb_build_object('collocations', w.collocations, 'word_family', w.word_family),
    updated_at = now()
from public.vocabulary_deck_words w
join public.vocabulary_decks d on d.id = w.deck_id
where n.metadata->>'deck_slug' = d.slug
  and n.normalized_word = lower(trim(w.word))
  and (jsonb_array_length(w.collocations) > 0 or jsonb_array_length(w.word_family) > 0)
  and not (n.metadata ? 'collocations');
