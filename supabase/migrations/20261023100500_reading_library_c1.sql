-- Reading library: C1 articles (8) with comprehension questions.
-- ============================================================================
-- Upserts full-length C1 reading texts (450-600 words) into
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
      v_product_id, v_language_id, 'ai-bias-everyday-tools',
      'How AI Bias Appears in Everyday Tools',
      'AI systems can reproduce hidden biases from their data, design and goals, so their output deserves critical reading.',
      $md$## Invisible decisions

Every day, automated systems make small decisions on our behalf. They choose which news stories we see, which products are recommended to us, which job adverts appear on our screens and which words our phone suggests as we type. Because these decisions are quick and seemingly neutral, it is easy to assume they are objective. They are not. Like the people who build them, AI systems can be biased, and the effects are often subtle enough to go unnoticed.

## Where bias comes from

Most modern AI tools learn from enormous collections of examples: texts, images and records of past decisions. If those examples reflect existing inequalities or gaps, the system will absorb them. A translation tool trained mainly on texts in which doctors are described as men and nurses as women may begin to reproduce that pattern, even when the original sentence gave no information about gender.

Bias can also arise from what is missing. A voice assistant trained largely on speakers of a few major varieties of English may struggle to understand someone from Tashkent or Lagos, not because their English is wrong, but because the system has heard too little of it. For the user, the experience is frustrating and quietly exclusionary.

Finally, bias can be built into the goals of a system. A recommendation engine designed to maximise the time users spend on a platform will learn to promote whatever keeps people watching, which is not necessarily what is accurate, balanced or good for them.

## Why it is hard to see

The difficulty is that biased results rarely look biased. A list of search results or a suggested sentence appears with the same confident presentation whether it is fair or not. And because each of us sees only our own results, we have no easy way to compare them with what others are shown.

## Reading AI output critically

None of this means that AI tools are useless. They can be remarkably helpful, but they deserve the same critical attention we would give any other source. A few habits make a real difference.

First, ask who might be missing. If an image generator produces pictures of "a scientist", notice who appears, and who does not.

Second, separate fluent language from reliable content. AI systems are very good at sounding authoritative, which can make questionable claims seem convincing. Treat confident statements as claims to be checked, especially when they concern people, health or money.

Third, compare. Rephrase your question, try a different tool or look for a source written by a person with relevant expertise. If the answers diverge sharply, that is a signal to dig deeper.

The aim is not to be suspicious of everything, but to stay aware. The more these tools shape our daily choices, the more important it becomes to remember that behind every "neutral" output lie human decisions about data, design and purpose.$md$,
      'C1', 'Technology', 'artificial intelligence', 'lime', 3, true, 'published', 510,
      '{"seeded_by":"20261022120500_reading_library_c1","genre":"explainer","writing_tone":"informative","word_count":481}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the main idea of the article?","options":["AI tools are too dangerous to be used in everyday life at all.","Translation tools are the most biased of all types of AI.","AI tools can contain hidden biases, so their output should be read critically.","Only trained programmers are able to recognise bias in AI systems."],"answer_index":2,"explanation":"The article explains where bias comes from and ends with advice on \"Reading AI output critically\"."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"According to the article, why might a voice assistant fail to understand a speaker from Tashkent?","options":["It has been trained on too few examples of that kind of English.","The speaker's English contains too many grammar mistakes.","The speaker is talking too quickly for the system.","The assistant was designed only for children's voices."],"answer_index":0,"explanation":"The text says this happens \"not because their English is wrong, but because the system has heard too little of it.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"Why, according to the article, is biased output difficult to notice?","options":["It looks just as confident as fair output, and users cannot easily compare results.","It is usually hidden in long technical documents that few people read.","Companies remove it before users are able to see the results.","It only appears in languages other than English, which few users check."],"answer_index":0,"explanation":"The text says results appear \"with the same confident presentation whether it is fair or not\" and \"we have no easy way to compare them\"."},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"What can be inferred about recommendation engines designed to maximise viewing time?","options":["They are carefully designed to show users balanced information.","They may promote content that holds attention rather than content that is accurate.","They are much less popular than search engines and translation tools.","They are designed by people who never use the platforms themselves."],"answer_index":1,"explanation":"The article says such an engine \"will learn to promote whatever keeps people watching, which is not necessarily what is accurate\"."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"If the answers diverge sharply\", \"diverge\" means...","options":["become much shorter","differ greatly from each other","agree with each other completely","appear more slowly than usual"],"answer_index":1,"explanation":"Comparing answers from different sources is useful because differences between them are \"a signal to dig deeper\"."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'green-transport-city-priority',
      'Should Cities Prioritise Green Transport?',
      'A balanced look at the arguments for and against giving public transport, cycling and walking priority in growing cities.',
      $md$## A question every growing city faces

