-- Reading library: C2 articles (4) with comprehension questions.
-- ============================================================================
-- Upserts full-length C2 reading texts (600-800 words) into
-- public.reading_articles with 5 multiple-choice questions each, then registers
-- every article in learning_content_registry_items (content_type
-- 'reading.article', source_ref = slug) so it shows in the hub catalog.
-- Answer keys live in reading_articles.questions and must be stripped by the
-- edge function before items reach the browser.
-- Idempotent: safe to re-run.
-- ============================================================================

-- Guard: the questions column is added by the English activity questions
-- migration; repeat it here (no-op if present) so this file applies in any order.
alter table public.reading_articles
  add column if not exists questions jsonb not null default '[]'::jsonb;

do $mig$
declare
  v_product_id uuid;
  v_language_id uuid;
begin
  select p.id
  into v_product_id
  from public.products p
  where lower(coalesce(p.metadata->>'slug', '')) = 'english-reading'
  order by p.created_at asc
  limit 1;

  select l.id
  into v_language_id
  from public.languages l
  where l.code = 'en'
  limit 1;

  if v_product_id is null or v_language_id is null then
    raise exception 'Required english-reading product or en language is missing';
  end if;

  insert into public.reading_articles (
    product_id,
    language_id,
    slug,
    title,
    summary,
    content_markdown,
    level,
    category,
    theme,
    tone,
    read_time_minutes,
    is_hot,
    status,
    sort_order,
    metadata,
    questions
  )
  values
    (
      v_product_id, v_language_id, 'urban-design-human-behavior',
      'Urban Design and Human Behaviour',
      'An essay on how the layout of streets, courtyards and housing blocks quietly shapes the way people meet and live.',
      $md$## The silent influence of space

We tend to think of our behaviour as the product of personality, culture and choice. Yet the spaces we move through exert a quieter and more persistent influence. The width of a pavement, the position of a bench, the distance between a front door and the street: each of these shapes, in small ways, whom we meet, how long we linger and whether we feel at ease. Cities are, among other things, machines for arranging human encounters, and their design determines which encounters become likely and which become rare.

## Lessons from the mahalla

Central Asia offers a particularly vivid illustration. The traditional mahalla, the neighbourhood unit found in cities such as Tashkent, Bukhara and Samarkand, grew around narrow lanes, shared water sources and houses turned inward towards private courtyards. Its blank outer walls might seem unwelcoming to a visitor, but the lanes between them functioned as extensions of the home. Children played within earshot of their parents, neighbours exchanged news at the local teahouse, and the dense, walkable layout meant that everyday errands brought people into repeated contact. Social cohesion here was not merely a cultural value; it was reinforced, day after day, by the physical fabric of the neighbourhood.

## The logic of the large block

Twentieth-century planning brought a different logic. Across the region, districts of large residential blocks were built, set back from wide roads and separated by expanses of open ground. These schemes solved urgent problems, providing light, ventilation, running water and modern housing on an unprecedented scale. Their spatial consequences, however, were mixed. Open spaces that belonged to everyone often felt as though they belonged to no one, and without clear ownership, they were sometimes neglected. Distances between home, shop and workplace grew, making the car or the bus a necessity rather than an option.

The writer and urbanist Jane Jacobs, describing very different cities, famously argued that safe, lively streets depend on "eyes on the street": a steady presence of residents and shopkeepers who notice what goes on around them. Her insight travels well. Where ground floors are lined with shops and doorways, pavements tend to be busy and informally watched. Where they face blank walls or car parks, people pass through quickly and rarely stop.

## Designing for behaviour

Contemporary planners increasingly treat such observations as design principles. Narrower streets and slower traffic make walking feel safer. Mixed-use buildings, with flats above shops, keep areas active throughout the day rather than only at rush hour. Small, well-defined public spaces, such as a square with shade, seating and something to watch, tend to attract people far more reliably than vast, empty plazas, however impressive the latter may look in architectural drawings.

Such interventions can be remarkably modest. A row of trees, a few benches facing the street rather than away from it, or the removal of an unnecessary fence can transform how a space is used. Conversely, well-intentioned schemes can backfire. A park designed without input from the people who will actually use it may end up beautiful but deserted.

## The limits of design

It would be naive, however, to imagine that design alone determines behaviour. People adapt spaces to their needs in ways that planners rarely anticipate: residents of large housing blocks have long planted gardens, set up informal markets and turned bare courtyards into gathering places. Economic conditions, cultural habits and the rhythms of daily work all mediate the relationship between people and places. A beautifully designed street in a neighbourhood where nobody can afford the shops will still be quiet.

The more defensible claim is that design shapes probabilities. It makes some behaviours easier and others harder, nudging rather than commanding. That is precisely why it matters. Small decisions taken by planners and architects, repeated across thousands of streets, accumulate into the social character of a city, and they tend to outlast the people who made them by generations.

As Central Asian cities continue to grow, they face a choice about what kind of daily life their design will encourage. The question is not simply how many people a new district can house, but what kind of neighbours those people will be able to become.$md$,
      'C2', 'Society', 'urban design', 'lime', 4, true, 'published', 610,
      '{"seeded_by":"20261022120600_reading_library_c2","genre":"essay","writing_tone":"informative","word_count":697}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the central argument of the essay?","options":["Traditional mahallas should gradually replace all modern housing blocks in Central Asian cities.","Twentieth-century housing blocks were a complete failure and should be replaced as soon as possible.","People's behaviour depends only on their culture and personality, so the design of space hardly matters.","The design of urban spaces influences how people behave and interact, although it does not fully determine it."],"answer_index":3,"explanation":"The essay argues that spaces \"exert a quieter and more persistent influence\" on behaviour, but also says \"design shapes probabilities\", not everything."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"According to the essay, what was one achievement of twentieth-century housing schemes?","options":["They created narrow, shaded lanes where neighbours met each other every day.","They made cars and buses much less necessary for residents of new districts.","They placed shops and cafés on the ground floor of every residential building.","They provided light, ventilation, running water and modern housing on a large scale."],"answer_index":3,"explanation":"The text says these schemes \"solved urgent problems, providing light, ventilation, running water and modern housing on an unprecedented scale.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"How does the writer compare small public spaces with large, empty plazas?","options":["Small, well-defined spaces tend to attract people more reliably.","Large plazas are always busier than small squares.","Both kinds of space are equally popular with people.","Large plazas feel much safer to people at night."],"answer_index":0,"explanation":"The text says small spaces \"tend to attract people far more reliably than vast, empty plazas\"."},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"What point is the writer making with the example of a well-designed street where nobody can afford the shops?","options":["Shops in new streets should lower their prices to attract people.","Economic conditions can limit what good design is able to achieve.","Street design is more important than the economy of a neighbourhood.","Planners should avoid putting any shops in newly designed streets."],"answer_index":1,"explanation":"The example appears in \"The limits of design\", after the writer says economic conditions \"mediate the relationship between people and places\"."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"nudging rather than commanding\", \"nudging\" means...","options":["forcing people to obey the rules strictly","gently encouraging in a certain direction","preventing any kind of change from happening","warning people about danger in the streets"],"answer_index":1,"explanation":"Design \"makes some behaviours easier and others harder\", which is a gentle influence, the opposite of \"commanding\"."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'cultural-context-global-news',
      'Cultural Context in Global News',
      'Even accurate news reports involve choices of framing shaped by culture, and careful readers learn to notice them.',
      $md$## The myth of the neutral report

