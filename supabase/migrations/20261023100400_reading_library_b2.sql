-- Reading library: B2 articles (8) with comprehension questions.
-- ============================================================================
-- Upserts full-length B2 reading texts (320-450 words) into
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
      v_product_id, v_language_id, 'meeting-notes-reading-between-lines',
      'Reading Between the Lines in Meeting Notes',
      'Short meeting notes often hide disagreements, unclear tasks and missing decisions, and careful readers can spot them.',
      $md$## More than a record

Most of us think of meeting notes as a simple record of what was said. In reality, they are often one of the most important documents a team produces, because they decide what happens next. Yet many people skim them in a few seconds and miss what matters. Learning to read notes carefully, and to notice what they leave out, is a valuable professional skill.

## A typical example

Imagine you receive these notes after a project meeting:

"Launch date discussed. Most agree that 15 May is realistic. Testing behind schedule; Dilshod to follow up with the supplier. Budget increase raised again; decision pending. Next meeting TBC."

At first glance, everything seems under control. But a closer reading tells a different story.

## What the notes are really saying

"Most agree" means that someone does not. Who disagrees, and why? If that person is responsible for an important part of the project, the launch date may be at risk.

"Testing behind schedule" describes a problem, but the note gives no new deadline. "Dilshod to follow up" names an owner, which is good, yet "follow up" is vague. Will he call the supplier today, or send an email next week?

"Raised again" suggests that the budget has been discussed before without a result. "Decision pending" means that nobody has made a decision, and nobody has been named to make one. Problems like this tend to grow quietly until they suddenly become urgent.

Finally, "Next meeting TBC" (to be confirmed) means there is no fixed date to check progress.

## Turning notes into action

A useful habit is to rewrite any set of notes in three short lines: what was decided, what is still open, and who is responsible for each open item. If you cannot complete a line, that gap is exactly what you should ask about.

It can feel awkward to reply to the whole team with questions. However, a polite message such as "Could we confirm who will make the budget decision, and by when?" usually earns respect rather than irritation. Clear notes protect everyone, including the people who wrote them.$md$,
      'B2', 'Work', 'meetings', 'lime', 2, false, 'published', 410,
      '{"seeded_by":"20261022120400_reading_library_b2","genre":"explainer","writing_tone":"informative","word_count":353}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the writer's main point?","options":["Meeting notes are usually too long and detailed to be useful.","Teams should stop writing notes and record their meetings instead.","Reading meeting notes carefully can reveal problems that are not stated directly.","Only managers need to read meeting notes carefully."],"answer_index":2,"explanation":"The writer says readers should \"notice what they leave out\" and then shows the hidden problems in an example."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"According to the writer, what does \"Most agree\" suggest?","options":["Everyone agrees with the date.","At least one person does not agree.","The manager has made the final decision.","The meeting was cancelled."],"answer_index":1,"explanation":"The text says: \"'Most agree' means that someone does not.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"What is the problem with \"Dilshod to follow up with the supplier\"?","options":["It does not say who is responsible.","It does not say exactly what he will do or when.","Dilshod is not part of the team.","The supplier has already finished testing."],"answer_index":1,"explanation":"The text says it \"names an owner, which is good, yet 'follow up' is vague. Will he call the supplier today, or send an email next week?\""},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"Why does the writer think the budget issue is worrying?","options":["It has come up before, no decision has been made, and no one is responsible for making one.","The team has already spent far more money than the budget allows for this project.","Dilshod refused to discuss the budget with the supplier at the last meeting.","The supplier has asked for much more money than the team originally agreed to pay."],"answer_index":0,"explanation":"The writer explains that \"raised again\" means it was discussed before \"without a result\" and that \"nobody has been named to make\" a decision, so it may \"grow quietly\"."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"'follow up' is vague\", \"vague\" means...","options":["rude","very urgent","not clear or exact","completely wrong"],"answer_index":2,"explanation":"The writer explains the problem with two questions about what exactly Dilshod will do and when, so \"vague\" means not clear or exact."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'museum-captions-like-curator',
      'Reading Museum Captions Like a Curator',
      'Museum captions move from facts to interpretation, and noticing this shift makes a visit far richer.',
      $md$## Small text, big ideas