As cities across Central Asia expand, their streets are filling with cars. Traffic jams that were once limited to rush hour now last much of the day, and on still winter days a grey haze can hang over the skyline. In response, many urban planners argue that cities should give clear priority to green transport: public transport, cycling and walking. Others warn that such policies can be costly and unfair if introduced too quickly. Both sides deserve a hearing.

## The case for priority

Supporters make three main arguments. The first concerns health. Vehicle exhaust is a significant source of air pollution in many cities, and cleaner air benefits everyone, particularly children and older residents. Walking and cycling also build physical activity into daily routines.

The second argument is about space. A single bus lane can carry far more people than a lane full of private cars, many of which contain only the driver. When road space is limited, supporters argue, it makes sense to allocate it to the most efficient forms of transport.

The third argument is long-term. Building wider roads often attracts more traffic, a phenomenon known as induced demand, so congestion soon returns. Investment in metro lines, reliable bus networks and safe cycle routes, by contrast, can shape how a city grows for decades.

## The case for caution

Critics do not usually reject these goals, but they question the pace and the price. New metro lines and tram systems are enormously expensive, and money spent on them is money not spent on schools or hospitals. Construction can also disrupt businesses and neighbourhoods for years.

There is also the question of fairness. Restricting cars in the city centre may be easy for people who live near a metro station, but hard for those in outer districts or nearby towns with limited public transport. For a parent who must drop children at school and then reach a workplace on the other side of the city, the car may be the only realistic option. Policies that penalise drivers before offering genuine alternatives, critics argue, place the heaviest burden on those with the fewest choices.

Finally, climate matters. In a region with very hot summers and cold winters, cycling and waiting at bus stops are not always pleasant, and infrastructure must be designed with this in mind.

## Finding a balance

Perhaps the most persuasive position lies between the two. Green transport works best when it is genuinely more convenient than the car: frequent, affordable, safe and comfortable. That suggests a sequence: improving the alternatives first and restricting cars only gradually, while listening carefully to those most affected. The real question, then, may not be whether cities should prioritise green transport, but how to do so in a way that people will actually choose.$md$,
      'C1', 'Environment', 'urban transport', 'mint', 3, false, 'published', 520,
      '{"seeded_by":"20261022120500_reading_library_c1","genre":"discussion","writing_tone":"persuasive","word_count":467}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the main purpose of the article?","options":["To persuade readers to sell their cars and use buses and the metro instead from now on","To explain in detail how new metro and tram systems are planned, paid for and built","To criticise urban planners in Central Asia for ignoring the traffic problems in their cities","To present arguments for and against prioritising green transport and suggest a balanced approach"],"answer_index":3,"explanation":"The article sets out \"The case for priority\" and \"The case for caution\" and ends with \"Finding a balance\"."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"What is \"induced demand\", according to the article?","options":["The need for more buses during rush hour","The demand for cheaper metro tickets","The tendency of wider roads to attract more traffic","The way cycling becomes popular in summer"],"answer_index":2,"explanation":"The text says: \"Building wider roads often attracts more traffic, a phenomenon known as induced demand\"."},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"Why do critics say that restricting cars can be unfair?","options":["It makes city centres too quiet for local businesses.","It reduces the number of tourists who visit the city.","It is only popular with young people who cycle.","It hurts people who have no good public transport alternatives."],"answer_index":3,"explanation":"Critics argue that such policies \"place the heaviest burden on those with the fewest choices\", such as people in outer districts with limited public transport."},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"What does the writer imply in the final paragraph?","options":["Cities should stop building new roads immediately and spend the money on metro lines.","People will use green transport if it is better than driving, not simply because they are told to.","Cars should be completely banned from city centres, even if alternatives are poor.","The debate can never be solved, so cities should leave their transport systems as they are."],"answer_index":1,"explanation":"The writer says green transport \"works best when it is genuinely more convenient than the car\" and asks how to do it \"in a way that people will actually choose\"."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"allocate it to the most efficient forms of transport\", \"allocate\" means...","options":["take away from someone","sell at a high price","give for a particular purpose","build again from the start"],"answer_index":2,"explanation":"Supporters want limited road space to be given to the transport that moves the most people, such as bus lanes."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'c1-hidden-costs-of-flexible-work',
      'The Hidden Costs of Flexible Work',
      'App-based work offers real freedom, but workers often pay for it with insecurity and a new kind of control.',
      $md$## Freedom on demand

