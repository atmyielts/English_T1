-- Reading library: A2 articles (8) with comprehension questions.
-- ============================================================================
-- Upserts full-length A2 reading texts (130-200 words) into
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
      v_product_id, v_language_id, 'grocery-label-choices',
      'Smart Grocery Choices on Labels',
      'A shopper explains how reading food labels helps them choose healthier products.',
      $md$Last month, my doctor told me to eat less sugar and salt. So now, when I go to the supermarket, I read the labels on food packets. It takes a little longer, but I'm learning a lot.

First, I look at the serving size. On one packet of biscuits, the information was for two biscuits, not for the whole packet. I usually eat four or five, so I was eating much more sugar than I thought!

Next, I check the sugar and salt. If two products look the same, I choose the one with less. For example, I compared two kinds of yoghurt. The fruit yoghurt had a lot of sugar, so now I buy plain yoghurt and add fresh fruit at home.

Finally, I read the list of ingredients. Shorter lists are often better. If I can't understand most of the words, I usually put the product back on the shelf.

Shopping is slower now, but I feel healthier, and my doctor is happy too.$md$,
      'A2', 'Health', 'food labels', 'lime', 2, false, 'published', 210,
      '{"seeded_by":"20261022120200_reading_library_a2","genre":"blog post","writing_tone":"friendly","word_count":166}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the main idea of the text?","options":["The writer reads food labels to make healthier choices.","The writer explains how to cook with less salt.","The writer thinks supermarkets are too expensive.","The writer wants to work in a supermarket."],"answer_index":0,"explanation":"The writer describes the steps they follow when reading labels and says, \"I feel healthier.\""},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"Why did the writer start reading labels?","options":["A friend who works in a supermarket told them to.","They wanted to spend less money on food.","A doctor told them to eat less sugar and salt.","They saw a programme about food labels on TV."],"answer_index":2,"explanation":"The text begins: \"Last month, my doctor told me to eat less sugar and salt. So now ... I read the labels.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"What was the problem with the packet of biscuits?","options":["The packet had no list of ingredients on it at all.","The information was for two biscuits, but the writer usually ate more.","It was more expensive than the other packets of biscuits.","The biscuits had much less sugar than the label said."],"answer_index":1,"explanation":"The text says the information \"was for two biscuits\" and \"I usually eat four or five\"."},{"id":"q4","type":"mcq","skill":"reading.detail","prompt":"What does the writer buy now instead of fruit yoghurt?","options":["No yoghurt at all, only fresh fruit from the market","Plain yoghurt, and they add fresh fruit at home","Fruit yoghurt that has less sugar in it","Plain yoghurt with a little sugar and honey"],"answer_index":1,"explanation":"The text says: \"now I buy plain yoghurt and add fresh fruit at home.\""},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"I compared two kinds of yoghurt\", \"compared\" means...","options":["bought both of them to try them at home","looked at them to see how they are different","mixed them together in one big bowl","put them back on the shelf in the shop"],"answer_index":1,"explanation":"The writer looked at both yoghurts and found that the fruit one \"had a lot of sugar\", so \"compared\" means looked at the differences."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'weather-words-you-need',
      'Weather Words You Actually Need',
      'A hiking club leader explains the weekend weather forecast and changes the walking plans.',
      $md$Hi everyone,

Here is the weather forecast for our trip to the Chimgan mountains this weekend.

On Friday evening, there will be heavy rain in the city and strong winds in the mountains. Please don't travel on Friday night.

On Saturday morning, it will be cloudy and cool, about 12 degrees. In the afternoon, the sun will come out, and it will be warmer. This is the best time for our walk, so we will meet at the bus station at 7:00 and start walking at 10:00.

On Sunday, the forecast says there will be a sudden temperature drop. It may fall to 2 degrees at night, and there may be snow on the higher paths. We will not go to the top. Instead, we will take a short, easy path near the river and come back to the city by 15:00.

Please bring a warm jacket, a raincoat and good walking boots. Mountain weather changes quickly!