In most museums, visitors spend only a few seconds in front of each object. They glance at it, read the first line of the caption and move on. Curators, the people who plan exhibitions, hope for more. A good caption is written to help you see the object differently, and understanding how captions are built can turn a quick visit into a much richer experience.

## How a caption is organised

Most captions follow the same pattern. They begin with facts: what the object is, where and when it was made, and what it is made of. Then, often in the second half, they move from fact to interpretation. This is where the curator tells you why the object matters.

Consider this example:

"Bowl. Samarkand, 10th century. Earthenware with white and black decoration. The elegant writing around the rim is a saying about generosity. Bowls like this were probably used to serve guests, suggesting that the owner wanted visitors to notice both the craftsmanship and the message."

The first sentences are facts that experts can check. The last sentence contains an interpretation, and the word "probably" signals that it is an educated guess, not a certainty.

## Reading actively

Once you notice this shift, you can start asking questions. What evidence supports the curator's interpretation? Can you see it in the object itself? In this case, look closely at the bowl. Is the writing large and easy to read from across a table? If so, the idea that it was meant to be noticed by guests becomes more convincing.

Pay attention, too, to words that show how confident the curator is: "possibly", "is thought to", "may have". These small words are a reminder that history is often a matter of careful reasoning rather than simple fact.

## A simple exercise

On your next museum visit, choose three objects. For each one, read the caption, then look at the object for at least a full minute. Afterwards, try to explain to a friend what the caption claimed and whether you agree with it. You may be surprised by how much more you remember, and by how differently you begin to see the objects themselves.$md$,
      'B2', 'Culture', 'museums', 'mint', 3, false, 'published', 420,
      '{"seeded_by":"20261022120400_reading_library_b2","genre":"explainer","writing_tone":"informative","word_count":364}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the text mainly about?","options":["How to read museum captions more actively and critically","The history of pottery made in Samarkand in the 10th century","How to train to become a museum curator","Why museums should use shorter, simpler captions"],"answer_index":0,"explanation":"The writer explains how captions are organised and suggests questions and an exercise for \"Reading actively\"."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"According to the text, what usually comes in the second half of a caption?","options":["The date and place where the object was made","The name of the curator who wrote the caption","A description of what the object is made of","An interpretation of why the object matters"],"answer_index":3,"explanation":"The text says: \"Then, often in the second half, they move from fact to interpretation. This is where the curator tells you why the object matters.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"What does the word \"probably\" show in the example caption?","options":["The fact has been checked by experts.","The curator disagrees with other experts.","The bowl was definitely made in Samarkand.","The idea is an educated guess, not a certainty."],"answer_index":3,"explanation":"The text says \"probably\" \"signals that it is an educated guess, not a certainty.\""},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"Why does the writer suggest checking whether the writing on the bowl is large and easy to read?","options":["To find out how old the bowl is and where it was made","To test whether the object itself supports the curator's interpretation","To learn how to read the saying around the rim","To decide whether the bowl is beautiful enough to display"],"answer_index":1,"explanation":"The writer asks \"What evidence supports the curator's interpretation? Can you see it in the object itself?\" and says large writing would make the idea \"more convincing\"."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"They glance at it\", \"glance at\" means...","options":["study carefully","look at quickly","take a photo of","touch"],"answer_index":1,"explanation":"Visitors \"spend only a few seconds in front of each object\", so \"glance at\" means look at quickly."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'b2-slow-travel-on-the-silk-road',
      'The Case for Slow Travel on the Silk Road',
      'An opinion piece arguing that visitors to Uzbekistan would gain more by seeing fewer places and staying longer.',
      $md$## Seeing more by doing less