Most readers know that newspapers and broadcasters sometimes disagree about how to interpret events. Fewer appreciate how much interpretation is already present in reports that appear purely factual. Every news story is the product of choices: which facts to include, whose voices to quote, which words to use and what background to supply. None of these choices is neutral, and many of them are shaped by the cultural context in which journalists work and by the assumptions they share with their audience.

## One event, several stories

Consider a hypothetical example. A new high-speed railway opens between two large cities. One outlet runs the headline "Record-breaking line cuts journey to two hours", accompanied by images of the gleaming train and quotes from delighted passengers. A second leads with "Railway opens years late and over budget", foregrounding an economist's criticism. A third focuses on the villages along the route, quoting residents who say that the noise has changed their daily lives.

Each report may be accurate in every detail. Yet a reader who encountered only one of them would come away with a markedly different understanding of the event. What differs is not the facts but the framing: the selection and emphasis that tell the audience what kind of story this is and why it matters.

## The grammar of framing

Framing operates at every level of language, often below the threshold of conscious attention. Verbs of reporting are a revealing example. To write that an official "said" something is neutral; "claimed" introduces doubt, "admitted" implies a reluctant confession, and "insisted" suggests resistance to contrary evidence. Similarly, the passive voice can obscure responsibility. "Hundreds of jobs were lost" and "The company cut hundreds of jobs" may describe the same event, but only the second names an agent.

