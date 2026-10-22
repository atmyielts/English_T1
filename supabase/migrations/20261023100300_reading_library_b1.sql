-- Reading library: B1 articles (8) with comprehension questions.
-- ============================================================================
-- Upserts full-length B1 reading texts (220-320 words) into
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
      v_product_id, v_language_id, 'study-plan-that-lasts',
      'Building a Study Plan That Lasts',
      'Small, regular study sessions and a weekly review make a study plan much easier to keep.',
      $md$Many learners start a new study plan with great energy. They promise to study for three hours every day, and for a week or two, they do. Then life gets busy. They miss a day, then another, and soon the plan is forgotten. The problem is usually not laziness. It is a plan that was too ambitious from the start.

A plan that lasts is built on small, regular sessions. Thirty minutes a day, five days a week, is better than one long session on Sunday, because your brain remembers things better when it meets them again and again. Short sessions are also easier to fit around work, classes and family.

Start by choosing one clear goal for the week, for example, "learn twenty new words about travel" or "finish one practice reading test". Then divide the goal into small daily tasks. Each task should have a result you can see: a list of words, a completed exercise or a short paragraph.

It also helps to study at the same time and in the same place every day. If you always open your book after dinner at the kitchen table, studying becomes a habit, like brushing your teeth.

Finally, spend ten minutes at the end of each week looking back. What worked? What didn't? Maybe mornings are better for you than evenings, or maybe your goals were too big. Use this information to plan the next week.

Remember, a plan is not a promise that you can break. It is a tool that you can improve.$md$,
      'B1', 'Study', 'study habits', 'lime', 2, true, 'published', 310,
      '{"seeded_by":"20261022120300_reading_library_b1","genre":"explainer","writing_tone":"informative","word_count":256}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the main message of the article?","options":["Learners should study for three hours every day to make progress.","Learners who miss a day should stop making study plans.","Studying for a long time on Sundays is the best way to learn.","Small, regular study sessions and a weekly review make a plan easier to keep."],"answer_index":3,"explanation":"The article says \"A plan that lasts is built on small, regular sessions\" and recommends looking back \"at the end of each week\"."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"According to the writer, why do many study plans fail?","options":["Learners are lazy.","They are too ambitious from the start.","Learners study at the same time every day.","The weekly goals are too small."],"answer_index":1,"explanation":"The writer says: \"The problem is usually not laziness. It is a plan that was too ambitious from the start.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"What should each daily task have?","options":["A time limit of three hours","A teacher to check it","A result you can see","A different place to study"],"answer_index":2,"explanation":"The article says: \"Each task should have a result you can see: a list of words, a completed exercise or a short paragraph.\""},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"Why does the writer compare studying to brushing your teeth?","options":["Both can become automatic when you do them at the same time every day.","Both should be done in the kitchen after dinner every evening.","Both take only a few minutes, so they are easy to do.","Both are boring, but everyone has to do them."],"answer_index":0,"explanation":"The writer says studying at the same time and place makes it \"a habit, like brushing your teeth\", something you do without having to decide."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"a plan that was too ambitious from the start\", \"ambitious\" means...","options":["very boring and difficult to follow","carefully organised and planned","trying to do a lot, perhaps too much","too short to be useful"],"answer_index":2,"explanation":"The example is a promise \"to study for three hours every day\", which is too much to keep, so \"ambitious\" means trying to do a lot."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'airport-guides-without-stress',
      'Airport Guides Without Stress',
      'On his first trip abroad, Sardor learns how to find his connecting flight by reading only the important signs.',
      $md$When Sardor flew to Seoul for a language course, it was his first time abroad. His flight from Tashkent had a connection in a big international airport, and he had only one hour and twenty minutes to change planes. He was worried before he even left home.

As soon as he got off the first plane, he saw hundreds of people moving quickly in every direction. Screens and signs were everywhere. For a moment, he did not know where to look.

Then he remembered his sister's advice: "Don't try to read everything. Look for three things: your flight number, your gate and the time." He took out his boarding pass and found his flight number. He followed the yellow signs that said "Transfers" and went through a short security check.

On the departures screen, he found his flight. The gate was B14, and next to it was the word "Boarding". His heart jumped. It was a long walk to the B gates, so he did not stop for coffee. He arrived at the gate just as the final call was announced, and he was one of the last passengers to get on the plane.