Nodira, Hiking Club leader$md$,
      'A2', 'Everyday', 'weather', 'mint', 2, false, 'published', 220,
      '{"seeded_by":"20261022120200_reading_library_a2","genre":"message","writing_tone":"informative","word_count":161}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"Why does Nodira write this message?","options":["To explain the weekend weather and the club's plans","To invite new people to join the hiking club","To cancel the weekend trip","To sell walking boots"],"answer_index":0,"explanation":"Nodira gives the forecast for each day and explains what the group will do because of the weather."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"What will the weather be like in the mountains on Friday evening?","options":["Sunny and warm","Very windy","Snowy and cold","Cloudy and cool"],"answer_index":1,"explanation":"The message says there will be \"strong winds in the mountains\" on Friday evening."},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"When will the group start walking on Saturday?","options":["At 10:00","At 7:00","At 15:00","In the evening"],"answer_index":0,"explanation":"The message says: \"we will meet at the bus station at 7:00 and start walking at 10:00.\""},{"id":"q4","type":"mcq","skill":"reading.detail","prompt":"Why will the group not go to the top on Sunday?","options":["The bus back to the city leaves very early on Sunday.","It will be very cold, and there may be snow on the higher paths.","The top of the mountain is closed to walkers at weekends.","There will be heavy rain and strong winds all day on Sunday."],"answer_index":1,"explanation":"The message says it \"may fall to 2 degrees at night, and there may be snow on the higher paths. We will not go to the top.\""},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"If there is \"a sudden temperature drop\", the temperature...","options":["goes up slowly","stays the same","goes down quickly","goes up and down every hour"],"answer_index":2,"explanation":"After the \"sudden temperature drop\", it \"may fall to 2 degrees\", so the temperature goes down quickly."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'a2-email-to-my-host-family',
      'An Email to My Host Family',
      'An exchange student writes to the family she will live with in England.',
      $md$Dear Mr and Mrs Collins,

My name is Malika Yusupova, and I am your new exchange student. I am nineteen years old, and I study economics at a university in Tashkent. I'm very excited about my three months in Manchester!

My flight arrives at Manchester Airport on 3 October at 14:30. The university says a student helper will meet me at the airport and bring me to your house, so you don't need to come.

Let me tell you a little about myself. I love cooking, and I would like to make Uzbek food for you one evening. I also enjoy walking and taking photos. I don't drink coffee, but I drink a lot of tea!

I have one question. Is it cold in Manchester in October? I don't know what clothes to bring.

I'm looking forward to meeting you and your daughter, Emma.

Best wishes,

Malika$md$,
      'A2', 'Travel', 'study abroad', 'sky', 1, false, 'published', 230,
      '{"seeded_by":"20261022120200_reading_library_a2","genre":"email","writing_tone":"friendly","word_count":147}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the main purpose of Malika's email?","options":["To ask the Collins family to meet her at the airport","To book a room in a hotel near the university","To introduce herself to her host family before she arrives","To invite the Collins family to visit her in Tashkent"],"answer_index":2,"explanation":"Malika writes \"Let me tell you a little about myself\" and gives information about her arrival."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"Who will meet Malika at the airport?","options":["Mr and Mrs Collins","A student helper from the university","Their daughter, Emma","Nobody, because she will take a taxi"],"answer_index":1,"explanation":"The email says: \"a student helper will meet me at the airport\"."},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"How long will Malika stay in Manchester?","options":["Three weeks","Three days","One year","Three months"],"answer_index":3,"explanation":"Malika writes: \"I'm very excited about my three months in Manchester!\""},{"id":"q4","type":"mcq","skill":"reading.detail","prompt":"What does Malika want to know?","options":["What time her flight arrives in Manchester","Where her university in Manchester is","If the family likes eating Uzbek food","If it is cold in Manchester in October"],"answer_index":3,"explanation":"Malika asks: \"Is it cold in Manchester in October? I don't know what clothes to bring.\""},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"When Malika writes \"I'm looking forward to meeting you\", she means that she...","options":["is worried and nervous about meeting them","has already met them in Tashkent","doesn't really want to meet them","is happy and excited about meeting them"],"answer_index":3,"explanation":"The whole email is friendly and excited, so \"looking forward to\" means she is happy about meeting them in the future."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'a2-part-time-job-cafe-assistant',
      'Part-Time Job: Café Assistant',
      'A job advert describes a part-time job at a busy café near a university.',
      $md$Green Leaf Café is looking for a friendly part-time assistant.

We are a busy café near the university. We serve fresh salads, soups, sandwiches and cakes, and many of our customers are students and office workers.