Vocabulary carries connotations that may be invisible to those who share them. Whether a sudden rise in prices is described as a "correction", a "surge" or a "crisis" signals how alarmed the reader ought to feel. Metaphors frame events too: describing an economy as "overheating" invites the reader to picture a machine that needs to be cooled down, and to accept the measures that such a picture seems to justify.

## Culture and newsworthiness

Cultural context shapes not only how stories are told but which stories are told at all. News values such as proximity, relevance and prominence are inevitably defined from a particular standpoint. An event that dominates headlines in one country may receive a single paragraph elsewhere, not because editors judge it unimportant in absolute terms, but because they judge it remote from their readers' concerns. Background knowledge is likewise assumed differently. A domestic audience may need no explanation of a local custom or historical reference that would baffle international readers, while a foreign correspondent may explain the same thing through comparisons that subtly distort it.

Translation adds a further layer. Terms with rich cultural associations are routinely flattened into approximate equivalents. The Uzbek word mahalla, for instance, denotes far more than a "neighbourhood": it implies a community with its own customs, obligations and forms of mutual support. When it is translated as a single English word, nuances that a local reader would take for granted quietly disappear.

## Reading across sources

None of this implies that all reporting is equally reliable or that facts are merely a matter of perspective. Some outlets adhere to rigorous standards of verification; others do not. The point is rather that even careful, honest journalism involves interpretation, and readers who are aware of this are better equipped to understand what they read.

A practical habit is to read about significant events in more than one source, ideally from different countries or traditions, and to compare not just what they report but how they report it. Which facts appear in the first paragraph, and which are buried at the end? Whose voices are quoted, and whose are absent? Which words carry an evaluative charge? For language learners, this exercise has a double benefit: it sharpens critical thinking, and it develops an ear for the subtle connotations that distinguish fluent reading from merely accurate reading.

Ultimately, the aim is not cynicism but discernment: the ability to recognise a frame without being imprisoned by it.$md$,
      'C2', 'Culture', 'news media', 'mint', 4, false, 'published', 620,
      '{"seeded_by":"20261022120600_reading_library_c2","genre":"essay","writing_tone":"informative","word_count":708}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the writer's main argument?","options":["Most news outlets deliberately publish false information because they want to influence their readers.","Even accurate news reports involve framing choices shaped by cultural context, so readers should read critically.","Readers should only trust news that is written by journalists from their own country and culture.","The facts in news reports are never real facts but only a matter of each journalist's personal opinion."],"answer_index":1,"explanation":"The writer says every story \"is the product of choices\" shaped by \"cultural context\", and recommends reading across sources; the writer also says this does not mean facts are \"merely a matter of perspective\"."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"In the railway example, what is true of the three reports?","options":["Only the first report is accurate.","Each may be accurate, but each leaves a different impression.","All three use the same headline.","The second report invents the economist's criticism."],"answer_index":1,"explanation":"The text says: \"Each report may be accurate in every detail. Yet a reader who encountered only one of them would come away with a markedly different understanding\"."},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"According to the writer, what does the reporting verb \"admitted\" imply?","options":["A reluctant confession","Complete neutrality","Resistance to contrary evidence","Doubt about the statement"],"answer_index":0,"explanation":"The text says: \"'admitted' implies a reluctant confession\"."},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"Why does the writer mention the word mahalla?","options":["To show that Uzbek has more words than English","To explain the history of Uzbek neighbourhoods","To illustrate how translation can lose cultural meaning","To criticise foreign correspondents for their mistakes"],"answer_index":2,"explanation":"The example appears in the paragraph about translation, which says culturally rich terms \"are routinely flattened into approximate equivalents\" and nuances \"quietly disappear\"."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"the aim is not cynicism but discernment\", \"discernment\" means...","options":["a strong distrust of everything you read","a complete lack of interest in the news","the habit of reading news very quickly","the ability to judge well and notice what matters"],"answer_index":3,"explanation":"The writer defines it right away: \"the ability to recognise a frame without being imprisoned by it\", and contrasts it with cynicism."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'c2-the-uncertain-art-of-prediction',
      'The Uncertain Art of Prediction',
      'Weather science shows why some systems can only be forecast in probabilities, and what that teaches us about trusting predictions.',
      $md$## A forecast is not a promise

When the morning forecast promises sunshine and the afternoon brings a downpour, it is tempting to conclude that forecasters simply do not know what they are doing. The reality is almost the opposite. Weather prediction is one of the great quiet successes of modern science, and its occasional failures are not so much errors as reminders of a fundamental truth: some systems can only ever be predicted in terms of probabilities.