Every year, more visitors arrive in Uzbekistan with an ambitious plan: Tashkent, Samarkand, Bukhara and Khiva in a week, sometimes less. They rush from one famous monument to the next, take hundreds of photos and fly home exhausted. I understand the temptation. These cities are extraordinary, and holidays are short. But I want to argue that travellers would gain far more by seeing less.

## What fast travel misses

When you have only a day in a city, you inevitably spend it in the busiest places at the busiest times. You see the great buildings, but you rarely see how people actually live around them. You eat where the tour buses stop, and you talk mostly to guides, drivers and hotel staff.

Slow travel means staying longer in fewer places. Spend four or five days in Bukhara instead of one, and the city starts to reveal itself. You find a teahouse where the same old men play chess every afternoon. You learn which bakery sells the best bread and when it comes out of the oven. You walk the old streets early in the morning, before the crowds arrive, and hear the city waking up.

## Better for travellers and for hosts

There is also a practical argument. Visitors who stay longer tend to spend their money more widely: in family guesthouses, small restaurants and local workshops, rather than only in the biggest hotels. This spreads the benefits of tourism across more of the community.

Slow travel is kinder to the traveller, too. Long days on the road, with early starts and late arrivals, leave little energy for curiosity. Without a rigid schedule, you can accept an unexpected invitation, take a cooking class or simply sit and watch.

## A fair objection

Critics will say that not everyone has the time or money for a long trip, and they are right. But slow travel is a mindset, not a length of time. Even on a one-week holiday, you could choose two cities instead of four. You would miss some famous sights, it is true. In exchange, you would leave with something rarer: the feeling that you have actually been somewhere.$md$,
      'B2', 'Travel', 'tourism', 'sky', 3, false, 'published', 430,
      '{"seeded_by":"20261022120400_reading_library_b2","genre":"opinion","writing_tone":"persuasive","word_count":362}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the writer's main argument?","options":["Tourists should avoid famous cities such as Samarkand and Bukhara.","Travellers get more from a trip if they visit fewer places and stay longer.","Tour guides in Uzbekistan charge travellers far too much.","Holidays should always last more than a month to be worthwhile."],"answer_index":1,"explanation":"The writer says: \"I want to argue that travellers would gain far more by seeing less.\""},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"According to the writer, what do visitors on fast trips usually do?","options":["Stay in small family guesthouses away from the centre","Take cooking classes and accept local invitations","Spend their time in the busiest places at the busiest times","Walk the old streets early in the morning before the crowds"],"answer_index":2,"explanation":"The text says: \"you inevitably spend it in the busiest places at the busiest times.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"How does slow travel help local communities, according to the writer?","options":["Visitors spend money in more places, such as guesthouses and small restaurants.","Visitors pay higher prices in the biggest hotels, which then employ more people.","Visitors help to build new teahouses in the old towns.","Visitors bring more tour buses and guides to the cities."],"answer_index":0,"explanation":"The text says visitors who stay longer \"spend their money more widely: in family guesthouses, small restaurants and local workshops\"."},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"How does the writer respond to critics in the last section?","options":["The writer says the critics are completely wrong and that everyone can afford a long trip.","The writer partly agrees but argues that slow travel is an attitude, not only a long trip.","The writer admits that slow travel is only a good idea for people with plenty of money.","The writer suggests that people should travel less often but always for at least a month."],"answer_index":1,"explanation":"The writer says the critics \"are right\" about time and money, but adds that \"slow travel is a mindset, not a length of time\"."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"Without a rigid schedule\", \"rigid\" means...","options":["strict and difficult to change","busy and full of excitement","cheap and easy to book","written for you by a guide"],"answer_index":0,"explanation":"Without this kind of schedule, you can \"accept an unexpected invitation\", so \"rigid\" means strict and hard to change."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'b2-why-we-put-things-off',
      'Why We Put Things Off',
      'Procrastination is often a way of avoiding uncomfortable feelings, and a few small strategies can help.',
      $md$## It isn't about laziness