What will you do? You will take orders, serve food and drinks, and keep the café clean. At busy times, you may also help in the kitchen.

When will you work? Three evenings a week, from 17:00 to 22:00, and one day at the weekend. We can change your hours during exams.

What do you need? You need to be over 18 and good with people. Experience is useful, but it isn't necessary, because we give full training. You should speak Uzbek and Russian. Some English is a plus, because we have a lot of foreign visitors.

What do we offer? Good pay, a free meal on every shift and a friendly team.

To apply, send a short message about yourself to the manager, Shahzoda, or visit the café between 10:00 and 12:00 and ask for her.$md$,
      'A2', 'Work', 'job adverts', 'peach', 2, false, 'published', 240,
      '{"seeded_by":"20261022120200_reading_library_a2","genre":"advert","writing_tone":"informative","word_count":173}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is this text?","options":["A menu for a café","An advert for a job at a café","A review of a café","An email from a customer"],"answer_index":1,"explanation":"The text begins: \"Green Leaf Café is looking for a friendly part-time assistant\" and explains how to apply."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"What are the hours of the evening shifts?","options":["From 10:00 to 12:00","From 12:00 to 17:00","From 18:00 to 23:00","From 17:00 to 22:00"],"answer_index":3,"explanation":"The advert says: \"Three evenings a week, from 17:00 to 22:00\"."},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"Why can people with no experience apply?","options":["The café gives full training.","The job is only at weekends.","The café is near the university.","The manager speaks English."],"answer_index":0,"explanation":"The advert says experience \"isn't necessary, because we give full training.\""},{"id":"q4","type":"mcq","skill":"reading.detail","prompt":"Why is English useful in this job?","options":["The menu at the café is only in English.","A lot of foreign visitors come to the café.","The manager, Shahzoda, is from abroad.","All the training for the job is in English."],"answer_index":1,"explanation":"The advert says: \"Some English is a plus, because we have a lot of foreign visitors.\""},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"Experience is useful, but it isn't necessary\", \"necessary\" means...","options":["possible","interesting","needed","expensive"],"answer_index":2,"explanation":"People without experience can get the job because the café trains them, so experience is not needed."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'a2-my-first-online-class',
      'My First Online Class',
      'A learner describes the problems and fun of their first online English class.',
      $md$Last week, I had my first online English class. I was very nervous before it started.

The class began at 7 p.m., but I turned on my laptop at 6:30 because I wanted to check everything. First, my camera didn't work. I tried for ten minutes, and then I found the problem: there was a small cover on the camera! Next, my microphone was too quiet, so I borrowed my brother's headphones.

There were eight students in the class, from four different countries. Our teacher, Ms Harris, was very kind. She asked us to say our names and one interesting thing about ourselves. I said that I can play the dutar, a traditional instrument. Everyone wanted to hear it, so I promised to play next week.

The hardest part was speaking. Sometimes two people talked at the same time, and then everyone stopped and laughed.

After the class, I felt tired but happy. Next time, I will be less nervous, and I will remember to check the camera cover!$md$,
      'A2', 'Technology', 'online learning', 'lavender', 2, true, 'published', 250,
      '{"seeded_by":"20261022120200_reading_library_a2","genre":"story","writing_tone":"narrative","word_count":169}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the text mainly about?","options":["How to buy a good laptop","The writer's experience of a first online class","How to play the dutar","Why online classes are better than classes at school"],"answer_index":1,"explanation":"The writer describes what happened before, during and after their first online class."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"What was the problem with the camera?","options":["It was broken.","It belonged to the writer's brother.","The teacher couldn't see the screen.","There was a small cover on it."],"answer_index":3,"explanation":"The text says: \"I found the problem: there was a small cover on the camera!\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"How many students were in the class?","options":["Four","Ten","Seven","Eight"],"answer_index":3,"explanation":"The text says: \"There were eight students in the class, from four different countries.\""},{"id":"q4","type":"mcq","skill":"reading.detail","prompt":"What did the writer promise to do?","options":["Buy new headphones","Teach the class next week","Turn on the laptop at 6:30 next time","Play the dutar next week"],"answer_index":3,"explanation":"The text says: \"Everyone wanted to hear it, so I promised to play next week.\""},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"I borrowed my brother's headphones\", \"borrowed\" means the writer...","options":["bought them from him for a very good price","broke them by mistake at the start of the class","used them for a short time and will give them back","gave them to him as a birthday present"],"answer_index":2,"explanation":"The headphones belong to the writer's brother. The writer used them for the class, so \"borrowed\" means used them for a short time."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'a2-getting-ready-for-navruz',
      'Getting Ready for Navruz',
      'A young person describes how their neighbourhood prepares for the spring holiday of Navruz.',
      $md$Navruz, on 21 March, is one of my favourite holidays. It celebrates the start of spring, and in Uzbekistan, people get ready for it for many days.