## Why the weather resists certainty

In the early 1960s, the meteorologist Edward Lorenz was running a simple computer model of the atmosphere when he made a startling discovery. Restarting a simulation with figures that he had rounded very slightly, he expected results almost identical to the original run. Instead, after a short time, the new run drifted away from the old one until the two bore no resemblance to each other.

Lorenz had stumbled upon what came to be known as chaos: the property of certain systems whereby tiny differences in starting conditions grow until they overwhelm any prediction. His later image of a butterfly flapping its wings and influencing a distant storm has become a cliché, but the underlying point remains profound. Because we can never measure the atmosphere perfectly, there is a horizon beyond which detailed forecasts become impossible, no matter how powerful our computers.

## Embracing uncertainty

Forecasters responded not by abandoning prediction but by changing what a forecast is. Rather than running a single simulation, modern weather services run an ensemble: dozens of versions of the same model, each starting from slightly different conditions. If most runs agree, confidence is high. If they scatter, the forecast is genuinely uncertain, and saying so is more honest than pretending otherwise.

This is the origin of statements such as "a 70 per cent chance of rain". The figure is frequently misunderstood. It does not mean that it will rain for 70 per cent of the day, or over 70 per cent of the area. Roughly speaking, it means that on days with conditions like these, rain falls about seven times in ten. A forecaster who says 70 per cent and then sees a dry day has not necessarily been wrong; the real test is whether, across many such forecasts, rain occurs about as often as predicted. Statisticians call this property calibration.

Combined with far better observations from satellites and steadily improving models, this probabilistic approach has made forecasts several days ahead considerably more reliable than they were a generation ago.

## When predictions change the outcome

Other fields have found prediction harder still, and for an instructive reason. The atmosphere does not read the forecast; people do. In economics, a widely publicised prediction that prices will rise can prompt consumers to buy early and businesses to raise prices, helping to bring about the very outcome that was predicted. Conversely, a warning of a crisis may trigger action that prevents it, making the forecast appear mistaken when it was in fact useful. Such reflexivity, in which a forecast becomes part of the system it describes, means that social and economic predictions face difficulties that no amount of computing power can fully overcome.

## Living with probability

For the rest of us, the lesson is less about weather or economics than about how to think. Human beings tend to prefer confident answers, and we often reward experts who speak with certainty over those who acknowledge doubt. Yet the forecasters who deserve the most trust are frequently those who express their predictions as probabilities, keep an honest record of how often they are right, and revise their views when the evidence changes.

To accept that the future can be estimated but not known is not a counsel of despair. It is the basis of sensible decisions: carrying an umbrella when the chance of rain is high, preparing for several possible outcomes rather than betting everything on one, and treating any prediction delivered with absolute certainty with a healthy degree of suspicion.$md$,
      'C2', 'Science', 'forecasting', 'sky', 4, false, 'published', 630,
      '{"seeded_by":"20261022120600_reading_library_c2","genre":"essay","writing_tone":"informative","word_count":663}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the main idea of the essay?","options":["Weather forecasts are usually wrong, so people should not rely on them when making plans.","Economic forecasts are far more accurate than weather forecasts because they use more data.","Some systems can only be predicted in terms of probability, and good forecasting openly acknowledges uncertainty.","Powerful new computers will soon make it possible to produce perfect weather forecasts."],"answer_index":2,"explanation":"The writer says \"some systems can only ever be predicted in terms of probabilities\" and praises forecasters who \"express their predictions as probabilities\"."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"What did Lorenz find when he restarted his simulation with slightly rounded figures?","options":["The results of the two runs were exactly the same from start to finish.","The computer stopped working before the second run could be completed.","The model predicted a distant storm that was caused by a butterfly.","The new run eventually became completely different from the original."],"answer_index":3,"explanation":"The text says the new run \"drifted away from the old one until the two bore no resemblance to each other.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"According to the essay, what does \"a 70 per cent chance of rain\" mean?","options":["It will rain for about 70 per cent of the hours in that particular day.","Rain will fall over about 70 per cent of the area covered by the forecast.","Seven out of every ten forecasters at the weather service expect rain.","On days with similar conditions, rain falls about seven times in ten."],"answer_index":3,"explanation":"The text says: \"it means that on days with conditions like these, rain falls about seven times in ten.\""},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"Why does the writer say that \"the atmosphere does not read the forecast\"?","options":["To suggest that weather forecasts are of no real practical use to anyone at all","To contrast weather with economic systems, where predictions can influence the outcome","To explain why satellites are needed to observe and measure the atmosphere accurately","To criticise people who ignore the weather forecast and then complain about the rain"],"answer_index":1,"explanation":"The sentence continues \"people do\", and the paragraph explains how economic predictions can \"bring about the very outcome that was predicted\"."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"is not a counsel of despair\", \"a counsel of despair\" is...","options":["a group of experts who give advice","a confident prediction about the future","a careful and sensible decision","advice that suggests there is no hope"],"answer_index":3,"explanation":"The writer says accepting uncertainty is not hopeless but \"the basis of sensible decisions\", so a counsel of despair is advice that gives up hope."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'c2-who-owns-your-attention',
      'Who Owns Your Attention?',
      'An essay on the attention economy: why digital products compete for our focus and how we might take some of it back.',
      $md$## A scarce resource