Open a delivery app in almost any large city and, within minutes, someone on a scooter will bring you dinner. Behind that convenience is a growing workforce of couriers, drivers and freelancers who find work through digital platforms rather than through a traditional employer. For many, the appeal is obvious. There is no boss looking over your shoulder, no fixed schedule, and you can start earning almost immediately.

Akmal, a 23-year-old student in Tashkent, has been delivering food for two years. "I choose when I work," he says. "During exams, I stop completely. Nobody fires me for that." For students, parents of young children and people between jobs, this flexibility can be genuinely valuable.

## What the flexibility costs

Yet the arrangement has costs that are far less visible from the customer's side of the app. Because platform workers are usually classified as independent contractors rather than employees, they typically receive none of the protections that come with a regular job: no paid holiday, no sick pay and often no insurance if they are injured at work. A courier who falls off a scooter in icy weather may lose not only their income but also their means of earning it.

Income can also be unpredictable. Pay often depends on the number of orders, the time of day and fees set by the platform, which can change with little notice. "Some evenings are great," Akmal admits. "Other days I wait for an hour and get one order. You can't really plan."

Then there is the question of control. Workers may be free to log in whenever they like, but the app decides which jobs they receive, rates their performance and can deactivate their accounts, sometimes without a clear explanation. The boss, critics argue, has not disappeared; it has simply become an algorithm.

## Rethinking the model

Different countries are experimenting with responses. Some have introduced rules requiring platforms to provide basic insurance or clearer information about how pay is calculated. Others have created a middle category between employee and contractor, offering some protections without removing flexibility altogether. There is no consensus yet on which approach works best.

What seems clear is that flexibility and security need not be opposites. A model in which workers can choose their hours and still be protected against injury or a sudden loss of income is not unimaginable. Whether it becomes reality will depend on decisions made by platforms, by lawmakers and, increasingly, by customers who are beginning to ask who is really paying for their fast and cheap deliveries.

## The view from the scooter

For Akmal, the job is a stepping stone, not a career. "It's fine for now," he says. "But I wouldn't want to be doing this at forty, with a family to support." His comment captures the dilemma neatly: the gig economy works well for people who need it briefly, and much less well for those who come to depend on it.$md$,
      'C1', 'Work', 'gig economy', 'sky', 3, false, 'published', 530,
      '{"seeded_by":"20261022120500_reading_library_c1","genre":"feature article","writing_tone":"informative","word_count":491}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the main idea of the article?","options":["Platform work offers real flexibility but also has significant hidden disadvantages for workers.","Delivery apps should be banned in large cities because they treat all their workers unfairly.","Students should never take any kind of paid job while they are studying at university.","Platform workers usually earn much more money than people with regular full-time jobs."],"answer_index":0,"explanation":"The article describes the appeal of flexible work and then explains \"What the flexibility costs\"."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"Why do platform workers usually lack paid holiday and sick pay?","options":["They usually work only in the evenings and at weekends.","They choose not to accept these benefits when they sign up.","Their customers do not leave tips large enough to cover them.","They are classified as independent contractors, not employees."],"answer_index":3,"explanation":"The text says that \"Because platform workers are usually classified as independent contractors rather than employees, they typically receive none of the protections\"."},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"What does Akmal say about his income?","options":["It is higher than a teacher's salary.","It is the same every week.","It varies a lot and is difficult to plan.","It is paid by his university."],"answer_index":2,"explanation":"Akmal says some evenings are great but on other days he gets one order in an hour: \"You can't really plan.\""},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"What does the writer mean by \"The boss ... has simply become an algorithm\"?","options":["Workers have finally become their own bosses and can decide everything.","Managers have learned to write their own computer code for the apps.","Workers are still controlled, but by the app's software instead of a person.","Apps have made work completely free of rules, managers and control."],"answer_index":2,"explanation":"The paragraph explains that \"the app decides which jobs they receive, rates their performance and can deactivate their accounts\", so control still exists."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"the job is a stepping stone, not a career\", a \"stepping stone\" is...","options":["a temporary stage that helps you move towards something else","a dangerous part of a job that needs special training","a job that you plan to do for the rest of your life","a cheap kind of transport used by couriers"],"answer_index":0,"explanation":"Akmal says the job is \"fine for now\" but not something he wants at forty, so it is a temporary stage, not a career."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'c1-in-praise-of-boredom',
      'In Praise of Boredom',
      'Research suggests that boredom works as a useful signal and may even help creativity, so we should not always rush to escape it.',
      $md$## An unwelcome feeling