In our neighbourhood, the preparations start about a week before. People clean their houses and gardens, and some families plant new trees or flowers. My mother says we should start the new year with a clean home.

The most important part for me is sumalak. It is a sweet, brown dish made from young wheat. The women in our street cook it together in a huge pot in the courtyard. They stir it all night, and they sing and tell stories while they work. We children try to stay awake, but we usually fall asleep before midnight!

On the day of Navruz, we visit relatives and neighbours, and we share sumalak and other food with them. In the park, there are concerts, games and people in colourful traditional clothes.

For me, Navruz is about new beginnings and spending time with the people I love.$md$,
      'A2', 'Culture', 'holidays', 'sand', 2, false, 'published', 260,
      '{"seeded_by":"20261022120200_reading_library_a2","genre":"personal text","writing_tone":"narrative","word_count":171}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the text mainly about?","options":["How the writer's family and neighbours prepare for and celebrate Navruz","How to cook sumalak at home in a small pot with the family","A spring trip to the park to watch concerts and play games","How people in other countries celebrate the start of the new year"],"answer_index":0,"explanation":"The writer describes the preparations before Navruz and what happens on the day."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"What do people do about a week before Navruz?","options":["They wear traditional clothes in the park.","They go to concerts in the park.","They visit relatives and neighbours.","They clean their houses and gardens."],"answer_index":3,"explanation":"The text says the preparations start \"about a week before. People clean their houses and gardens\"."},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"What is sumalak made from?","options":["Rice and meat","Apples and sugar","Young wheat","Milk and eggs"],"answer_index":2,"explanation":"The text says sumalak is \"a sweet, brown dish made from young wheat\"."},{"id":"q4","type":"mcq","skill":"reading.detail","prompt":"What usually happens to the children on the night the women cook sumalak?","options":["They fall asleep before midnight.","They stir the pot all night.","They sing songs in the park.","They visit their neighbours."],"answer_index":0,"explanation":"The text says: \"We children try to stay awake, but we usually fall asleep before midnight!\""},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"They stir it all night\", \"stir\" means...","options":["taste it again and again","move it around with a spoon","sell it to neighbours","keep it in a cold place"],"answer_index":1,"explanation":"The women are cooking sumalak in a huge pot, so they move it around with a spoon while it cooks."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'a2-how-to-use-city-bikes',
      'How to Use the City Bikes',
      'A guide explains how to rent a shared bike in the city centre, what it costs and the rules.',
      $md$Welcome to City Bikes! Our green bikes are a cheap, healthy and clean way to travel around the city centre.

How does it work? First, download the City Bikes app and add your bank card. Then find a bike station on the map in the app. There are forty stations in the centre, near metro stations, parks and universities.

To start your ride, scan the code on the bike with your phone. The lock opens automatically. When you finish, return the bike to any station and close the lock. Please check that the light on the lock is green.

How much does it cost? The first 30 minutes of every ride are free. After that, you pay 3,000 soum for every 30 minutes.

Some important rules: You must be 16 or older to use City Bikes. Please ride on the bike paths, not on the pavement. Wear a helmet if you have one. Don't leave a bike in the street, because you will pay a fine.