On the plane, Sardor thought about what he had learned. Airport signs are designed for fast reading. You do not need to understand every word. You need to find the information that matters to you, in the right order.

On his flight home a month later, he was much calmer. He even had time for that coffee.$md$,
      'B1', 'Travel', 'airports', 'mint', 2, false, 'published', 320,
      '{"seeded_by":"20261022120300_reading_library_b1","genre":"story","writing_tone":"narrative","word_count":251}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the story mainly about?","options":["Why Sardor decided to go to Seoul to take a language course for a month","How Sardor missed his connecting flight and had to wait for the next one","What Sardor ate and drank while he waited for hours at the airport","How Sardor found his next flight by reading only the important information"],"answer_index":3,"explanation":"Sardor follows his sister's advice to look for \"your flight number, your gate and the time\" and reaches his gate in time."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"What three things did Sardor's sister tell him to look for?","options":["The shops, the cafés and the toilets","The exit, the bus and the taxi","His bag, his passport and his ticket","His flight number, his gate and the time"],"answer_index":3,"explanation":"His sister said: \"Look for three things: your flight number, your gate and the time.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"Why didn't Sardor stop for coffee?","options":["All the cafés in the transfer area of the airport were closed.","He had spent all his money before he got to the airport.","It was a long walk to his gate, and his flight was already boarding.","He didn't like the coffee that he had tried on the first plane."],"answer_index":2,"explanation":"The story says the screen showed \"Boarding\" and \"It was a long walk to the B gates, so he did not stop for coffee.\""},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"What can we understand about Sardor on his flight home?","options":["He had a longer connection, so he was bored.","He felt more confident in the airport.","His sister travelled with him.","He missed his flight."],"answer_index":1,"explanation":"The story says he \"was much calmer\" and \"even had time for that coffee\", which shows he was more confident."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"His flight from Tashkent had a connection\", a \"connection\" is...","options":["a phone call to your family before you fly","a seat next to a friend on the plane","a change from one plane to another during a journey","a problem that makes a flight late"],"answer_index":2,"explanation":"The story explains that Sardor had \"one hour and twenty minutes to change planes\", so a connection is a change of plane."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'remote-collaboration-signals',
      'Remote Collaboration Signals',
      'In remote teams, you need to notice what short messages do not say and ask clear questions.',
      $md$More and more people now work with colleagues they rarely see. Their team may be spread across Tashkent, Almaty and Berlin, and most communication happens in short written messages. This is convenient, but it also creates a new challenge: you have to understand not only what people write, but also what they don't write.

Look at this message from a team chat: "Design is nearly done. Still waiting for the final texts from marketing." It sounds positive, but there is a hidden signal. The word "waiting" tells you that the work is blocked. Someone else must act before the designer can finish.

Here is another one: "We should probably look at the budget at some point." There is no deadline and no name. Who will look at the budget, and when? Messages like this often mean that nobody takes responsibility, and the task is forgotten.

Experienced remote workers read messages with three questions in mind. First, is anything blocked? Words like "waiting", "pending" or "stuck" are clues. Second, who is responsible? Look for a name next to each action. Third, when is it due? Phrases like "soon" or "later this week" are not real deadlines.