Few emotions have a worse reputation than boredom. We associate it with long queues, dull lectures and endless afternoons, and we go to considerable lengths to avoid it. Today, avoiding boredom has never been easier: at the first hint of it, most of us reach for our phones. Yet a growing body of research suggests that boredom may be more useful than we assume, and that eliminating it entirely could come at a cost.

## What boredom is for

Psychologists generally describe boredom as the uncomfortable feeling of wanting to be engaged in something satisfying but being unable to find it. Understood this way, boredom is not an absence of feeling but a signal, rather like hunger. Just as hunger tells us to look for food, boredom tells us that our current activity is not meeting our needs and that it may be time to change course.

This signal can be powerful. In one widely discussed experiment, researchers asked participants to sit alone in a room with nothing to do but think. Many found the experience so unpleasant that they chose to give themselves a mild electric shock rather than simply sit with their thoughts. Whatever else this shows, it suggests that the urge to escape boredom runs deep.

## Boredom and creativity

Some researchers have argued that boredom can also encourage creativity. When the outside world offers little stimulation, the mind tends to wander, and mind-wandering allows us to make unexpected connections between ideas. Several studies have found that people who first completed a deliberately dull task, such as copying numbers from a list, went on to produce more inventive answers in a creative task than people who had not been bored. The findings are still debated, but they fit with many people's experience of having their best ideas in the shower or on a long walk.

## The problem with constant stimulation

If boredom is a signal, what happens when we silence it every time it appears? Reaching for a phone relieves the discomfort instantly, but it may also prevent us from asking the question boredom is trying to raise: is there something more meaningful I could be doing? Constant stimulation can also leave the mind with little unstructured time in which to wander, reflect and plan.

This does not mean that all boredom is beneficial. Chronic boredom, the kind that persists for weeks in a job or a situation one cannot change, is associated with low mood and other difficulties, and it should be taken seriously rather than romanticised.

## Making room for it

For most of us, though, an occasional short spell of boredom is harmless and possibly helpful. Leaving the phone in your pocket while waiting for a bus, or taking a walk without headphones, are small experiments worth trying. You may find the experience uncomfortable at first. That discomfort, the research suggests, is exactly the point.$md$,
      'C1', 'Science', 'psychology', 'peach', 3, false, 'published', 540,
      '{"seeded_by":"20261022120500_reading_library_c1","genre":"essay","writing_tone":"informative","word_count":481}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the writer's main argument?","options":["Boredom can be useful, so we should not always rush to escape it.","Boredom is a serious illness that needs treatment.","People today are more bored than people in the past.","Phones are the main cause of boredom."],"answer_index":0,"explanation":"The writer says boredom \"may be more useful than we assume\" and recommends \"Making room for it\"."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"What comparison does the writer use to explain the purpose of boredom?","options":["It is like hunger, a signal that something needs to change.","It is like sleep, a way of giving the brain a rest.","It is like a phone notification that interrupts us.","It is like a mild electric shock that we try to avoid."],"answer_index":0,"explanation":"The text says boredom is \"a signal, rather like hunger. Just as hunger tells us to look for food, boredom tells us ... it may be time to change course.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"In the studies described, what did people do before the creative task?","options":["A long walk outside without any headphones","A short test of their memory and attention","A deliberately dull task, such as copying numbers","A friendly conversation with a researcher"],"answer_index":2,"explanation":"The text mentions people \"who first completed a deliberately dull task, such as copying numbers from a list\"."},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"Why does the writer mention chronic boredom?","options":["To prove that every kind of boredom makes people more creative in the end","To recommend that people who feel bored at work should change their jobs often","To show that not all boredom is positive and some should be taken seriously","To explain why people chose an electric shock rather than sitting with their thoughts"],"answer_index":2,"explanation":"The writer introduces it with \"This does not mean that all boredom is beneficial\" and says it \"should be taken seriously\"."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"should be taken seriously rather than romanticised\", \"romanticised\" means...","options":["studied carefully by scientists in a laboratory","completely ignored by doctors and by other people","treated with medicine by a doctor or a specialist","described as better or more attractive than it really is"],"answer_index":3,"explanation":"The writer contrasts \"taken seriously\" with \"romanticised\": chronic boredom should not be presented as something attractive or positive."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'c1-living-between-languages',
      'Living Between Languages',
      'A young multilingual professional in Tashkent shows that switching between languages is normal, skilful and rewarding.',
      $md$## Three languages before lunch