You have an essay due on Friday. It's Tuesday, and instead of starting it, you have tidied your desk, answered every message and watched three videos about cooking. You feel guilty, but you still haven't opened the document. Why?

For a long time, procrastination was seen as a problem of time management or simple laziness. Many psychologists now describe it differently: as a way of avoiding uncomfortable feelings. The task itself makes us feel something unpleasant, such as boredom, confusion or fear of doing badly, and putting it off gives us quick relief. The trouble is that the relief does not last, and the task is still waiting, now with less time to do it.

## Why some tasks are harder to start

Tasks that are unclear, large or connected to how we see ourselves are especially easy to postpone. "Write an essay" is both vague and huge. If you also believe that the essay will show whether you are clever or not, the pressure grows. Perfectionists often procrastinate the most, not because they don't care, but because they care so much that starting feels risky.

## Strategies that help

If procrastination is about feelings, then the solution is to make starting feel less threatening.

First, make the first step tiny and specific. Not "write the essay", but "write three possible titles" or "find two sources". Once you have begun, continuing is usually easier.

Second, give yourself permission to do it badly. A messy first draft can be improved; an empty page cannot.

Third, work for a short, fixed period of time. Set a timer for twenty-five minutes and promise yourself that you can stop when it rings. Often, you won't want to.

Finally, be kind to yourself when you slip. Some research suggests that people who forgive themselves for procrastinating are less likely to do it again, while harsh self-criticism tends to make the unpleasant feelings, and the avoidance, worse.

## The bigger picture

Everyone procrastinates sometimes. The goal is not to become a perfectly efficient machine, but to notice the pattern and gently interrupt it.$md$,
      'B2', 'Study', 'procrastination', 'peach', 2, true, 'published', 440,
      '{"seeded_by":"20261022120400_reading_library_b2","genre":"explainer","writing_tone":"informative","word_count":348}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the main idea of the text?","options":["Procrastination is often a way to avoid unpleasant feelings, and small changes can help.","Procrastination is mainly caused by laziness and poor time management.","Students should always finish their essays several days before the deadline.","Perfectionists never procrastinate because they care about their work."],"answer_index":0,"explanation":"The writer says psychologists now describe procrastination \"as a way of avoiding uncomfortable feelings\" and then gives \"Strategies that help\"."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"According to the text, why do perfectionists often procrastinate?","options":["They don't really care about the quality of their work.","They care so much that starting feels risky.","They usually have too much free time during the week.","They find most tasks too easy to be interesting."],"answer_index":1,"explanation":"The text says perfectionists procrastinate \"not because they don't care, but because they care so much that starting feels risky.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"Which example of a tiny first step does the writer give?","options":["Write the whole introduction","Write three possible titles","Tidy your desk","Answer all your messages"],"answer_index":1,"explanation":"The text says: \"Not 'write the essay', but 'write three possible titles' or 'find two sources'.\""},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"Why does the writer say \"Often, you won't want to\" stop when the timer rings?","options":["Once people have started a task, continuing is easier.","The timer is usually too loud.","Twenty-five minutes is too short to do anything.","People usually forget to set the timer."],"answer_index":0,"explanation":"Earlier the writer explains that \"Once you have begun, continuing is usually easier\", so after twenty-five minutes of work you may want to go on."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"especially easy to postpone\", \"postpone\" means...","options":["finish quickly","forget completely","share with others","delay until later"],"answer_index":3,"explanation":"The whole text is about putting tasks off, so \"postpone\" means delay until later."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'b2-cash-cards-and-qr-codes',
      'Cash, Cards and QR Codes',
      'Digital payments have spread quickly across the region, bringing convenience as well as new problems.',
      $md$## A quiet revolution at the checkout