If one of these is missing, don't guess. Ask a short, polite question, such as "Who will check the budget, and can we finish it by Friday?" It may feel a little direct, but clear questions save a lot of time. In a remote team, one simple question can prevent a week of confusion.$md$,
      'B1', 'Work', 'remote work', 'sky', 2, false, 'published', 330,
      '{"seeded_by":"20261022120300_reading_library_b1","genre":"explainer","writing_tone":"informative","word_count":249}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the main idea of the text?","options":["Remote work is more convenient than office work because people can live anywhere.","Designers and marketing teams often disagree about deadlines in team chats.","In remote teams, you need to read messages carefully for hidden problems and ask clear questions.","Team chats should only be used for urgent messages, not for everyday work."],"answer_index":2,"explanation":"The text says you must understand \"what they don't write\" and recommends asking \"a short, polite question\"."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"In the first example, what does the word \"waiting\" show?","options":["The design is completely finished and ready to send.","The marketing team is on holiday this week.","The designer is waiting for a meeting with the manager.","The designer cannot finish until someone else does their part."],"answer_index":3,"explanation":"The text says: \"The word 'waiting' tells you that the work is blocked. Someone else must act before the designer can finish.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"Which phrase does the writer say is NOT a real deadline?","options":["\"later this week\"","\"by Friday\"","\"on 15 March\"","\"before 3 p.m. today\""],"answer_index":0,"explanation":"The text says: \"Phrases like 'soon' or 'later this week' are not real deadlines.\""},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"What will probably happen to a task described as \"We should probably look at the budget at some point\"?","options":["The manager will check it on Friday.","The budget will become smaller.","It might never be done.","The marketing team will do it immediately."],"answer_index":2,"explanation":"The message has \"no deadline and no name\", and the writer says such messages \"often mean that nobody takes responsibility, and the task is forgotten.\""},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"when is it due?\", \"due\" means...","options":["paid for by the team","started for the first time","expected to be finished","cancelled by the manager"],"answer_index":2,"explanation":"This question is about deadlines, so \"due\" means the time when the work should be finished."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'b1-why-everyone-loves-somsa',
      'Why Everyone Loves Somsa',
      'A short article about somsa, the baked pastry that is one of the favourite snacks in Uzbekistan.',
      $md$Walk down almost any street in Uzbekistan in the morning and you will smell it: fresh somsa coming out of a hot tandir oven. These golden pastries are one of the country's favourite snacks, and people of all ages eat them for breakfast, for lunch or on the way home from work.

A classic somsa has thin, crispy pastry outside and a juicy filling inside. The most traditional filling is lamb with onion, black pepper and cumin, but there are many others. In autumn, pumpkin somsa is popular, and in spring, some bakers make a version with fresh green herbs.

What makes somsa special is the tandir, a round clay oven that is very hot inside. The baker sticks the raw pastries onto the inside wall of the oven by hand. This is not easy. Bakers have to work fast so that they don't burn their arms.

Every region has its own style. In some places, somsa is small and shaped like a triangle. In others, it is big and square, or made with many thin layers of pastry. People often argue, in a friendly way, about which region makes the best one.

Somsa is also cheap and easy to carry, which explains why it is so popular with students and workers. But for many people, it is more than fast food. It is the smell of their childhood, of school mornings and family trips. Ask someone where to find the best somsa in their town, and be ready for a long answer!$md$,
      'B1', 'Culture', 'food', 'peach', 2, false, 'published', 340,
      '{"seeded_by":"20261022120300_reading_library_b1","genre":"article","writing_tone":"informative","word_count":253}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the article mainly about?","options":["How to open a bakery","The history of clay ovens around the world","Why somsa is unhealthy","What somsa is and why people in Uzbekistan love it"],"answer_index":3,"explanation":"The article describes somsa, how it is baked, regional styles and why it is so popular."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"What is the most traditional filling?","options":["Pumpkin with onion and black pepper","Fresh green herbs with cumin","Cheese and potato with onion","Lamb with onion, black pepper and cumin"],"answer_index":3,"explanation":"The article says: \"The most traditional filling is lamb with onion, black pepper and cumin.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"How do bakers put somsa in the tandir?","options":["They put them on a metal tray in the middle.","They stick the pastries onto the inside wall by hand.","They drop them into a pot of very hot oil.","They push them in with a long wooden tool."],"answer_index":1,"explanation":"The article says: \"The baker sticks the raw pastries onto the inside wall of the oven by hand.\""},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"What does the last sentence suggest about people and somsa?","options":["People don't know where to find good somsa in their town.","People think somsa has become too expensive to buy.","People prefer other kinds of food to somsa these days.","People have strong opinions about it and enjoy talking about it."],"answer_index":3,"explanation":"The writer says you should \"be ready for a long answer\", which suggests people care a lot and like to talk about their favourite somsa."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"a juicy filling\", \"juicy\" means...","options":["dry and hard to eat","very hot and spicy","full of liquid and tasty","cold and without taste"],"answer_index":2,"explanation":"The filling is contrasted with the \"thin, crispy pastry outside\", so \"juicy\" means soft, full of liquid and tasty."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'b1-phones-at-bedtime',
      'Phones at Bedtime',
      'An explainer on why using a phone in bed can make it harder to sleep, with simple changes to try.',
      $md$It's 11 p.m. You are in bed and you plan to sleep soon, but first you check one message. Then you watch a short video, and then another. Suddenly, it's 1 a.m., and you feel more awake than before. Sound familiar?