On a typical morning, Nilufar speaks Uzbek with her grandmother over breakfast, switches to Russian when she meets her university friends, and spends the afternoon writing emails in English for the small design studio where she works part-time. By evening, she often finds herself mixing all three in a single sentence. "Sometimes I start a thought in one language and finish it in another," she says, laughing. "My friends do the same, so nobody notices."

For a great many people in Central Asia, this kind of daily movement between languages is entirely ordinary. Yet it raises interesting questions about how the multilingual mind works, and about the common belief that mixing languages is a sign of poor mastery.

## Code-switching is not a mistake

Linguists call the practice of alternating between languages within a conversation code-switching. For a long time, it was viewed with suspicion, as if speakers who did it simply lacked the vocabulary to stay in one language. Research over the past few decades has largely overturned that view. Code-switching tends to follow consistent patterns, and fluent bilinguals are often the most skilful at it. Speakers switch to quote someone, to emphasise a point, to express an idea that one language captures more precisely, or to signal friendliness and shared identity.

Nilufar recognises this. "There are Uzbek words for family relationships and feelings that just don't translate well," she says. "And some technical terms I only know in English, because that's how I learned them."

## Different languages, different selves?

Many multilingual people report that they feel slightly different in each language: more formal in one, funnier or more direct in another. This is partly because languages are learned in particular contexts and carry the associations of those contexts. A language learned at home with family may feel warmer; one learned for work may feel more professional. Whether language actually changes the way we think, rather than simply how we express ourselves, remains a debated question, but the experience itself is widely shared.

## The costs and the benefits

Living between languages is not always effortless. Nilufar admits that when she is tired, she sometimes struggles to find the right word in any of her languages, and that formal writing in Uzbek requires more effort than chatting. Multilingual children may also take a little longer to build vocabulary in each individual language, although they usually catch up.

The benefits, however, are considerable. Beyond the obvious practical advantages for study and work, regularly managing several languages may help to train attention and the ability to switch between tasks. Perhaps more importantly, it offers access to several cultures, several bodies of literature and several ways of seeing the world.

"I used to think I didn't speak any language perfectly," Nilufar says. "Now I think I just have a bigger toolbox than most people."$md$,
      'C1', 'Culture', 'multilingualism', 'lavender', 3, false, 'published', 550,
      '{"seeded_by":"20261022120500_reading_library_c1","genre":"feature article","writing_tone":"narrative","word_count":474}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the main idea of the text?","options":["Moving between several languages is normal for many people and has real advantages, despite some challenges.","People should try hard to speak only one language at a time, even when they are with friends.","Uzbek is much more difficult to learn than English or Russian for most people.","Code-switching shows that a speaker does not have enough vocabulary in any language."],"answer_index":0,"explanation":"The article describes Nilufar's daily use of three languages, explains that code-switching \"is not a mistake\", and weighs \"The costs and the benefits\"."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"According to the text, how has research changed the view of code-switching?","options":["It has proved that code-switching causes many language mistakes in children.","It has shown that mainly young children switch between languages.","It has found that code-switching is actually quite rare in Central Asia.","It shows that code-switching follows patterns and is often done by fluent speakers."],"answer_index":3,"explanation":"The text says research \"has largely overturned that view. Code-switching tends to follow consistent patterns, and fluent bilinguals are often the most skilful at it.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"Why does Nilufar know some technical terms only in English?","options":["They do not exist in any other language.","Her grandmother taught them to her.","She learned them in English.","Her university friends only speak English."],"answer_index":2,"explanation":"Nilufar says: \"some technical terms I only know in English, because that's how I learned them.\""},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"What does Nilufar's comment about \"a bigger toolbox\" suggest?","options":["She would like to learn a practical skill such as making furniture.","She now sees her multilingualism as a strength rather than a weakness.","She has decided to speak only English at work from now on.","She still believes that she will never speak any language well."],"answer_index":1,"explanation":"She contrasts her old belief (\"I didn't speak any language perfectly\") with her new view that she has more tools than most people."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"Research ... has largely overturned that view\", \"overturned\" means...","options":["supported strongly","explained clearly","made more popular","shown to be wrong"],"answer_index":3,"explanation":"The old view was that code-switchers \"lacked the vocabulary\"; research now shows the opposite, so the old view has been shown to be wrong."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'c1-true-price-of-a-cheap-t-shirt',
      'The True Price of a Cheap T-Shirt',
      'Fast fashion keeps prices low, but the environment, garment workers and even shoppers pay hidden costs.',
      $md$## Cheaper than ever