Not long ago, if you went to a bazaar in Tashkent or Bishkek, you needed a pocket full of cash. Today, many stallholders have a small printed QR code next to their scales. Customers scan it with a phone, type in the amount and pay in seconds. For many people in the region, this change has happened so quickly that they barely noticed it.

## Why digital payments spread

The appeal is easy to understand. Paying by phone is fast, and you no longer need to worry about having the right change. Sending money to family members in another city, which once meant a trip to the bank, can now be done from the sofa. Small businesses benefit too. Gulnora, who sells dried fruit at a market in Samarkand, says she no longer has to go to the bank every evening with a bag of notes. "And customers buy more," she adds, "because they're not limited by what's in their wallet."

## The downsides

However, the shift has not been smooth for everyone. Older people, and those living in areas with a weak internet connection, may find digital payments confusing or unreliable. When the network goes down, a shop that accepts only digital payments simply cannot sell anything.

There are also concerns about security. Fraudsters have become skilled at sending fake messages that appear to come from a bank, persuading people to share passwords or codes. Experts constantly remind users that a real bank will never ask for these details.

Finally, some people worry about privacy. Every digital payment leaves a record, which means that information about where we shop, and what we buy, is stored somewhere.

## Cash isn't dead yet

For now, most sellers still accept both. Gulnora keeps a box of notes and coins under her table. "Some of my regular customers only pay in cash," she says. "I'm not going to send them away." The future may well be digital, but for the moment, it seems, people still like to have a choice.$md$,
      'B2', 'Technology', 'digital payments', 'lavender', 2, false, 'published', 450,
      '{"seeded_by":"20261022120400_reading_library_b2","genre":"article","writing_tone":"informative","word_count":340}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the text mainly about?","options":["How to start and run a small business selling dried fruit at a market in Samarkand","Why cash is going to disappear completely from shops in the region next year","The growth of digital payments in the region, with their advantages and disadvantages","How banks protect their customers from fake messages and other kinds of fraud"],"answer_index":2,"explanation":"The article explains \"Why digital payments spread\", then describes \"The downsides\", and ends by saying cash is still used."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"According to Gulnora, why do customers buy more when they pay digitally?","options":["Prices are lower when customers pay by phone.","The bank gives them a discount on each payment.","They are not limited by the cash in their wallet.","They don't have to wait in a queue to pay."],"answer_index":2,"explanation":"Gulnora says customers buy more \"because they're not limited by what's in their wallet.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"What problem can a shop that accepts only digital payments have?","options":["It has to take cash to the bank every evening.","It must pay extra fees to every customer.","It cannot sell anything when the network goes down.","It loses all its regular customers at once."],"answer_index":2,"explanation":"The text says: \"When the network goes down, a shop that accepts only digital payments simply cannot sell anything.\""},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"What does Gulnora's box of notes and coins suggest about her attitude?","options":["She wants to keep serving customers who prefer cash.","She doesn't trust digital payments at all.","She is planning to stop accepting QR codes.","She is saving money for a new shop."],"answer_index":0,"explanation":"She says some regular customers \"only pay in cash\" and \"I'm not going to send them away\", while she also uses digital payments."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"Fraudsters have become skilled at sending fake messages\", \"fraudsters\" are...","options":["people who work in banks and help customers","people who trick others in order to steal money","people who own shops and sell goods","people who design and build computers"],"answer_index":1,"explanation":"Fraudsters send \"fake messages\" to make people \"share passwords or codes\", so they are people who trick others to steal."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'b2-why-cities-need-more-shade',
      'Why Cities Need More Shade',
      'Cities are often hotter than the countryside, and trees, light-coloured roofs and older design ideas can help.',
      $md$## The heat island effect