Many sleep experts say that using a phone in bed can make it harder to fall asleep. There are a few reasons for this.

The first is light. Phone screens give out bright light, and our bodies use light and darkness to know when it is time to sleep. Bright light late at night may tell your brain that it is still daytime.

The second reason is your mind. Social media, games and news are designed to keep you interested. An exciting video or a worrying message can keep your thoughts busy long after you put the phone down.

The third reason is simple: time. Every minute you spend on your phone is a minute you are not sleeping.

So what can you do? You don't need to give up your phone completely. Try small changes. Stop using screens about thirty minutes before bed, and read a paper book or listen to quiet music instead. Charge your phone on the other side of the room, so you have to get up to reach it. If you use your phone as an alarm, think about buying a cheap alarm clock.

Changes like these may feel strange at first. But after a week or two, many people find that they fall asleep faster and wake up feeling more rested.$md$,
      'B1', 'Health', 'sleep', 'lavender', 2, false, 'published', 350,
      '{"seeded_by":"20261022120300_reading_library_b1","genre":"explainer","writing_tone":"informative","word_count":258}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the main purpose of the article?","options":["To explain why phones can affect sleep and suggest some simple changes","To persuade readers to stop using their phones completely","To compare the screens of different kinds of phones","To explain how social media companies make their money"],"answer_index":0,"explanation":"The article gives three reasons why phones affect sleep and then asks \"So what can you do?\""},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"According to the article, how can bright light from a screen affect you?","options":["It can damage your eyes after only a few minutes.","It can make you feel hungry late at night.","It helps your body relax so you fall asleep faster.","It may tell your brain that it is still daytime."],"answer_index":3,"explanation":"The article says: \"Bright light late at night may tell your brain that it is still daytime.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"Why does the writer suggest charging your phone on the other side of the room?","options":["So it charges faster","So you can hear the alarm better","So the battery lasts longer","So you have to get up to reach it"],"answer_index":3,"explanation":"The article says: \"Charge your phone on the other side of the room, so you have to get up to reach it.\""},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"Who is the article probably written for?","options":["Doctors who study sleep problems in hospitals","Parents who have babies and young children","People who often use their phones late at night","Shop owners who sell cheap alarm clocks"],"answer_index":2,"explanation":"The article starts by describing someone using a phone in bed until 1 a.m. and asks \"Sound familiar?\", so it speaks to people who do this."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"wake up feeling more rested\", \"rested\" means...","options":["more worried","hungrier","more awake at night","less tired"],"answer_index":3,"explanation":"The changes help people \"fall asleep faster\", so they wake up less tired."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'b1-weekends-at-the-animal-shelter',
      'Weekends at the Animal Shelter',
      'An interview with a young accountant who volunteers at a shelter for cats and dogs every Saturday.',
      $md$Zarina is 24 and works as an accountant during the week. On Saturdays, she volunteers at a shelter for homeless cats and dogs on the edge of the city. We asked her about it.

Q: How did you start volunteering?

Zarina: Two years ago, I found a small, hungry puppy near my office. I took him to the shelter because I couldn't keep him in my flat. The staff were so kind, and I saw how much work they had. The next week, I went back to help.

Q: What do you do there?

Zarina: Everything! I clean the cages, give the animals food and water, and take the dogs for walks. The walks are my favourite part. Some dogs are scared of people at first, so we spend a lot of time just sitting with them.

Q: What is the hardest part?

Zarina: Saying goodbye, I think. When an animal finds a new home, I'm happy, of course, but I also miss them. And sometimes we don't have enough space or money for food, which is stressful.

Q: Has volunteering changed you?

Zarina: Definitely. I'm more patient now. In my job, I want everything to happen quickly, but you can't hurry a frightened dog. You have to wait until it trusts you.

Q: What would you say to people who want to help?