In 1971, long before smartphones existed, the economist Herbert Simon observed that an abundance of information creates a scarcity of something else: the attention of those who consume it. Half a century later, his remark reads almost like prophecy. Information is now effectively limitless and available at any moment, and the competition to capture our attention has become one of the defining economic forces of our time.

## Attention as a commodity

Many of the most widely used digital services are free at the point of use. They earn money, directly or indirectly, from advertising, and advertising is valuable only if people see it. The longer users stay, and the more often they return, the more valuable the platform becomes. In this model, often called the attention economy, the user's time and focus are not incidental to the business; they are, in a meaningful sense, what is being sold.

This creates a powerful incentive to design products that are difficult to put down. Many familiar features can be understood in this light. Infinite scrolling removes the natural stopping points that the end of a page or a chapter once provided. Videos that play automatically spare us the decision to continue, which is also the moment at which we might have chosen to stop. Notifications arrive unpredictably, and some psychologists have compared their pull to that of a slot machine: because we never know when something rewarding will appear, we keep checking.

## The question of responsibility

It would be simplistic to portray users as the helpless victims of manipulative design. People derive genuine value from digital platforms: contact with distant relatives, access to education, entertainment and opportunities for work. Nor is the competition for attention new; newspapers, television and advertising have always sought to hold their audiences. What has changed is the precision and scale of the effort. Systems that can measure, test and refine their effect on millions of users in real time are qualitatively different from a newspaper editor choosing a dramatic headline.

The difficulty is that the costs are diffuse and the benefits immediate. No single notification ruins anyone's concentration. But a day fragmented by dozens of interruptions may leave little room for sustained thought, the kind required to read a difficult book, solve a complex problem or simply hold a long conversation. Many people report a vague sense that their attention is no longer entirely their own, even though each individual decision to look at a screen felt voluntary at the time.

## Reclaiming attention

Responses are emerging at several levels. Some designers advocate what they call humane technology: products that respect users' time, for instance by showing how long they have spent in an app, or by making it easy to switch notifications off. In a number of countries, policymakers are debating whether certain design features, especially in products used by children, should be restricted.

At the individual level, the most effective strategies tend to involve changing the environment rather than relying on willpower. Turning off non-essential notifications, keeping the phone out of the bedroom, removing the most absorbing apps from the home screen or setting aside certain hours as screen-free all reduce the number of decisions one has to make. Willpower, after all, is a limited resource, and it is unwise to stake it against systems engineered by large, skilled teams to overcome it.

## A question of values