On a hot July afternoon, step from a park onto a wide road without trees and you will feel the difference immediately. Cities are often noticeably warmer than the countryside around them, especially at night. Scientists call this the urban heat island effect, and in a region where summer temperatures can climb above forty degrees, it is more than a question of comfort.

## Where the extra heat comes from

The main cause is the materials cities are made of. Asphalt, concrete and brick absorb the sun's energy during the day and release it slowly after dark, so streets stay warm long after sunset. Dark surfaces, such as roads and roofs, absorb the most. At the same time, cars, factories and air conditioners all produce heat of their own. Ironically, the more people use air conditioning to stay cool indoors, the more warm air is pumped into the streets outside.

Cities also lack the natural cooling found in the countryside. Plants release water vapour through their leaves, which cools the air around them, much as sweat cools our skin. When green spaces are replaced by buildings and car parks, this cooling disappears.

## Why it matters

Extreme heat is not just unpleasant. It can be dangerous, especially for elderly people, young children and anyone who works outdoors. Hot nights are a particular problem, because the body needs a cooler period to recover.

## Learning from the past

Older Central Asian cities offer useful lessons. Traditional neighbourhoods were built with narrow, shaded streets and inner courtyards with trees and small pools. Many streets were lined with tall plane trees and small irrigation channels, called aryks, which helped to keep the air cooler.

Modern solutions follow similar ideas: planting trees along streets and in car parks, painting roofs in light colours that reflect sunlight, and creating parks and green corridors where cooler air can move. None of these ideas is new. What is new is the urgency. As summers grow hotter, shade is no longer a luxury. It is part of what makes a city liveable.$md$,
      'B2', 'Environment', 'urban heat', 'sand', 2, false, 'published', 460,
      '{"seeded_by":"20261022120400_reading_library_b2","genre":"explainer","writing_tone":"informative","word_count":345}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the main purpose of the article?","options":["To compare summer weather in different countries of the region","To argue that people should stop using air conditioners at home","To describe the history of the parks and trees in Tashkent","To explain why cities are hotter than the countryside and how shade can help"],"answer_index":3,"explanation":"The article explains the causes of the \"urban heat island effect\" and then describes solutions such as trees and light-coloured roofs."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"Why do city streets stay warm after sunset?","options":["The sun sets later in cities than in the countryside.","Plants in the city release warm air during the night.","People open their windows at night and let warm air out.","Materials such as asphalt and concrete release stored heat slowly."],"answer_index":3,"explanation":"The text says these materials \"absorb the sun's energy during the day and release it slowly after dark\"."},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"How do plants help to cool the air?","options":["They absorb heat from cars.","They reflect sunlight like light-coloured roofs.","They block the wind.","They release water vapour through their leaves."],"answer_index":3,"explanation":"The text says: \"Plants release water vapour through their leaves, which cools the air around them\"."},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"Why does the writer describe the use of air conditioning as ironic?","options":["It is very expensive for families to use in summer.","It was first invented in a country with cold weather.","It cools people indoors but makes the streets outside hotter.","It does not work well during very hot nights."],"answer_index":2,"explanation":"The writer says \"the more people use air conditioning to stay cool indoors, the more warm air is pumped into the streets outside\", the opposite of what people want."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"part of what makes a city liveable\", \"liveable\" means...","options":["full of new and modern buildings","pleasant and suitable to live in","very expensive to live in","popular with tourists in summer"],"answer_index":1,"explanation":"The writer says shade is no longer a luxury but something a city needs so that people can live there comfortably."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'b2-teaching-kurash-interview',
      'Interview: Teaching Kurash to a New Generation',
      'A wrestling coach talks about kurash, what it teaches young people and how the sport has changed.',
      $md$Kurash, a traditional form of wrestling, has been practised in Uzbekistan for centuries and is now competed in many countries. We spoke to Sherzod, a coach who has been teaching children and teenagers at a sports school in Namangan for fifteen years.

Q: For readers who don't know it, what makes kurash different from other kinds of wrestling?