Enjoy your ride!$md$,
      'A2', 'Environment', 'transport', 'lime', 2, false, 'published', 270,
      '{"seeded_by":"20261022120200_reading_library_a2","genre":"guide","writing_tone":"informative","word_count":169}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the text mainly about?","options":["How to use a bike-sharing service in the city","How to repair a bike when it is broken","Where to buy a cheap bike in the city","A bike race for everyone in the city centre"],"answer_index":0,"explanation":"The guide explains how to start and finish a ride, the prices and the rules for City Bikes."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"How do you open the lock on a bike?","options":["You use a key from the metro station.","You call the City Bikes office.","You press the green light.","You scan the code on the bike with your phone."],"answer_index":3,"explanation":"The guide says: \"scan the code on the bike with your phone. The lock opens automatically.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"How much does a 20-minute ride cost?","options":["Nothing","3,000 soum","6,000 soum","1,500 soum"],"answer_index":0,"explanation":"The guide says: \"The first 30 minutes of every ride are free.\""},{"id":"q4","type":"mcq","skill":"reading.detail","prompt":"What happens if you leave a bike in the street?","options":["You get a free ride.","You must buy the bike.","You pay a fine.","You cannot use the app again."],"answer_index":2,"explanation":"The guide says: \"Don't leave a bike in the street, because you will pay a fine.\""},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"ride on the bike paths, not on the pavement\", the \"pavement\" is...","options":["the path next to a road where people walk","the place where you return the bike","the part of the road for cars and buses","the station where you take the metro"],"answer_index":0,"explanation":"The guide tells riders to use the bike paths and not the pavement, the place for people who are walking."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'a2-message-from-the-coach',
      'A Message from the Football Coach',
      'A football coach writes to his young team about their last game, training and the next match.',
      $md$Hello, team!

Great game on Sunday! We didn't win, but you all played well, and I'm proud of you. The score was 2-1, and their second goal came in the last minute, so it was very close.

Here is some news for this week.

Training: On Tuesday, we will train at the school stadium as usual, from 17:00 to 18:30. On Thursday, the stadium is closed, so we will train in the sports hall. Please bring indoor shoes, not football boots.

Health: Some of you looked very tired in the second half. Please sleep well before games, eat a good breakfast and drink plenty of water. Don't have energy drinks before training.

Next game: Our next game is on Saturday at 11:00, against Olympic Youth. It's an away game, so we will go there by bus. The bus leaves from the school gate at 9:30. Please don't be late!

Coach Timur$md$,
      'A2', 'Health', 'sport', 'mint', 2, false, 'published', 280,
      '{"seeded_by":"20261022120200_reading_library_a2","genre":"message","writing_tone":"friendly","word_count":151}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the main purpose of the coach's message?","options":["To tell the players that the team will close next week","To invite the players' parents to a party on Saturday","To talk about the last game and give information about the week","To explain the rules of football to new players"],"answer_index":2,"explanation":"Coach Timur comments on Sunday's game and then gives news about training, health and the next game."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"Where will the team train on Thursday?","options":["In the sports hall","At the school stadium","At Olympic Youth's stadium","In the park"],"answer_index":0,"explanation":"The message says: \"On Thursday, the stadium is closed, so we will train in the sports hall.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"What advice does the coach give about health?","options":["Have an energy drink before every training session and game.","Sleep well, eat a good breakfast and drink plenty of water.","Train every day, even on days when you feel very tired.","Eat a big lunch just before you play in every game."],"answer_index":1,"explanation":"The message says: \"Please sleep well before games, eat a good breakfast and drink plenty of water.\""},{"id":"q4","type":"mcq","skill":"reading.detail","prompt":"What time does the bus leave on Saturday?","options":["At 9:30","At 11:00","At 17:00","At 18:30"],"answer_index":0,"explanation":"The message says: \"The bus leaves from the school gate at 9:30.\""},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In the message, \"an away game\" is a game that...","options":["the team doesn't play","is played at your own school","is played at the other team's place","is played without fans"],"answer_index":2,"explanation":"The coach says \"It's an away game, so we will go there by bus\", so the game is at the other team's place."}]$q$::jsonb
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
  0.30,
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
  jsonb_build_object('seeded_by', '20261022120200_reading_library_a2'),
  ra.created_by,
  ra.updated_by
from public.reading_articles ra
join public.products p on p.id = ra.product_id
join public.languages l on l.id = ra.language_id
where lower(coalesce(p.metadata->>'slug', '')) = 'english-reading'
  and l.code = 'en'
  and ra.slug in ('grocery-label-choices', 'weather-words-you-need', 'a2-email-to-my-host-family', 'a2-part-time-job-cafe-assistant', 'a2-my-first-online-class', 'a2-getting-ready-for-navruz', 'a2-how-to-use-city-bikes', 'a2-message-from-the-coach')
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