Ultimately, the attention economy raises a question that is as much philosophical as technological. Attention is not merely a resource to be allocated efficiently; it is, in a sense, the substance of our lives. What we attend to shapes what we know, what we care about and, over time, who we become. To ask who owns our attention is therefore to ask who is shaping our experience of the world, and whether we are content to leave that decision to others.$md$,
      'C2', 'Technology', 'attention economy', 'peach', 4, false, 'published', 640,
      '{"seeded_by":"20261022120600_reading_library_c2","genre":"essay","writing_tone":"persuasive","word_count":645}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the central argument of the essay?","options":["Digital platforms compete intensively for our attention, which raises important questions about how we protect it.","Smartphones are so harmful to concentration that they should be banned for people of all ages.","Advertising is the only real problem with modern digital technology, and it should be removed from apps.","Users are completely helpless against the technology companies that design the apps they use every day."],"answer_index":0,"explanation":"The essay explains the attention economy, discusses responsibility and ends by asking \"who owns our attention\" and how to reclaim it."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"According to the essay, how do many free digital services make money?","options":["From governments that pay to keep them free","From volunteers who give their time to run them","From fees that users have to pay at a later date","From advertising, which depends on users' attention"],"answer_index":3,"explanation":"The text says they \"earn money, directly or indirectly, from advertising, and advertising is valuable only if people see it.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"Why does the writer think videos that play automatically keep people watching?","options":["They remove the moment when users might decide to stop.","They are always much shorter than videos that users choose.","They only ever show videos from the user's favourite channels.","They load much faster than videos that users have to click on."],"answer_index":0,"explanation":"The text says autoplay spares \"us the decision to continue, which is also the moment at which we might have chosen to stop.\""},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"Why does the writer think it is \"unwise to stake\" willpower against these systems?","options":["Willpower is not actually useful in any area of everyday life or work.","People with strong willpower never use their phones, so they do not need it.","Skilled teams design the products specifically to overcome individual self-control.","Technology companies want their users to develop more willpower over time."],"answer_index":2,"explanation":"The writer calls willpower \"a limited resource\" and says the systems are \"engineered by large, skilled teams to overcome it\", so changing the environment works better."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"the costs are diffuse and the benefits immediate\", \"diffuse\" means...","options":["spread out and hard to notice in any single moment","very large and obvious to everyone","expensive for ordinary users to pay","shared equally by everyone who goes online"],"answer_index":0,"explanation":"The next sentences explain that \"No single notification ruins anyone's concentration\", but many interruptions over a day add up."}]$q$::jsonb
    )
  on conflict (product_id, language_id, slug) do update
  set
    title = excluded.title,
    summary = excluded.summary,
    content_markdown = excluded.content_markdown,
    level = excluded.level,
    category = excluded.category,
    theme = excluded.theme,
    tone = excluded.tone,
    read_time_minutes = excluded.read_time_minutes,
    is_hot = excluded.is_hot,
    status = excluded.status,
    sort_order = excluded.sort_order,
    metadata = coalesce(public.reading_articles.metadata, '{}'::jsonb) || excluded.metadata,
    questions = excluded.questions,
    updated_at = now();
end
$mig$;

insert into public.learning_content_registry_items (
  product_id,
  language_id,
  service_key,
  content_type,
  source_table,
  source_record_id,
  source_ref,
  title,
  description,
  skill_key,
  subskill_keys,
  cefr_level,
  difficulty,
  estimated_minutes,
  learning_objective,
  tags,
  status,
  payload_json,
  metadata,
  created_by,
  updated_by
)
select
  ra.product_id,
  ra.language_id,
  'reading',
  'reading.article',
  'reading_articles',
  ra.id,
  ra.slug,
  ra.title,
  ra.summary,
  'reading',
  array['reading.gist', 'reading.detail', 'reading.inference', 'vocabulary.context']::text[],
  ra.level,
  0.90,
  greatest(1, least(240, ra.read_time_minutes + 3)),
  ra.summary,
  array_remove(array[ra.category, ra.theme], null)::text[],
  ra.status,
  jsonb_build_object(
    'reading_article_id', ra.id,
    'tone', ra.tone,
    'is_hot', ra.is_hot,
    'question_count', jsonb_array_length(ra.questions)
  ),
  jsonb_build_object('seeded_by', '20261022120600_reading_library_c2'),
  ra.created_by,
  ra.updated_by
from public.reading_articles ra
join public.products p on p.id = ra.product_id
join public.languages l on l.id = ra.language_id
where lower(coalesce(p.metadata->>'slug', '')) = 'english-reading'
  and l.code = 'en'
  and ra.slug in ('urban-design-human-behavior', 'cultural-context-global-news', 'c2-the-uncertain-art-of-prediction', 'c2-who-owns-your-attention')
on conflict (language_id, service_key, content_type, source_ref) do update
set
  product_id = excluded.product_id,
  source_table = excluded.source_table,
  source_record_id = excluded.source_record_id,
  title = excluded.title,
  description = excluded.description,
  skill_key = excluded.skill_key,
  subskill_keys = excluded.subskill_keys,
  cefr_level = excluded.cefr_level,
  difficulty = excluded.difficulty,
  estimated_minutes = excluded.estimated_minutes,
  learning_objective = excluded.learning_objective,
  tags = excluded.tags,
  status = excluded.status,
  payload_json = excluded.payload_json,
  metadata = coalesce(public.learning_content_registry_items.metadata, '{}'::jsonb) || excluded.metadata,
  updated_by = excluded.updated_by,
  updated_at = now();