Clothes have never been so affordable. A T-shirt can cost less than a meal in a café, and new styles appear in shops and online almost every week. This model, often called fast fashion, has made it possible for people on modest incomes to dress fashionably. But the low price on the label rarely reflects the full cost of a garment. Much of that cost is paid elsewhere: by the environment, by the people who make the clothes and, arguably, by consumers themselves.

## The environmental bill

Producing clothes requires large amounts of water, energy and chemicals. Growing natural fibres such as cotton can use a great deal of water, while synthetic fabrics such as polyester are made from oil. Synthetic garments also shed tiny plastic fibres when they are washed, and some of these pass through water treatment systems and end up in rivers and seas.

The bigger problem, however, may be quantity. Because clothes are cheap, we buy more of them and wear them fewer times before throwing them away. Recycling is less of a solution than many people believe. Most garments are made from blends of different fibres, which are difficult to separate, so only a small share of old clothing is turned into new clothing. Much of the rest is burned, buried or shipped abroad as second-hand goods, where a good deal of it ends up as waste.

## The human cost

Low prices also depend on low production costs, and labour is one of the easiest costs to cut. In parts of the global garment industry, workers face long hours, low pay and unsafe conditions. Brands often rely on long chains of suppliers and subcontractors, which makes it difficult, even for well-intentioned companies, to know exactly how and where their clothes were made.

## Are we really saving money?

There is also a case that fast fashion is not as economical for consumers as it seems. A cheap item that loses its shape after a few washes may cost more per wear than a better-made one that lasts for years. The constant flow of new styles also encourages impulse buying: purchases we did not plan and do not really need.

## What can be done?

No single solution exists, and individual choices alone will not transform a global industry. Still, consumers have more influence than they might think. Buying fewer, better-quality items, repairing clothes rather than replacing them and choosing second-hand all reduce demand for new production. In many Central Asian households, older habits point the way: a skilled tailor can alter a jacket, replace a zip or turn an old dress into something new, often for a fraction of the cost of buying again.

Fashion will always be about change and self-expression. The challenge is to enjoy it without treating clothing as disposable.$md$,
      'C1', 'Society', 'fashion', 'sand', 3, false, 'published', 560,
      '{"seeded_by":"20261022120500_reading_library_c1","genre":"article","writing_tone":"persuasive","word_count":468}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the main idea of the article?","options":["Cotton clothes are always better than polyester clothes.","People should stop following fashion completely.","Cheap fashion has hidden environmental, human and financial costs.","Recycling can solve the problems of the fashion industry."],"answer_index":2,"explanation":"The writer says the price on the label \"rarely reflects the full cost\" and describes costs paid by the environment, workers and consumers."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"According to the article, why is clothing difficult to recycle?","options":["Recycling centres usually refuse to accept old clothes.","Most garments are made from blends of fibres that are hard to separate.","Most clothes are too cheap for anyone to want to collect them.","Synthetic fibres dissolve completely when they are washed."],"answer_index":1,"explanation":"The text says: \"Most garments are made from blends of different fibres, which are difficult to separate\"."},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"Why is it difficult for some brands to know how their clothes were made?","options":["They rely on long chains of suppliers and subcontractors.","They do not employ enough staff to check their factories.","Their own factories are kept secret from them.","Workers refuse to answer questions about their jobs."],"answer_index":0,"explanation":"The text says brands \"rely on long chains of suppliers and subcontractors, which makes it difficult ... to know exactly how and where their clothes were made.\""},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"Why does the writer mention tailors in Central Asian households?","options":["To suggest that local tailors earn much more money than garment factory workers abroad","To show that traditional habits of repairing and reusing clothes offer a practical solution","To argue that clothes and fashion in the past were much better than they are today","To recommend that young people in the region should train to become professional tailors"],"answer_index":1,"explanation":"The writer says \"older habits point the way\" in the section \"What can be done?\", right after recommending repairing clothes."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"treating clothing as disposable\", \"disposable\" means...","options":["expensive, rare and difficult to find in shops","easy to wash at home by hand in cold water","intended to be thrown away after a short time","made by hand by a skilled tailor in a workshop"],"answer_index":2,"explanation":"The article criticises buying clothes and \"throwing them away\" after a few wears, so \"disposable\" means made to be thrown away."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'c1-studying-abroad-or-at-home',
      'Studying Abroad or at Home? A Counsellor''s View',
      'A university admissions counsellor explains how school leavers should decide whether to study abroad.',
      $md$Every year, many school leavers in Uzbekistan face the same question: should they study at a university at home, or try to go abroad? We spoke to Feruza, who has advised students on their university choices for more than ten years.