Sherzod: The main difference is that everything happens standing up. There's no fighting on the ground. You hold your opponent's jacket and belt and try to throw them onto their back. You can't grab the legs. So it's about balance, timing and reading your opponent, not just strength.

Q: Why do you think young people should try it?

Sherzod: Of course, it makes you strong and fit. But what I value most is the discipline. Kurash has a strong tradition of respect. You greet your opponent before and after every match, and you help them up if they fall. I've seen shy, nervous kids become confident, and I've seen hot-tempered ones learn to control themselves.

Q: Has the sport changed since you were a young wrestler?

Sherzod: Enormously. When I started, we trained in an old hall with thin mats, and nobody outside our region had heard of kurash. Now we have international competitions, proper equipment and video analysis. My students watch recordings of their matches on a tablet and see their mistakes immediately. That would have been unimaginable in my day.

Q: More girls are training now, too.

Sherzod: Yes, and that's one of the best changes. Ten years ago, I had one girl in my group. Now there are many, and some of them are among my best students. Some parents were worried at first, but when they see their daughters competing confidently, they change their minds.

Q: What's the hardest part of your job?

Sherzod: Losing students when they turn sixteen or seventeen. Exams, university, work: life gets busy. I always tell them that the door is open. Even if they stop competing, the habits they learned on the mat, such as patience, respect and getting up after a fall, stay with them for life.$md$,
      'B2', 'Society', 'traditional sport', 'lime', 2, false, 'published', 470,
      '{"seeded_by":"20261022120400_reading_library_b2","genre":"interview","writing_tone":"friendly","word_count":356}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the interview mainly about?","options":["A coach's views on kurash and how teaching it has changed","The rules of all the different kinds of wrestling","How young athletes can become professional wrestlers","Why sports schools in Namangan need more money"],"answer_index":0,"explanation":"Sherzod explains what kurash is, what it teaches young people, and how the sport and his students have changed."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"According to Sherzod, which of these is NOT allowed in kurash?","options":["Holding your opponent's jacket","Throwing your opponent onto their back","Grabbing your opponent's legs","Holding your opponent's belt"],"answer_index":2,"explanation":"Sherzod says: \"You hold your opponent's jacket and belt and try to throw them onto their back. You can't grab the legs.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"How do Sherzod's students use technology today?","options":["They practise their throws with special robots.","They take part in competitions online.","They learn the rules of kurash from an app.","They watch recordings of their matches on a tablet."],"answer_index":3,"explanation":"Sherzod says: \"My students watch recordings of their matches on a tablet and see their mistakes immediately.\""},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"What does Sherzod mean when he tells older students that \"the door is open\"?","options":["They are welcome to come back at any time.","The sports hall is never locked at night.","They can leave each training session early.","He is always looking for new students."],"answer_index":0,"explanation":"He says this about students who leave because \"life gets busy\", meaning they can return later if they want."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"hot-tempered ones learn to control themselves\", \"hot-tempered\" describes people who...","options":["feel warm all the time","are very shy","train very hard","get angry easily"],"answer_index":3,"explanation":"These students \"learn to control themselves\", which suggests that before, they got angry easily."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'b2-the-science-behind-bread',
      'The Science Behind a Perfect Loaf',
      'Yeast, gluten and heat work together to turn flour and water into bread, including the traditional Uzbek non.',
      $md$## An ancient technology

Bread is one of the oldest prepared foods, and for most of history, people made it without understanding why it worked. In Uzbekistan, where a round loaf of non is on almost every table, bakers learned their skills by watching and practising, not by studying chemistry. Yet every loaf is the result of a remarkable series of chemical and biological processes.

## Tiny living helpers

The key ingredient is yeast, a microscopic fungus. When yeast is mixed with flour and water, it begins to feed on sugars in the flour. As it does so, it produces two things: carbon dioxide gas and a small amount of alcohol. This process is called fermentation.