Zarina: Start small. You don't have to come every week. You can share our posts online, donate old towels and blankets, or give an animal a home for a few weeks. Every little thing helps.$md$,
      'B1', 'Society', 'volunteering', 'sand', 2, false, 'published', 360,
      '{"seeded_by":"20261022120300_reading_library_b1","genre":"interview","writing_tone":"friendly","word_count":259}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the interview mainly about?","options":["How Zarina became an accountant after university","How to train a dog that is scared of people","Why Zarina wants to leave her job and work with animals","Zarina's experience of volunteering at an animal shelter"],"answer_index":3,"explanation":"Zarina talks about how she started, what she does at the shelter and how volunteering has changed her."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"Why did Zarina first go to the shelter?","options":["She took a puppy there that she couldn't keep.","Her friend worked there and asked her to help.","She wanted to adopt a cat for her flat.","Her office organised a visit for the staff."],"answer_index":0,"explanation":"Zarina says: \"I took him to the shelter because I couldn't keep him in my flat.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"Which of these does Zarina NOT suggest for people who want to help?","options":["Sharing the shelter's posts online","Donating old towels and blankets","Giving an animal a home for a few weeks","Working at the shelter every day"],"answer_index":3,"explanation":"Zarina says \"You don't have to come every week\" and suggests sharing posts, donating towels and blankets, or giving an animal a home."},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"Why does Zarina say \"you can't hurry a frightened dog\"?","options":["To complain that the dogs at the shelter are difficult","To show that she doesn't enjoy her job as an accountant","To explain how volunteering has taught her to be patient","To explain why the dogs need long walks every day"],"answer_index":2,"explanation":"She says this as an answer to \"Has volunteering changed you?\" right after \"I'm more patient now.\""},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"donate old towels and blankets\", \"donate\" means...","options":["sell for a low price","give for free to help others","wash and return them","borrow for a short time"],"answer_index":1,"explanation":"Zarina lists ways to help the shelter, so \"donate\" means give things for free."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'b1-saving-water-at-home',
      'Small Ways to Save Water at Home',
      'Easy everyday changes in the bathroom, kitchen and garden that help families save water.',
      $md$In Central Asia, water has always been precious. Our grandparents built their towns along rivers and canals, and farmers depended on every drop. Today, most of us just turn on a tap, and clean water comes out. Because it is so easy, we often forget how valuable it is.

Hot, dry summers and growing cities mean that water is becoming a serious concern in many parts of the region. Big changes, such as better irrigation for farms, are the job of experts and the authorities. But there are also small things every family can do at home.

Start in the bathroom. A short shower uses much less water than a long one, and turning off the tap while you brush your teeth is an easy habit to learn. If a tap is dripping, fix it as soon as possible. A small drip doesn't look like much, but over a month, it can waste a surprising amount of water.

In the kitchen, wash fruit and vegetables in a bowl instead of under running water. Then you can use that water for your plants. Wait until the washing machine is full before you use it.

If you have a garden, water it early in the morning or in the evening. In the middle of the day, the sun is so hot that a lot of the water disappears before it reaches the roots of the plants.

None of these changes is difficult, and together they make a real difference. They can also lower your water bill, which is good news for everyone.$md$,
      'B1', 'Environment', 'water', 'lime', 2, false, 'published', 370,
      '{"seeded_by":"20261022120300_reading_library_b1","genre":"article","writing_tone":"persuasive","word_count":260}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the main idea of the text?","options":["The authorities should build more rivers and canals.","Water in Central Asia is free, so nobody saves it.","Families can save water at home with small, easy changes.","Farmers use too much water in hot, dry summers."],"answer_index":2,"explanation":"The writer says \"there are also small things every family can do at home\" and gives examples for the bathroom, kitchen and garden."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"What does the writer suggest doing with the water you use to wash vegetables?","options":["Drinking it","Using it for your plants","Using it in the washing machine","Pouring it back into the river"],"answer_index":1,"explanation":"The text says: \"wash fruit and vegetables in a bowl ... Then you can use that water for your plants.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"Why is it better to water a garden in the morning or evening?","options":["In the middle of the day, a lot of the water disappears because of the heat.","Plants are asleep in the afternoon and cannot drink.","Water is cheaper in the morning and the evening.","Neighbours complain about garden noise in the middle of the day."],"answer_index":0,"explanation":"The text says: \"In the middle of the day, the sun is so hot that a lot of the water disappears before it reaches the roots.\""},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"Why does the writer mention our grandparents in the first paragraph?","options":["To show that people in the region have always known that water is valuable","To explain how our grandparents used to fix dripping taps in their homes","To say that life in the past was much easier and simpler than it is today","To suggest that families should move to towns that are close to rivers"],"answer_index":0,"explanation":"The writer says our grandparents built towns along rivers and \"depended on every drop\", and contrasts this with how we \"often forget how valuable it is\" today."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"water has always been precious\", \"precious\" means...","options":["dirty and unsafe to drink","cheap and easy to find","cold and fresh from the river","very valuable and important"],"answer_index":3,"explanation":"The paragraph ends by saying \"we often forget how valuable it is\", so \"precious\" means very valuable."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'b1-learning-to-swim-at-thirty',
      'Learning to Swim at Thirty',
      'A personal story about an adult who finally learns to swim after years of feeling embarrassed.',
      $md$I grew up in a small town far from the sea, and there was no swimming pool nearby. In summer, my friends sometimes swam in the canal, but my parents said it was too dangerous, so I always stayed on the bank. By the time I was an adult, I was too embarrassed to tell anyone that I couldn't swim.