Q: What is the most common mistake students make when they are making this decision?

Feruza: Starting with the destination rather than the goal. Students often come to me saying, "I want to study in Korea" or "I want to go to Germany", but when I ask what they want to study, or what kind of career they imagine, they haven't thought about it. A university abroad is not automatically better. The right choice depends on the subject, the specific programme and what you want to do afterwards.

Q: So studying abroad isn't always the best option?

Feruza: Not always. There are excellent reasons to go: you become independent, your language skills improve dramatically and you build an international network. In some fields, studying in a country with advanced research facilities can make a real difference. But there are also strong programmes here, including international branch campuses that teach in English, and they cost far less. Students who stay at home can also gain international experience later, through exchange programmes or a master's degree abroad.

Q: What about the cost?

Feruza: It's the factor families most often underestimate. Tuition is only part of it. Accommodation, food, insurance, travel, visa fees: it all adds up. I always ask families to calculate the full cost of the entire course, not just the first year, and to look seriously at scholarships. Many students don't apply for scholarships because they assume they won't get one. That's a mistake. Applying costs relatively little, and the potential benefit is enormous.

Q: How important is English?

Feruza: Very. Even in countries where teaching is in another language, English opens doors. For English-taught programmes, you'll usually need a recognised test score, and you should prepare well in advance. But I tell students that a test score is the minimum, not the goal. Being able to follow a lecture, take part in a seminar and write an academic essay is a different level of skill from passing an exam.

Q: Are students ready for life abroad emotionally?

Feruza: That's the question parents ask least and should ask most. Homesickness is real. So is the shock of managing everything yourself: cooking, budgeting, dealing with official documents in a foreign language. The students who cope best are usually those who have practised independence before leaving, even in small ways.

Q: What's your one piece of advice?

Feruza: Be honest about why you want to go. If the answer is "because everyone else is going", think again. If it's because a particular programme will take you closer to the life you want, then prepare carefully, and go.$md$,
      'C1', 'Study', 'university choices', 'lime', 3, false, 'published', 570,
      '{"seeded_by":"20261022120500_reading_library_c1","genre":"interview","writing_tone":"informative","word_count":476}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the main message of the interview?","options":["Studying abroad is always a better choice than studying at home, whatever subject you want to study.","Only students who have already won a scholarship should think seriously about studying abroad at all.","Students should always choose the cheapest university that accepts them, because cost matters most.","Students should base their choice on their goals and a realistic view of costs and readiness, not on a destination."],"answer_index":3,"explanation":"Feruza warns against \"Starting with the destination rather than the goal\" and discusses cost, English and emotional readiness."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"What does Feruza say families most often underestimate?","options":["The full cost of studying abroad","The quality of local universities","The difficulty of English tests","The number of available scholarships"],"answer_index":0,"explanation":"Asked about cost, Feruza says: \"It's the factor families most often underestimate.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"According to Feruza, why do many students not apply for scholarships?","options":["Applications are very expensive.","They assume they will not get one.","Scholarships are only for local universities.","Their parents don't allow it."],"answer_index":1,"explanation":"Feruza says: \"Many students don't apply for scholarships because they assume they won't get one.\""},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"What does Feruza imply when she says a test score is \"the minimum, not the goal\"?","options":["Most universities abroad no longer ask students for an English test score.","Students need real academic English skills, not just a good exam result.","Students should take the English test several times to get the best score.","English is less important for university than other school subjects are."],"answer_index":1,"explanation":"She explains that following lectures, taking part in seminars and writing essays is \"a different level of skill from passing an exam\"."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"The students who cope best\", \"cope\" means...","options":["study harder than everyone else","spend the least money abroad","deal successfully with difficulties","travel the furthest from home"],"answer_index":2,"explanation":"Feruza is talking about homesickness and managing everything alone; the students who cope best handle these difficulties well."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'c1-why-so-many-people-are-running',
      'Why So Many People Are Running',
      'Amateur running has become a social activity in many cities, with real benefits and a few risks to keep in mind.',
      $md$## From lonely hobby to social event

Not long ago, a person running through the streets of Tashkent or Almaty early in the morning might have attracted curious looks. Today, in many Central Asian cities, groups of runners in bright shirts are a familiar sight in parks and along riverbanks, and city races regularly attract large crowds of participants of all ages. Running, once seen as a solitary and slightly eccentric pastime, has become something of a social phenomenon.

## Why running?

Part of its appeal is simplicity. Running requires no expensive equipment beyond a decent pair of shoes, no booking of courts and no team to organise. It can be done almost anywhere and at almost any time, which suits busy schedules. For people who spend their working day in front of a screen, an early morning run also offers a rare stretch of time without notifications.