Fermentation does not just make the dough rise; it also creates flavour. This is why many bakers let their dough rest for several hours, or even overnight. A longer, slower fermentation gives the yeast time to produce more complex tastes.

## The role of gluten

Gas alone would simply escape from the dough. What traps it is gluten, a network of proteins that forms when wheat flour is mixed with water and kneaded. Kneading stretches and organises these proteins into a structure that is both strong and elastic, a little like a net of tiny balloons. As the yeast produces gas, the balloons expand and the dough rises.

## What happens in the oven

When the dough goes into a hot oven, the gas bubbles expand quickly, giving the bread a final rise. Then the heat kills the yeast and turns the soft dough into a firm structure. On the surface, a reaction between sugars and proteins, known as the Maillard reaction, creates the golden-brown crust and much of the wonderful smell of fresh bread.

## Science in a traditional loaf

Even the pattern on non has a practical purpose. Before baking, bakers press a special stamp called a chekich into the centre of the dough, making a pattern of small holes. This stops the centre from rising too much, so the loaf keeps its familiar shape: thin and crisp in the middle, thick and soft around the edge. The baker may not describe it in scientific terms, but the knowledge is exactly the same.$md$,
      'B2', 'Science', 'food science', 'mint', 3, false, 'published', 480,
      '{"seeded_by":"20261022120400_reading_library_b2","genre":"explainer","writing_tone":"informative","word_count":366}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the article mainly about?","options":["The long history of bread in Uzbekistan","How to open and run a successful bakery","The scientific processes that make bread rise and bake","Why some people cannot eat bread with gluten"],"answer_index":2,"explanation":"The article explains the roles of yeast, fermentation, gluten and oven heat in making bread."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"What does yeast produce when it feeds on sugars?","options":["Gluten and a small amount of water vapour","Proteins, sugar and a little bit of salt","Carbon dioxide and a small amount of alcohol","Oxygen and a small amount of extra sugar"],"answer_index":2,"explanation":"The text says yeast \"produces two things: carbon dioxide gas and a small amount of alcohol.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"What is the purpose of the chekich?","options":["To kill the yeast before the bread goes in the oven","To stop the centre of the loaf from rising too much","To make the crust golden-brown and crispy","To help the dough rise faster in a warm place"],"answer_index":1,"explanation":"The text says the pattern of holes \"stops the centre from rising too much\"."},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"What does the last sentence suggest about traditional bakers?","options":["They understand how bread works through experience, even without scientific words.","They should study chemistry at university before they start baking.","They do not care very much about the shape of their bread.","They use completely different ingredients from modern bakers."],"answer_index":0,"explanation":"The writer says the baker \"may not describe it in scientific terms, but the knowledge is exactly the same\", and earlier says bakers learned \"by watching and practising\"."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"both strong and elastic\", \"elastic\" means...","options":["easy to break into lots of small pieces","able to stretch and return to its shape","hard and dry on the outside of the loaf","sticky and difficult to touch with hands"],"answer_index":1,"explanation":"Gluten is compared to \"a net of tiny balloons\" that expand as gas is produced, so it can stretch."}]$q$::jsonb
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
  0.60,
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
  jsonb_build_object('seeded_by', '20261022120400_reading_library_b2'),
  ra.created_by,
  ra.updated_by
from public.reading_articles ra
join public.products p on p.id = ra.product_id
join public.languages l on l.id = ra.language_id
where lower(coalesce(p.metadata->>'slug', '')) = 'english-reading'
  and l.code = 'en'
  and ra.slug in ('meeting-notes-reading-between-lines', 'museum-captions-like-curator', 'b2-slow-travel-on-the-silk-road', 'b2-why-we-put-things-off', 'b2-cash-cards-and-qr-codes', 'b2-why-cities-need-more-shade', 'b2-teaching-kurash-interview', 'b2-the-science-behind-bread')
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