Then, last year, my company organised a summer trip to Lake Issyk-Kul in Kyrgyzstan. Everyone was excited about swimming, and I made excuses. I said I had a cold. I said I had forgotten my swimming costume. While my colleagues laughed and splashed in the water, I sat on the beach and felt miserable.

When I got home, I decided to do something about it. I found a sports centre that offered lessons for adults, and I signed up before I could change my mind.

The first lesson was terrible. I was the oldest person in the group, and when I put my face in the water, I panicked. But our instructor, Olga, was very patient. She told me that many adults are afraid of water and that fear is normal. For the first two weeks, we just practised breathing and floating.

Slowly, things started to change. After a month, I could swim across the pool. After three months, I could swim twenty lengths without stopping.

I am thirty-one now, and I swim twice a week before work. I'm not fast, and I'm still not a big fan of deep water. But this summer, when we go back to the lake, I will be in the water with everyone else.$md$,
      'B1', 'Health', 'swimming', 'mint', 2, false, 'published', 380,
      '{"seeded_by":"20261022120300_reading_library_b1","genre":"personal story","writing_tone":"narrative","word_count":270}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the story mainly about?","options":["Why swimming in canals is dangerous for young children","A company trip to a lake that went badly wrong","How the writer became a swimming instructor","How the writer overcame a fear and learned to swim as an adult"],"answer_index":3,"explanation":"The writer explains why they never learned to swim, then describes taking lessons and becoming a confident swimmer."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"Why didn't the writer swim as a child?","options":["The writer was often ill and had to stay at home during the summer holidays.","The writer lived by the sea but was afraid of the big waves.","There was no pool nearby, and their parents said the canal was too dangerous.","None of the writer's friends could swim, so nobody could teach the writer."],"answer_index":2,"explanation":"The story says \"there was no swimming pool nearby\" and \"my parents said it was too dangerous\"."},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"What did the group do in the first two weeks of lessons?","options":["They swam across the pool together.","They swam twenty lengths without stopping.","They practised breathing and floating.","They practised diving into deep water."],"answer_index":2,"explanation":"The story says: \"For the first two weeks, we just practised breathing and floating.\""},{"id":"q4","type":"mcq","skill":"reading.inference","prompt":"Why did the writer make excuses on the company trip?","options":["They didn't want their colleagues to know that they couldn't swim.","They really had a cold and felt too ill to swim.","They didn't like their colleagues and wanted to be alone.","The water in the lake was much too cold for swimming."],"answer_index":0,"explanation":"The writer was \"too embarrassed to tell anyone that I couldn't swim\", so the excuses were a way to hide this."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"I sat on the beach and felt miserable\", \"miserable\" means...","options":["very relaxed","very hot","very hungry","very unhappy"],"answer_index":3,"explanation":"The writer sat alone while colleagues \"laughed and splashed\", so they felt very unhappy."}]$q$::jsonb
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
  0.45,
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
  jsonb_build_object('seeded_by', '20261022120300_reading_library_b1'),
  ra.created_by,
  ra.updated_by
from public.reading_articles ra
join public.products p on p.id = ra.product_id
join public.languages l on l.id = ra.language_id
where lower(coalesce(p.metadata->>'slug', '')) = 'english-reading'
  and l.code = 'en'
  and ra.slug in ('study-plan-that-lasts', 'airport-guides-without-stress', 'remote-collaboration-signals', 'b1-why-everyone-loves-somsa', 'b1-phones-at-bedtime', 'b1-weekends-at-the-animal-shelter', 'b1-saving-water-at-home', 'b1-learning-to-swim-at-thirty')
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