The health benefits are well established. Regular moderate exercise is associated with better heart health, improved sleep and lower stress, and many runners say that the mental benefits matter to them as much as the physical ones. Several describe their run as a kind of moving meditation, a period in which problems seem to sort themselves out.

## The power of the group

What has changed most, however, is the social dimension. Running clubs, many of them organised informally through messaging groups, offer a ready-made community. Newcomers are often surprised by how welcoming they are. Mixed-ability groups, in which faster runners wait for slower ones, make the activity accessible to beginners, and the commitment of meeting others at a fixed time makes it much harder to stay in bed on a cold morning.

Shared goals play a role too. Training together for a race, whether a five-kilometre fun run or a full marathon, gives structure to months of effort, and many participants find the moment they cross the finish line unexpectedly emotional.

## A note of caution

Enthusiasm, though, can lead to excess. Doctors and coaches regularly warn that beginners often increase their distance too quickly, which can lead to injury. A marathon is a serious undertaking that requires months of gradual preparation; it is not a sensible target for someone who has only just started. Anyone with an existing health condition is generally advised to consult a doctor before beginning a demanding programme.

There is also a risk that the culture of personal records and fitness apps turns a pleasure into another source of pressure. If every run becomes a performance to be measured and shared, some of the original sense of freedom is lost.

## Running at your own pace

At its best, though, the running boom represents something positive: ordinary people choosing to spend their free time outdoors, moving, and in each other's company. The finish line, after all, is not really the point. As one experienced club runner puts it, "The best run is the one that makes you want to come back tomorrow."$md$,
      'C1', 'Health', 'running', 'mint', 3, false, 'published', 580,
      '{"seeded_by":"20261022120500_reading_library_c1","genre":"feature article","writing_tone":"informative","word_count":491}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the main idea of the article?","options":["Everyone should try to run a full marathon at least once, whatever their age or level of fitness.","Running is more dangerous than most other sports, so beginners should choose another activity.","Fitness apps and personal records are now the main reason why so many people decide to start running.","Running has become a popular social activity with many benefits, though it should be approached sensibly."],"answer_index":3,"explanation":"The article explains the appeal and benefits of running and its new social side, and adds \"A note of caution\"."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"According to the article, why is running easy to fit into a busy life?","options":["Running clubs provide free transport to the parks and riverbanks where they meet.","It needs little equipment and can be done almost anywhere at almost any time.","City races are held every weekend, so there is always a goal to train for.","It only takes ten minutes a day to get all the health benefits."],"answer_index":1,"explanation":"The text says running \"requires no expensive equipment beyond a decent pair of shoes\" and \"can be done almost anywhere and at almost any time, which suits busy schedules.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"What mistake do beginners often make, according to doctors and coaches?","options":["Running alone instead of in a group","Buying shoes that are too expensive","Increasing their distance too quickly","Running only early in the morning"],"answer_index":2,"explanation":"The text says: \"beginners often increase their distance too quickly, which can lead to injury.\""},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"What does the quotation at the end suggest about the writer's view?","options":["Serious runners should train hard every single day of the week.","Enjoying running and wanting to continue matters more than performance.","Competitive races are the best and quickest way for runners to improve.","Beginners should stop running as soon as they start to feel tired."],"answer_index":1,"explanation":"The writer says \"The finish line, after all, is not really the point\" and then quotes a runner who values the run that makes you \"want to come back tomorrow\"."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"a solitary and slightly eccentric pastime\", \"eccentric\" means...","options":["expensive and only for the rich","dangerous and often painful","unusual and a little strange","very popular with young people"],"answer_index":2,"explanation":"Runners used to attract \"curious looks\", which shows people saw running as unusual."}]$q$::jsonb
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
  0.75,
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
  jsonb_build_object('seeded_by', '20261022120500_reading_library_c1'),
  ra.created_by,
  ra.updated_by
from public.reading_articles ra
join public.products p on p.id = ra.product_id
join public.languages l on l.id = ra.language_id
where lower(coalesce(p.metadata->>'slug', '')) = 'english-reading'
  and l.code = 'en'
  and ra.slug in ('ai-bias-everyday-tools', 'green-transport-city-priority', 'c1-hidden-costs-of-flexible-work', 'c1-in-praise-of-boredom', 'c1-living-between-languages', 'c1-true-price-of-a-cheap-t-shirt', 'c1-studying-abroad-or-at-home', 'c1-why-so-many-people-are-running')
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
